import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { claimWebMvpSession, deleteOwnedWebMvpSession, sessionAccessFailure, sha256 } from '../../supabase/functions/_shared/webMvpAccess.ts'
import { ownedPreviousResponse, recordOwnedResponse } from '../../supabase/functions/_shared/webMvpResponseOwner.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const site = resolve(root, 'logs/sites/onju-web-mvp')
const ts = createRequire(import.meta.url)('typescript')
const id = '11111111-1111-4111-8111-111111111111', otherId = '22222222-2222-4222-8222-222222222222'
const token = 'a'.repeat(64), otherToken = 'b'.repeat(64)
const pairKey = 'onju-web-mvp-session-v2'
let clientIndex = 0
const storage = (seed = {}) => {
  const map = new Map(Object.entries(seed))
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: key => map.delete(key), map }
}
async function client(seed = {}) {
  globalThis.localStorage = storage(seed)
  return import(new URL('../src/agentSession.ts?test=' + (++clientIndex), import.meta.url))
}
test('new browser stores a stable UUID/token pair and ignores caller identity overrides', async () => {
  const c = await client(), sessionId = c.getAgentSessionId(), secret = c.getAgentSessionToken()
  assert.match(secret, /^[a-f0-9]{64}$/)
  assert.equal(c.getAgentSessionId(), sessionId)
  assert.equal(c.getAgentSessionToken(), secret)
  const body = c.withAgentSession(sessionId, { sessionId: otherId, sessionToken: otherToken, action: 'load' })
  const { regionalContext, ...identityAndAction } = body
  assert.deepEqual(identityAndAction, { sessionId, sessionToken: secret, action: 'load' })
  assert.ok(regionalContext.timeZone)
})
test('valid legacy pair is preserved, not rotated', async () => {
  const c = await client({ 'onju-web-mvp-session-id': id, 'onju-web-mvp-session-token': token })
  assert.equal(c.getAgentSessionId(), id)
  assert.equal(c.withAgentSession(id).sessionToken, token)
})
test('legacy UUID without a token is never silently claimed', async () => {
  const c = await client({ 'onju-web-mvp-session-id': id })
  assert.equal(c.getAgentSessionId(), id)
  assert.throws(() => c.withAgentSession(id), /session_recovery_required/)
  assert.equal(localStorage.getItem('onju-web-mvp-session-token'), null)
})
test('corrupt saved credentials remain intact and do not crash ID initialization', async () => {
  const c = await client({ [pairKey]: '{broken' })
  const sessionId = c.getAgentSessionId()
  assert.throws(() => c.withAgentSession(sessionId), /session_recovery_required/)
  assert.equal(localStorage.getItem(pairKey), '{broken')
})
test('another tab changing the pair rejects requests from the old screen', async () => {
  const c = await client({ [pairKey]: JSON.stringify({ id, token }) })
  assert.equal(c.getAgentSessionId(), id)
  localStorage.setItem(pairKey, JSON.stringify({ id: otherId, token: otherToken }))
  assert.throws(() => c.withAgentSession(id), /session_changed/)
})
test('paused deletion blocks saves but permits idempotent deletion retry', async () => {
  const c = await client({ [pairKey]: JSON.stringify({ id, token }) })
  c.pauseAgentSession(id)
  assert.throws(() => c.withAgentSession(id, { action: 'save' }), /session_revoked/)
  assert.equal(c.withAgentSession(id, { action: 'delete_session' }, true).sessionId, id)
})
test('local plan is scoped, and late writes cannot overwrite the new session', async () => {
  const c = await client({ [pairKey]: JSON.stringify({ id, token }) })
  c.writeSessionLocalState('plan', id, 'old plan')
  const next = c.resetAgentSession()
  c.writeSessionLocalState('plan', id, 'late old write')
  assert.equal(c.readSessionLocalState('plan', next), null)
  assert.equal(localStorage.getItem('plan:' + id), 'old plan')
})
test('legacy local state is imported once for its owner, not for a new conversation', async () => {
  const c = await client({ [pairKey]: JSON.stringify({ id, token }), plan: 'legacy plan' })
  assert.equal(c.readSessionLocalState('plan', id), 'legacy plan')
  const next = c.resetAgentSession()
  assert.equal(c.readSessionLocalState('plan', next), null)
})
test('blocked storage keeps an in-memory pair and a safe empty cache', async () => {
  const c = await client()
  globalThis.localStorage = { getItem(){throw new Error('blocked')}, setItem(){throw new Error('blocked')}, removeItem(){throw new Error('blocked')} }
  const sessionId = c.getAgentSessionId()
  assert.equal(c.getAgentSessionId(), sessionId)
  assert.equal(c.readSessionLocalState('plan', sessionId), null)
})
test('malformed credentials do not reach the database', async () => {
  const db = { rpc(){ assert.fail('RPC must not run') } }
  await assert.rejects(claimWebMvpSession(db, id, ''), /invalid_session_token/)
  await assert.rejects(claimWebMvpSession(db, 'invalid', token), /invalid_session/)
})
test('authorization transmits only the hash and fails closed on unknown results', async () => {
  let args
  const db = { async rpc(name, values){ args = { name, values }; return {data:'authorized',error:null} } }
  assert.equal(await claimWebMvpSession(db, id, token), await sha256(token))
  assert.equal(args.name, 'web_mvp_authorize_session')
  assert.equal(args.values.p_token_hash, await sha256(token))
  assert.ok(!JSON.stringify(args).includes(token))
  await assert.rejects(claimWebMvpSession({ rpc: async()=>({data:null,error:null}) },id,token), /session_authorization_failed/)
  await assert.rejects(claimWebMvpSession({ rpc: async()=>({data:null,error:new Error('missing RPC')}) },id,token), /missing RPC/)
})
for (const code of ['session_forbidden','session_recovery_required','session_expired','session_revoked']) {
  test('DB denial remains a denial: ' + code, async () => {
    await assert.rejects(claimWebMvpSession({ rpc: async()=>({data:code,error:null}) },id,token), new RegExp(code))
    assert.ok([403,410].includes(sessionAccessFailure(code).status))
  })
}
test('delete uses a separate ownership RPC, never creates or renews a session', async () => {
  const calls = []
  const db = { async rpc(name, args){calls.push({name,args}); return {data:'deleted',error:null}} }
  await deleteOwnedWebMvpSession(db,id,token)
  await deleteOwnedWebMvpSession(db,id,token)
  assert.deepEqual(calls.map(c=>c.name), ['web_mvp_delete_owned_session','web_mvp_delete_owned_session'])
})

test('previous provider responses must have server-recorded session ownership', async () => {
  const saved=[]
  const db={from(table){
    assert.equal(table,'web_mvp_provider_responses')
    const filters=[]
    const q={select(){return q},eq(key,value){filters.push(row=>row[key]===value);return q},async maybeSingle(){return {data:saved.find(row=>filters.every(f=>f(row))),error:null}}}
    return {...q,async insert(row){saved.push(row);return {error:null}}}
  }}
  assert.equal(await ownedPreviousResponse(db,id,undefined),undefined)
  await assert.rejects(ownedPreviousResponse(db,id,'resp_unknown'),/response_not_owned/)
  await recordOwnedResponse(db,id,'resp_owner')
  assert.equal(await ownedPreviousResponse(db,id,'resp_owner'),'resp_owner')
  await assert.rejects(ownedPreviousResponse(db,id,'msg_unknown'),/response_not_owned/)
  await recordOwnedResponse(db,id,'msg_owner')
  assert.equal(await ownedPreviousResponse(db,id,'msg_owner'),'msg_owner')
  await assert.rejects(ownedPreviousResponse(db,otherId,'resp_owner'),/response_not_owned/)
})

for (const [base, endpoint] of [[root,'onju-agent'], [root,'onju-goal-agent'], [root,'onju-plan-revision-agent'], [site,'onju-plan-revision-agent']]) {
  test(`${base===root?'root':'site'}/${endpoint} rejects an unowned response pointer before any model request`, async () => {
    const db={
      async rpc(name){return {data:name==='web_mvp_authorize_session'?'authorized':true,error:null}},
      from(table){
        assert.equal(table,'web_mvp_provider_responses')
        const q={select(){return q},eq(){return q},async maybeSingle(){return {data:null,error:null}}}
        return q
      },
    }
    const h=loadHandler(base,endpoint,null,db)
    const response=await h.handler(new Request('http://localhost/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:id,sessionToken:token,message:'Test',currentPlan:[{id:'item'}],previousResponseId:'resp_not_owned'})}))
    assert.equal(response.status,403)
    assert.equal((await response.json()).error,'response_not_owned')
    assert.equal(h.counts().providerCalls,0)
  })
}

function loadHandler(base, endpoint, denial, providedDatabase) {
  let handler, providerCalls = 0, reads = 0, rpcs = 0
  const db = providedDatabase ?? {
    from(){ reads++; throw new Error('Data read before authorization') },
    async rpc(name){ rpcs++; assert.equal(name, 'web_mvp_authorize_session'); return { data: denial, error: null } },
  }
  const deno = { env: { get: name => ({ ANTHROPIC_API_KEY: 'test-only-not-a-real-secret', OPENAI_API_KEY: 'test-only-not-a-real-secret', SUPABASE_URL: 'http://localhost', SUPABASE_SERVICE_ROLE_KEY: 'test-only' })[name] }, serve: fn => { handler = fn } }
  const cache = new Map()
  function load(path) {
    if(cache.has(path)) return cache.get(path).exports
    const module = {exports:{}}; cache.set(path,module)
    const source = readFileSync(path,'utf8')
    const output = ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
    const require = specifier => {
      if(specifier.startsWith('https://esm.sh/@supabase/')) return {createClient:()=>db}
      if(!specifier.startsWith('.')) throw new Error('Unexpected external import: '+specifier)
      const candidate = resolve(dirname(path),specifier)
      return load(existsSync(candidate)?candidate:candidate+'.ts')
    }
    new Function('require','module','exports','Deno','fetch','console',output)(require,module,module.exports,deno,async()=>{providerCalls++;throw new Error('Forbidden live call')},{error(){},warn(){},log(){}})
    return module.exports
  }
  load(resolve(base,'supabase/functions',endpoint,'index.ts'))
  return { handler, counts:()=>({providerCalls,reads,rpcs}) }
}

for(const [label,base,endpoints] of [
  ['root',root,['onju-agent-v2','onju-memory','onju-daily','onju-plan-agent','onju-plan-revision-agent','onju-goal-agent','onju-agent']],
  ['site',site,['onju-agent-v2','onju-memory','onju-daily','onju-plan-agent','onju-plan-revision-agent','onju-telemetry']],
]) for(const endpoint of endpoints) {
  test(`${label}/${endpoint} rejects expired ownership before reading data or calling a model`,async()=>{
    const h=loadHandler(base,endpoint,'session_expired')
    const body={sessionId:id,sessionToken:token,message:'Test',action:'load',currentPlan:[{id:'item',title:'test'}],goalCard:{outcome:'Test',weeklyActions:[{title:'Test'}]}}
    const response=await h.handler(new Request('http://localhost/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}))
    assert.equal(response.status,410,JSON.stringify(await response.clone().json()))
    assert.equal((await response.json()).error,'session_expired')
    assert.deepEqual(h.counts(),{providerCalls:0,reads:0,rpcs:1})
  })
}
test('migration matches both trees and prevents resurrection without assigning legacy owners',()=>{
  const path='supabase/migrations/202609150001_web_mvp_session_ownership.sql'
  const sql=readFileSync(resolve(root,path),'utf8').replaceAll('\r\n','\n')
  assert.equal(sql,readFileSync(resolve(site,path),'utf8').replaceAll('\r\n','\n'))
  assert.match(sql,/current_session.access_token_hash is null then return 'session_recovery_required'/)
  assert.match(sql,/old.expires_at <= now\(\)/)
  assert.match(sql,/before insert or update or delete/)
  assert.match(sql,/for key share/)
  assert.match(sql,/revoke all on function public.web_mvp_authorize_session\(uuid, text\) from public, anon, authenticated/)
  // Static contract assertions only, not a substitute for executing PostgreSQL.
})
test('both trees share the same ownership helper and browser identity implementation',()=>{
  for(const path of ['supabase/functions/_shared/webMvpAccess.ts','web-mvp/src/agentSession.ts']) {
    assert.equal(readFileSync(resolve(root,path),'utf8').replaceAll('\r\n','\n'),readFileSync(resolve(site,path),'utf8').replaceAll('\r\n','\n'))
  }
})

async function memoryFixture() {
  const ownerHash = await sha256(token), tombstones = new Map()
  const rows = new Map([[id, {session_id:id,access_token_hash:ownerHash,expires_at:'2099-01-01T00:00:00Z',updated_at:'2026-09-15T00:00:00Z',messages:[{text:'original conversation'}],goal_card:{},agent_v2_context:{version:3},generated_plan:[]}]])
  const db = {
    async rpc(name,args) {
      if(name==='web_mvp_delete_owned_session') {
        if(tombstones.has(args.p_session_id)) return {data:tombstones.get(args.p_session_id)===args.p_token_hash?'deleted':'session_forbidden',error:null}
        const row=rows.get(args.p_session_id)
        if(!row || row.access_token_hash!==args.p_token_hash) return {data:'session_forbidden',error:null}
        tombstones.set(args.p_session_id,row.access_token_hash); rows.delete(args.p_session_id)
        return {data:'deleted',error:null}
      }
      assert.equal(name,'web_mvp_authorize_session')
      if(tombstones.has(args.p_session_id)) return {data:'session_revoked',error:null}
      const row=rows.get(args.p_session_id)
      return {data:row?.access_token_hash===args.p_token_hash?'authorized':'session_forbidden',error:null}
    },
    from(table) {
      assert.equal(table,'web_mvp_agent_sessions')
      const filters=[]; let changes
      const execute=()=>{
        const found=[...rows.values()].find(row=>filters.every(fn=>fn(row)))
        if(!found) return {data:null,error:null}
        if(changes) Object.assign(found,structuredClone(changes))
        return {data:structuredClone(found),error:null}
      }
      const query={
        select(){return query}, eq(key,value){filters.push(row=>row[key]===value);return query},
        gt(key,value){filters.push(row=>row[key]>value);return query},
        update(value){changes=value;return query},
        maybeSingle:async()=>execute(),single:async()=>execute(),
        then(resolveResult,reject){return Promise.resolve(execute()).then(resolveResult,reject)},
      }
      return query
    },
  }
  const {handler}=loadHandler(root,'onju-memory',null,db)
  return {rows,call:async(action,extra={})=>handler(new Request('http://localhost/memory',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:id,sessionToken:token,action,...extra})}))}
}
test('owner reloads its conversation; another token cannot read it',async()=>{
  const f=await memoryFixture()
  assert.equal((await (await f.call('load')).json()).state.messages[0].text,'original conversation')
  const denied=await f.call('load',{sessionToken:otherToken})
  assert.equal(denied.status,403)
  assert.equal((await denied.json()).state,undefined)
})
test('stale auto-save never replaces an accepted server-managed conversation',async()=>{
  const f=await memoryFixture()
  const response=await f.call('save',{state:{messages:[{text:'stale empty tab'}],goalCard:{outcome:'wrong'}}})
  assert.equal((await response.json()).serverManaged,true)
  assert.equal(f.rows.get(id).messages[0].text,'original conversation')
})
test('explicit plan saving still persists after conversation auto-save becomes server-managed',async()=>{
  const f=await memoryFixture(), plan=[{id:'plan',title:'Test plan'}]
  assert.equal((await f.call('save_plan_revision',{plan,pendingPlan:[],history:[]})).status,200)
  assert.deepEqual((await (await f.call('load')).json()).state.generated_plan,plan)
})
test('deletion is idempotent and a delayed save cannot restore deleted records',async()=>{
  const f=await memoryFixture()
  assert.equal((await (await f.call('delete_session')).json()).deleted,true)
  assert.equal((await (await f.call('delete_session')).json()).deleted,true)
  assert.equal((await f.call('save',{state:{messages:[{text:'late'}]}})).status,410)
  assert.equal(f.rows.has(id),false)
})
