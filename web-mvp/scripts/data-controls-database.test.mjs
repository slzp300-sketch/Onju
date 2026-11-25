import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import { loadCostHandler } from '../qa/edge-handler-harness.mjs'

const require = createRequire(new URL('../qa/session-db/package.json', import.meta.url))
const { PGlite } = require('@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const db = new PGlite()
const token = 'test-owner-'.repeat(5), otherToken = 'other-owner-'.repeat(5)
const hash = createHash('sha256').update(token).digest('hex')
const idA = crypto.randomUUID(), idB = crypto.randomUUID(), expired = crypto.randomUUID(), legacy = crypto.randomUUID()
const rpc = async (name, id, h = hash) => (await db.query(`select public.${name}($1::uuid,$2::text) as result`, [id,h])).rows[0].result
const snapshot = (id, h) => rpc('web_mvp_export_owned_session', id, h)
before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
  const directory = resolve(root, 'logs/sites/onju-web-mvp/supabase/migrations')
  const files = (await readdir(directory)).filter(name => /^00\d\d_.*\.sql$/.test(name) && Number(name.slice(0,4)) >= 7).sort()
  for (const name of files) await db.exec(await readFile(resolve(directory,name),'utf8'))
  await db.exec(await readFile(resolve(root,'supabase/migrations/0020_web_mvp_metrics.sql'),'utf8'))
  await db.query("insert into web_mvp_agent_sessions(session_id,access_token_hash,expires_at) values ($1,$2,now()-interval '1 day')",[expired,hash])
  await db.query('insert into web_mvp_agent_sessions(session_id) values ($1)',[legacy])
  for (const name of ['202609150001_web_mvp_session_ownership.sql','202609150002_web_mvp_cost_control.sql','202609150003_web_mvp_regional_context.sql','202609150004_web_mvp_data_controls.sql']) {
    await db.exec(await readFile(resolve(root,'supabase/migrations',name),'utf8'))
  }
  await db.exec(await readFile(resolve(root,'supabase/migrations/202609150004_web_mvp_data_controls.sql'),'utf8'))
  for (const id of [idA,idB]) {
    await rpc('web_mvp_authorize_session',id)
    await db.query("update web_mvp_agent_sessions set messages=$2::jsonb,agent_v2_context=$3::jsonb where session_id=$1",
      [id,JSON.stringify([{id:crypto.randomUUID(),role:'user',text:id===idA?'MY CHAT':'OTHER CHAT'}]),JSON.stringify({memory:{facts:['my preference']},feedback:[{reason:'help'}],processedTurns:[{secret:'internal'}],draft:{response_id:'private-pointer',title:'goal'}})])
    await db.query("insert into web_mvp_daily_logs(session_id,log_date) values ($1,'2026-09-15')",[id])
    await db.query("insert into web_mvp_diagnostic_reports(session_id,feedback_message_id,route,category,messages) values ($1,$2,'setup','confusing',$3::jsonb)",[id,crypto.randomUUID(),JSON.stringify([{role:'user',text:'consented '+id}])])
  }
})
after(async()=>db.close())

test('export returns only owned collections and public memory without changing expiry',async()=>{
  const before=(await db.query('select expires_at,updated_at from web_mvp_agent_sessions where session_id=$1',[idA])).rows[0]
  const data=await snapshot(idA)
  assert.equal(data.version,1); assert.equal(data.sessionId,idA)
  assert.equal(data.session.messages[0].text,'MY CHAT')
  assert.equal(data.session.context.feedback[0].reason,'help')
  assert.equal(data.session.access_token_hash,undefined)
  assert.equal(data.session.context.processedTurns,undefined)
  assert.equal(data.collections.web_mvp_daily_logs.length,1)
  assert.equal(data.collections.web_mvp_diagnostic_reports.length,1)
  assert.equal(data.collections.web_mvp_learning_reviews.length,1)
  assert.ok(!JSON.stringify(data).includes('OTHER CHAT'))
  for(const rows of Object.values(data.collections)) for(const row of rows) if(row.session_id) assert.equal(row.session_id,idA)
  assert.deepEqual((await db.query('select expires_at,updated_at from web_mvp_agent_sessions where session_id=$1',[idA])).rows[0],before)
})
test('export ownership, missing, legacy and expired sessions fail closed without creating or renewing',async()=>{
  assert.equal((await snapshot(idA,'b'.repeat(64))).error,'session_forbidden')
  assert.equal((await snapshot(idA,'')).error,'invalid_session_token')
  assert.equal((await snapshot(legacy)).error,'session_recovery_required')
  assert.equal((await snapshot(crypto.randomUUID())).error,'session_not_found')
  assert.equal((await snapshot(expired)).sessionId,expired)
  assert.equal(await rpc('web_mvp_authorize_session',expired),'session_expired')
})
test('export RPC is restricted to service role',async()=>{
  for(const role of ['anon','authenticated']) {
    assert.equal((await db.query("select has_function_privilege($1,'web_mvp_export_owned_session(uuid,text)','execute') as allowed",[role])).rows[0].allowed,false)
  }
})
test('new linked tables stop the export rather than silently omit data',async()=>{
  await db.exec('create table qa_new_collection(session_id uuid references web_mvp_agent_sessions(session_id));')
  try { assert.equal((await snapshot(idA)).error,'export_schema_changed') }
  finally { await db.exec('drop table qa_new_collection') }
})
test('export row limits fail explicitly instead of truncating',async()=>{
  const id=crypto.randomUUID(); await rpc('web_mvp_authorize_session',id)
  await db.query("insert into web_mvp_daily_logs(session_id,log_date) select $1,date '2000-01-01'+i from generate_series(1,10001) i",[id])
  assert.equal((await snapshot(id)).error,'export_too_large')
  await rpc('web_mvp_delete_owned_session',id)
})
for(const base of [root,resolve(root,'logs/sites/onju-web-mvp')]) {
  test('real memory endpoint exports without claiming, provider calls or secret fields: '+base,async()=>{
    const calls=[]
    const bridge={rpc:async(name,params)=>{
      calls.push(name)
      return {data:await rpc(name,params.p_session_id,params.p_token_hash),error:null}
    },from(){throw new Error('Export must use the snapshot RPC only')}}
    const {handler,counts}=loadCostHandler(base,'onju-memory',bridge)
    const response=await handler(new Request('http://localhost/onju-memory',{method:'POST',body:JSON.stringify({sessionId:idA,sessionToken:token,action:'export_session'})}))
    assert.equal(response.status,200)
    assert.equal(response.headers.get('cache-control'),'no-store')
    const data=await response.json()
    assert.equal(data.snapshot.session.context.draft.title,'goal')
    assert.equal(data.snapshot.session.context.draft.response_id,undefined)
    assert.deepEqual(calls,['web_mvp_export_owned_session'])
    assert.equal(counts().providerCalls,0)
    const denied=await handler(new Request('http://localhost/onju-memory',{method:'POST',body:JSON.stringify({sessionId:idA,sessionToken:otherToken,action:'export_session'})}))
    assert.equal(denied.status,403)
    assert.ok(!JSON.stringify(await denied.json()).includes('MY CHAT'))
  })
}
test('deletion cascades through indirect diagnostics; another session remains; repeat/late first writes are safe',async()=>{
  assert.equal(await rpc('web_mvp_delete_owned_session',idA,'c'.repeat(64)),'session_forbidden')
  assert.equal(await rpc('web_mvp_delete_owned_session',idA),'deleted')
  assert.equal(await rpc('web_mvp_delete_owned_session',idA),'deleted')
  assert.equal((await snapshot(idA)).error,'session_revoked')
  assert.equal((await snapshot(idB)).session.messages[0].text,'OTHER CHAT')
  assert.equal((await db.query('select count(*)::int as count from web_mvp_learning_reviews')).rows[0].count,1)
  assert.equal(await rpc('web_mvp_authorize_session',idA),'session_revoked')
  const fresh=crypto.randomUUID()
  assert.equal(await rpc('web_mvp_delete_owned_session',fresh),'deleted')
  assert.equal(await rpc('web_mvp_authorize_session',fresh),'session_revoked')
  assert.equal(await rpc('web_mvp_delete_owned_session',fresh,'d'.repeat(64)),'session_forbidden')
})

