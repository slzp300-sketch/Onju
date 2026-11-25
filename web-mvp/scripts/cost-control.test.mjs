import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { bindAiCostContext, budgetedGenerate, dailyAiBudgetMicroUsd, estimateAiReservationMicroUsd, estimateObservedCost, providerRetryDelay } from '../../supabase/functions/_shared/webMvpCostControl.ts'
import { loadCostHandler } from '../qa/edge-handler-harness.mjs'
import { sha256, trustedRequestAddress, enforceWebMvpRateLimits, sessionAccessFailure } from '../../supabase/functions/_shared/webMvpAccess.ts'
import { sessionFailureMessage } from '../src/agentSession.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const require = createRequire(new URL('../qa/session-db/package.json', import.meta.url))
const { PGlite } = require('@electric-sql/pglite')
const sql = new PGlite()
const config = {}
globalThis.Deno = { env: { get: name => config[name] } }
const model = 'gpt-4.1-mini-2025-04-14'
const request = { model, input: 'Test only', max_output_tokens: 100 }
const response = (usage = { input_tokens: 10, output_tokens: 20 }) => ({ provider: 'openai', requestId: 'test', ok: true, status: 200, headers: new Headers(), data: { model, id: 'resp_test', output_text: 'preserved text', usage } })
const asRpc = () => ({ async rpc(name, args) {
  try {
    const parameters = Object.values(args)
    const placeholders = Object.keys(args).map((key, i) => `${key} => $${i + 1}`).join(',')
    const result = await sql.query(`select public.${name}(${placeholders}) as result`, parameters)
    return { data: result.rows[0].result, error: null }
  } catch(error) { return { data: null, error } }
} })
async function owner() {
  const id = crypto.randomUUID()
  await sql.query('select web_mvp_authorize_session($1,$2)', [id, 'a'.repeat(64)])
  return id
}
async function context(id, body = { message: 'test', turnId: crypto.randomUUID() }, scope = 'public') {
  id ??= await owner()
  const db = asRpc()
  bindAiCostContext(db, id, 'test', body, scope)
  return { db, id, body, scope }
}
async function resume(c) { return context(c.id, c.body, c.scope) }
async function rows(c) { return (await sql.query('select * from web_mvp_ai_calls where session_id=$1 order by created_at,id', [c.id])).rows }

before(async () => {
  await sql.exec('create role anon; create role authenticated; create role service_role bypassrls;')
  const directory = resolve(root, 'logs/sites/onju-web-mvp/supabase/migrations')
  for (const name of (await readdir(directory)).filter(name => /^00\d\d_.*\.sql$/.test(name) && Number(name.slice(0,4)) >= 7).sort()) await sql.exec(await readFile(resolve(directory,name),'utf8'))
  await sql.exec(await readFile(resolve(root,'supabase/migrations/202609150001_web_mvp_session_ownership.sql'),'utf8'))
  // Prove old spend is carried forward, not silently reset.
  await sql.exec("insert into web_mvp_ai_daily_budget(budget_date,actual_microusd,pending_microusd) values ('2020-01-01',11,22)")
  await sql.exec(await readFile(resolve(root,'supabase/migrations/202609150002_web_mvp_cost_control.sql'),'utf8'))
})
after(async () => { await sql.close(); delete globalThis.Deno })

test('zero pauses AI; malformed budgets never default to a larger allowance', () => {
  assert.equal(dailyAiBudgetMicroUsd(undefined),5_000_000)
  assert.equal(dailyAiBudgetMicroUsd('0'),0)
  for (const bad of ['-1','NaN','Infinity','101']) assert.throws(()=>dailyAiBudgetMicroUsd(bad),/config_invalid/)
})
test('exact price matching, cached/write tokens and unknown usage are not free', () => {
  assert.equal(estimateObservedCost(response().data,request),36)
  assert.equal(estimateObservedCost(response(undefined).data,request),36)
  assert.equal(estimateObservedCost({model},request),null)
  assert.equal(estimateObservedCost({model:'unknown',usage:{input_tokens:1,output_tokens:1}},request),null)
  assert.equal(estimateObservedCost({model,usage:{input_tokens:10,output_tokens:1,input_tokens_details:{cached_tokens:11}}},request),null)
  assert.equal(estimateObservedCost(response().data,{...request,tools:[{type:'web_search_preview'}]}),null)
  assert.throws(()=>estimateAiReservationMicroUsd({...request,model:'gpt-4.1-invented'}),/price_unavailable/)
  assert.ok(estimateAiReservationMicroUsd({...request,previous_response_id:'resp_owned'})>250000)
})

test('evaluation caller cap lowers but never raises configured limits, and public callers cannot select it', async () => {
  const limits=[]
  const db={async rpc(_name,args){limits.push(args.p_session_limit);return {data:{state:'session_limit'},error:null}}}
  config.ONJU_EVALUATION_SESSION_DAILY_BUDGET_USD='0.5'
  try {
    for (const [scope,cap,expected] of [['evaluation',1,500000],['evaluation',0.1,100000],['evaluation',0,0],['public',0,5000000]]) {
      bindAiCostContext(db,crypto.randomUUID(),'test',{evaluationBudgetUsd:cap},scope)
      await assert.rejects(budgetedGenerate(db,request,()=>{throw Error('provider must not be called')}),/session_budget/)
      assert.equal(limits.at(-1),expected)
    }
    for(const cap of ['1',-1,NaN,Infinity]) {
      bindAiCostContext(db,crypto.randomUUID(),'test',{evaluationBudgetUsd:cap},'evaluation')
      await assert.rejects(budgetedGenerate(db,request,()=>{throw Error('provider must not be called')}),/config_invalid/)
    }
  } finally {delete config.ONJU_EVALUATION_SESSION_DAILY_BUDGET_USD}
})

test('owned evaluation session accumulates costs and blocks the next reservation before provider dispatch', async()=>{
  const cheap={...request,max_output_tokens:10}
  const cap=(estimateAiReservationMicroUsd(cheap)+36-1)/1e6
  const c=await context(undefined,{turnId:crypto.randomUUID(),evaluationBudgetUsd:cap},'evaluation')
  await budgetedGenerate(c.db,cheap,async()=>response())
  const next=await context(c.id,{turnId:crypto.randomUUID(),evaluationBudgetUsd:cap},'evaluation')
  let calls=0
  await assert.rejects(budgetedGenerate(next.db,cheap,async()=>{calls++;return response()}),/session_budget/)
  assert.equal(calls,0)
})
test('unknown model and reservation-store failure stop before invoking the provider', async () => {
  const c=await context(); let calls=0
  await assert.rejects(budgetedGenerate(c.db,{model:'unpriced'},async()=>{calls++;return response()}),/price_unavailable/)
  const bad={async rpc(){return {data:null,error:new Error('offline')}}}
  bindAiCostContext(bad,c.id,'test',c.body)
  await assert.rejects(budgetedGenerate(bad,request,async()=>{calls++;return response()}),/cost_store/)
  assert.equal(calls,0)
})
test('concurrent duplicate: one fake provider call, then persisted replay without another bill', async () => {
  const c=await context(), duplicate=await resume(c); let calls=0, release, started
  const ready=new Promise(resolve=>{started=resolve})
  const waiting=new Promise(resolve=>{release=resolve})
  const first=budgetedGenerate(c.db,request,async()=>{calls++;started();await waiting;return response()})
  await ready
  await assert.rejects(budgetedGenerate(duplicate.db,request,async()=>{calls++;return response()}),/request_in_progress/)
  release(); const original=await first
  const retry=await resume(c)
  const replay=await budgetedGenerate(retry.db,request,async()=>{calls++;return response()})
  assert.equal(calls,1); assert.equal(replay.data.output_text,original.data.output_text)
  assert.equal(replay.data.onju_cost_replayed,true)
  assert.deepEqual(replay.data.usage,{input_tokens:0,output_tokens:0})
  assert.equal((await rows(c)).length,1)
})
test('same request ID with different input is rejected, never replayed to another session', async () => {
  const c=await context(); await budgetedGenerate(c.db,request,async()=>response())
  const changed=await context(c.id,{...c.body,message:'different'})
  await assert.rejects(budgetedGenerate(changed.db,request,async()=>response()),/request_changed/)
  const other=await context(await owner(),c.body)
  let calls=0; await budgetedGenerate(other.db,request,async()=>{calls++;return response()})
  assert.equal(calls,1)
})
test('timeout keeps the reservation and blocks automatic duplicate billing', async () => {
  const c=await context(); let calls=0
  const fake=async()=>{calls++;throw new Error('timeout')}
  await assert.rejects(budgetedGenerate(c.db,request,fake),/outcome_unknown/)
  const retry=await resume(c)
  await assert.rejects(budgetedGenerate(retry.db,request,fake),/outcome_unknown/)
  const [row]=await rows(c)
  assert.equal(calls,1); assert.equal(row.state,'unknown'); assert.equal(row.actual_microusd,null)
  assert.equal(row.charged_microusd,row.reserved_microusd)
})
test('5xx ambiguity is not silently retried and missing usage is held but reply still recoverable', async () => {
  const c=await context()
  await assert.rejects(budgetedGenerate(c.db,request,async()=>({...response(),ok:false,status:503,data:undefined})),/outcome_unknown/)
  const missing=await context()
  await budgetedGenerate(missing.db,request,async()=>({...response(),data:{model,output_text:'valid response without usage'}}))
  const [row]=await rows(missing)
  assert.equal(row.state,'completed'); assert.equal(row.actual_microusd,null); assert.equal(row.charged_microusd,row.reserved_microusd)
})
test('429 attempt counts remain recorded; bounded retry takes a fresh reservation', async () => {
  const c=await context()
  const rejected=await budgetedGenerate(c.db,request,async()=>({...response(),ok:false,status:429,data:undefined}))
  assert.equal(rejected.status,429)
  const retry=await resume(c)
  await budgetedGenerate(retry.db,request,async()=>response())
  const records=await rows(c)
  assert.equal(records.length,2)
  assert.equal(records.find(row=>row.state==='rejected').actual_microusd,null)
})
test('429 then success is one logical call: a lost reply reuses the successful attempt', async () => {
  const c=await context(); let calls=0
  await budgetedGenerate(c.db,request,async()=>{calls++;return {...response(),ok:false,status:429,data:undefined}})
  await budgetedGenerate(c.db,request,async()=>{calls++;return response()})
  const retry=await resume(c)
  const replay=await budgetedGenerate(retry.db,request,async()=>{calls++;return response()})
  assert.equal(replay.data.onju_cost_replayed,true); assert.equal(calls,2)
  assert.equal((await rows(c)).length,2)
})
test('an upper-layer catch cannot bypass an uncertain outcome with another model call', async () => {
  const c=await context(); let calls=0
  for(let i=0;i<3;i++) await assert.rejects(budgetedGenerate(c.db,request,async()=>{calls++;throw new Error('timeout')}),/outcome_unknown/)
  assert.equal(calls,1);assert.equal((await rows(c)).length,1)
})
test('simultaneous reservations across sessions cannot exceed the shared allowance', async () => {
  const db=asRpc(), scope='evaluation'
  const prior=Number((await sql.query("select charged_microusd from web_mvp_ai_cost_days where scope=$1 and budget_date=(now() at time zone 'Asia/Seoul')::date",[scope])).rows[0]?.charged_microusd ?? 0)
  const owners=await Promise.all([owner(),owner(),owner()])
  const results=await Promise.all(owners.map(async id=>db.rpc('web_mvp_begin_ai_call',{
    p_session_id:id,p_scope:scope,p_call_key:await sha256(id),p_payload_hash:await sha256('same'),
    p_reserved:100,p_daily_limit:prior+200,p_session_limit:1000,p_minute_calls:60,p_day_calls:600,
  })))
  assert.deepEqual(results.map(r=>r.data.state).sort(),['global_limit','reserved','reserved'])
})
test('session amounts and call counts apply across different surfaces, not only one endpoint', async () => {
  const id=await owner(), db=asRpc()
  const args={p_session_id:id,p_scope:'public',p_call_key:await sha256('one'),p_payload_hash:await sha256('p'),p_reserved:100,p_daily_limit:9999999,p_session_limit:150,p_minute_calls:60,p_day_calls:600}
  assert.equal((await db.rpc('web_mvp_begin_ai_call',args)).data.state,'reserved')
  assert.equal((await db.rpc('web_mvp_begin_ai_call',{...args,p_call_key:await sha256('two')})).data.state,'session_limit')
  assert.equal((await db.rpc('web_mvp_begin_ai_call',{...args,p_call_key:await sha256('three'),p_session_limit:1000,p_day_calls:1})).data.state,'rate_limit')
})
test('settlement is idempotent, missing IDs fail closed, and last-day cost stays on that day', async () => {
  const c=await context(); await budgetedGenerate(c.db,request,async()=>response())
  const [row]=await rows(c)
  const db=asRpc()
  assert.equal((await db.rpc('web_mvp_finish_ai_call',{p_id:row.id,p_state:'unknown',p_actual:999,p_response:null})).data,true)
  assert.equal((await rows(c))[0].charged_microusd,row.charged_microusd)
  assert.equal((await db.rpc('web_mvp_finish_ai_call',{p_id:crypto.randomUUID(),p_state:'unknown',p_actual:null,p_response:null})).data,false)
  const midnight=await context()
  const begin=await db.rpc('web_mvp_begin_ai_call',{p_session_id:midnight.id,p_scope:'public',p_call_key:await sha256('midnight'),p_payload_hash:await sha256('p'),p_reserved:100,p_daily_limit:9999999,p_session_limit:9999999,p_minute_calls:60,p_day_calls:600})
  assert.equal(begin.data.state,'reserved')
  // Controlled fixture relocation emulates an old reservation settling now.
  await sql.query("update web_mvp_ai_calls set budget_date='2020-01-01' where id=$1",[begin.data.id])
  await sql.exec("update web_mvp_ai_cost_days set charged_microusd=133 where scope='public' and budget_date='2020-01-01'")
  const today=(await sql.query("select charged_microusd from web_mvp_ai_cost_days where scope='public' and budget_date=(now() at time zone 'Asia/Seoul')::date")).rows[0].charged_microusd
  await db.rpc('web_mvp_finish_ai_call',{p_id:begin.data.id,p_state:'completed',p_actual:20,p_response:{ok:true,data:{}}})
  assert.equal((await sql.query("select charged_microusd from web_mvp_ai_cost_days where scope='public' and budget_date='2020-01-01'")).rows[0].charged_microusd,53)
  assert.equal((await sql.query("select charged_microusd from web_mvp_ai_cost_days where scope='public' and budget_date=(now() at time zone 'Asia/Seoul')::date")).rows[0].charged_microusd,today)
})
test('global/session/call-count limits are enforced and public/evaluation budgets stay separate', async () => {
  const c=await context(); config.ONJU_PUBLIC_DAILY_BUDGET_USD='0'
  await assert.rejects(budgetedGenerate(c.db,request,async()=>response()),/budget_exhausted/)
  delete config.ONJU_PUBLIC_DAILY_BUDGET_USD
  config.ONJU_SESSION_DAILY_BUDGET_USD='0'
  await assert.rejects(budgetedGenerate((await resume(c)).db,request,async()=>response()),/session_budget_exhausted/)
  delete config.ONJU_SESSION_DAILY_BUDGET_USD
  config.ONJU_AI_SESSION_MINUTE_CALLS='0'
  await assert.rejects(budgetedGenerate((await resume(c)).db,request,async()=>response()),/rate_limited/)
  delete config.ONJU_AI_SESSION_MINUTE_CALLS
  config.ONJU_EVALUATION_DAILY_BUDGET_USD='0'
  const e=await context(c.id,c.body,'evaluation')
  await assert.rejects(budgetedGenerate(e.db,request,async()=>response()),/budget_exhausted/)
  await budgetedGenerate((await resume(c)).db,request,async()=>response())
  delete config.ONJU_EVALUATION_DAILY_BUDGET_USD
})
test('cache deletion cascades but global spend cannot be reset by deleting a session', async () => {
  const c=await context(); await budgetedGenerate(c.db,request,async()=>response())
  const before=(await sql.query('select * from web_mvp_ai_cost_days order by scope,budget_date')).rows
  await sql.query('select web_mvp_delete_owned_session($1,$2)',[c.id,'a'.repeat(64)])
  assert.deepEqual(await rows(c),[])
  assert.deepEqual((await sql.query('select * from web_mvp_ai_cost_days order by scope,budget_date')).rows,before)
  await assert.rejects(budgetedGenerate(c.db,request,async()=>response()),/cost_store/)
})
test('RPCs and cached provider data cannot be read by browser roles', async () => {
  for(const role of ['anon','authenticated']) {
    assert.equal((await sql.query("select has_table_privilege($1,'web_mvp_ai_calls','select') as allowed",[role])).rows[0].allowed,false)
    assert.equal((await sql.query("select has_function_privilege($1,'web_mvp_finish_ai_call(uuid,text,bigint,jsonb)','execute') as allowed",[role])).rows[0].allowed,false)
  }
  assert.equal((await sql.query("select has_function_privilege('service_role','web_mvp_reserve_ai_budget(bigint,bigint)','execute') as allowed")).rows[0].allowed,false)
})
test('address limits require verified ingress config; no shared unknown-IP bucket', async () => {
  const req=new Request('http://localhost',{headers:{'cf-connecting-ip':'1.2.3.4','x-forwarded-for':'attacker, proxy'}})
  assert.equal(trustedRequestAddress(req,undefined),null)
  assert.equal(trustedRequestAddress(req,'cf-connecting-ip'),'1.2.3.4')
  assert.throws(()=>trustedRequestAddress(req,'x-forwarded-for'),/config_invalid/)
  const buckets=[]
  await enforceWebMvpRateLimits({async rpc(_name,args){buckets.push(args);return {data:true,error:null}}},req,'hash',{scope:'test',minute:2,day:10})
  assert.equal(buckets.length,2); assert.ok(buckets.every(b=>b.p_bucket_key.startsWith('session:')))
})
test('rate buckets cannot race on first use or reset using a supplied future timestamp', async () => {
  const db=asRpc(), args={p_bucket_key:'test:cost-stage-three',p_now:'2099-01-01T00:00:00Z',p_window_seconds:60,p_limit:1}
  assert.deepEqual((await Promise.all([db.rpc('web_mvp_consume_rate_limit',args),db.rpc('web_mvp_consume_rate_limit',args)])).map(r=>r.data),[true,false])
})
test('cost failures have safe Korean/English messages and HTTP statuses', () => {
  for(const code of ['ai_request_in_progress','ai_request_changed','ai_outcome_unknown','public_budget_exhausted','session_budget_exhausted','ai_cost_store_unavailable','ai_price_unavailable','rate_limited']) {
    assert.ok(sessionAccessFailure(code))
    assert.match(sessionFailureMessage(code),/입력은 보존/)
    assert.match(sessionFailureMessage(code,'en-US'),/input is kept/)
  }
})
test('provider wait hints are minimums; quota/auth/long waits never loop automatically', async () => {
  assert.equal(providerRetryDelay(new Headers({'retry-after':'30'})),30000)
  assert.equal(providerRetryDelay(new Headers({'retry-after-ms':'15000'})),15000)
  assert.equal(providerRetryDelay(new Headers({'retry-after':'Wed, 16 Sep 2026 00:00:00 GMT'}), Date.parse('2026-09-15T23:59:30Z')),30000)
  for(const failure of [
    {...response(),ok:false,status:429,errorCode:'insufficient_quota',data:undefined},
    {...response(),ok:false,status:401,data:undefined},
    {...response(),ok:false,status:429,data:undefined,headers:new Headers({'retry-after':'30'})},
  ]) {
    const c=await context()
    await assert.rejects(budgetedGenerate(c.db,request,async()=>failure),/provider_(action_required|deferred)/)
    assert.equal((await rows(c)).length,1)
  }
})
test('a settlement outage leaves the pending reservation charged and never returns unpersisted output', async () => {
  const c=await context(), real=c.db.rpc
  c.db.rpc=async(name,args)=>name==='web_mvp_finish_ai_call'?{data:null,error:new Error('lost connection')}:real(name,args)
  await assert.rejects(budgetedGenerate(c.db,request,async()=>response()),/cost_store/)
  const [row]=await rows(c)
  assert.equal(row.state,'reserved');assert.equal(row.actual_microusd,null)
  assert.equal(row.charged_microusd,row.reserved_microusd)
  await sql.query("update web_mvp_ai_calls set created_at=now()-interval '4 minutes' where id=$1",[row.id])
  const retry=await resume(c)
  await assert.rejects(budgetedGenerate(retry.db,request,async()=>response()),/outcome_unknown/)
})
for(const [base,endpoints] of [['',['onju-agent-v2','onju-agent','onju-goal-agent','onju-plan-agent','onju-plan-revision-agent']],['logs/sites/onju-web-mvp',['onju-agent-v2','onju-plan-agent','onju-plan-revision-agent']]]) for(const endpoint of endpoints) {
  test(`${base || 'root'}/${endpoint}: real handler returns a budget denial without provider traffic`,async()=>{
    let reservations=0
    const db={
      async rpc(name){
        if(name==='web_mvp_authorize_session')return {data:'authorized',error:null}
        if(name==='web_mvp_begin_ai_call'){reservations++;return {data:{state:'global_limit'},error:null}}
        if(name==='web_mvp_consume_rate_limit')return {data:true,error:null}
        throw new Error('Unexpected RPC '+name)
      },
      from(){const q={select(){return q},eq(){return q},gt(){return q},gte(){return q},order(){return q},limit(){return q},async maybeSingle(){return {data:null,error:null}},then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};return q},
    }
    const h=loadCostHandler(resolve(root,base),endpoint,db)
    const body={sessionId:crypto.randomUUID(),sessionToken:'a'.repeat(64),message:'평일은 6시에 일어나요',turnId:crypto.randomUUID(),currentPlan:[{id:'item',title:'Test',dayIndex:0,start:'10:00',end:'11:00'}],goalCard:{outcome:'Test',weeklyActions:[{title:'Test',frequencyPerWeek:1,durationMinutes:30,preferredDays:[0]}]}}
    const res=await h.handler(new Request('http://localhost/'+endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}))
    assert.equal(res.status,429,JSON.stringify(await res.clone().json()))
    assert.equal((await res.json()).error,'public_budget_exhausted')
    assert.equal(reservations,1);assert.equal(h.counts().providerCalls,0)
  })
}
test('both trees use the same ledger/helper; endpoint inventory has no bare provider transport', async () => {
  for(const path of ['supabase/functions/_shared/webMvpCostControl.ts','supabase/migrations/202609150002_web_mvp_cost_control.sql']) assert.equal((await readFile(resolve(root,path),'utf8')).replaceAll('\r\n','\n'),(await readFile(resolve(root,'logs/sites/onju-web-mvp',path),'utf8')).replaceAll('\r\n','\n'))
  for(const [base,endpoints] of [['',['onju-agent-v2','onju-agent','onju-goal-agent','onju-plan-agent','onju-plan-revision-agent','onju-daily']],['logs/sites/onju-web-mvp',['onju-agent-v2','onju-plan-agent','onju-plan-revision-agent','onju-daily']]]) {
    for(const endpoint of endpoints) {
      const source=await readFile(resolve(root,base,'supabase/functions',endpoint,'index.ts'),'utf8')
      assert.match(source,/bindAiCostContext\(db,/)
      assert.doesNotMatch(source,/await fetch\(|await (?:gateway|selectedGateway)\.generate\(/)
      assert.doesNotMatch(source,/reserveWebMvpAiBudget|settleWebMvpAiBudgetSafely/)
    }
  }
})
