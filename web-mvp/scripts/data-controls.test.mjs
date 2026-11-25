import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as session from '../src/agentSession.ts'
import { completeLocalSessionDeletion, readLocalSessionData, sessionExportFile } from '../src/sessionData.ts'
class Storage {
  data=new Map()
  getItem(key){return this.data.get(key)??null}
  setItem(key,value){this.data.set(key,String(value))}
  removeItem(key){this.data.delete(key)}
  key(index){return [...this.data.keys()][index]??null}
  get length(){return this.data.size}
}
test('local export is scoped, strips keys; deletion clears scoped queues without touching other sessions',()=>{
  globalThis.localStorage=new Storage()
  const id=session.resetAgentSession(), other=crypto.randomUUID()
  session.writeSessionLocalState('onju-week-map',id,JSON.stringify({messages:['private text'],response_id:'secret-pointer',sessionToken:'secret'}))
  localStorage.setItem('onju-week-map:'+other,JSON.stringify({messages:['other']}))
  localStorage.setItem('onju-web-mvp-telemetry-outbox-v1',JSON.stringify([{sessionId:id,eventId:'own'},{sessionId:other,eventId:'other'}]))
  localStorage.setItem('onju-reminder-deliveries-v1',JSON.stringify([id+':2026-09-15:morning',other+':2026-09-15:morning']))
  localStorage.setItem('onju-public-beta-enrollment-v1',JSON.stringify({sessionId:id,eventId:'own'}))
  const data=sessionExportFile(id,readLocalSessionData(id),null)
  assert.equal(data.scope,'this-browser-only')
  assert.deepEqual(data.local.conversation['onju-week-map'],{messages:['private text']})
  assert.ok(!JSON.stringify(data).includes('secret'))
  assert.ok(!JSON.stringify(data).includes(other))
  session.pauseAgentSession(id)
  session.writeSessionLocalState('onju-chat-input',id,'late input')
  assert.equal(localStorage.getItem('onju-chat-input:'+id),null)
  completeLocalSessionDeletion(id)
  assert.equal(session.sessionControlState(id),'deleted')
  assert.equal(localStorage.getItem('onju-week-map:'+id),null)
  assert.ok(localStorage.getItem('onju-week-map:'+other))
  assert.deepEqual(JSON.parse(localStorage.getItem('onju-web-mvp-telemetry-outbox-v1')),[{sessionId:other,eventId:'other'}])
  assert.deepEqual(JSON.parse(localStorage.getItem('onju-reminder-deliveries-v1')),[other+':2026-09-15:morning'])
  assert.throws(()=>session.withAgentSession(id),/session_revoked/)
  assert.ok(session.withAgentSession(id,{action:'delete_session'},true).sessionToken)
})
test('a fresh module (reload/other tab) honors persistent deletion lock',async()=>{
  globalThis.localStorage=new Storage()
  const id=session.resetAgentSession()
  session.pauseAgentSession(id)
  const next=await import('../src/agentSession.ts?stage5='+crypto.randomUUID())
  assert.equal(next.sessionControlState(id),'deleting')
  assert.throws(()=>next.withAgentSession(id),/session_revoked/)
  next.writeSessionLocalState('onju-week-map',id,'late')
  assert.equal(localStorage.getItem('onju-week-map:'+id),null)
})
test('partial cleanup never records success and can be retried; old completion cannot erase a new session',()=>{
  globalThis.localStorage=new Storage()
  const old=session.resetAgentSession()
  session.pauseAgentSession(old)
  localStorage.setItem('onju-web-mvp-telemetry-outbox-v1','damaged')
  assert.throws(()=>completeLocalSessionDeletion(old),/local_cleanup_incomplete/)
  assert.equal(session.sessionControlState(old),'deleting')
  const next=session.resetAgentSession()
  session.writeSessionLocalState('onju-week-map',next,'new data')
  localStorage.setItem('onju-web-mvp-telemetry-outbox-v1','[]')
  completeLocalSessionDeletion(old)
  assert.equal(session.getAgentSessionId(),next)
  assert.equal(session.readSessionLocalState('onju-week-map',next),'new data')
  assert.throws(()=>readLocalSessionData(old),/session_changed/)
})
test('unowned legacy storage is never exported or cleared',()=>{
  globalThis.localStorage=new Storage()
  const id=session.resetAgentSession()
  localStorage.setItem('onju-week-map','unowned')
  assert.deepEqual(readLocalSessionData(id).conversation,{})
  completeLocalSessionDeletion(id)
  assert.equal(localStorage.getItem('onju-week-map'),'unowned')
})
test('root and site share the data control behavior and migration',async()=>{
  for(const file of ['agentSession.ts','sessionData.ts','DataControls.tsx','BetaInfo.tsx','SessionDataBoundary.tsx','useSessionStatus.ts','dataControls.css']) {
    assert.equal(await readFile(new URL('../src/'+file,import.meta.url),'utf8'),await readFile(new URL('../../logs/sites/onju-web-mvp/web-mvp/src/'+file,import.meta.url),'utf8'),file)
  }
  for(const file of ['migrations/202609150004_web_mvp_data_controls.sql','functions/_shared/webMvpDataControls.ts']){
    assert.equal(await readFile(new URL('../../supabase/'+file,import.meta.url),'utf8'),await readFile(new URL('../../logs/sites/onju-web-mvp/supabase/'+file,import.meta.url),'utf8'),file)
  }
})
