import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
const ts = createRequire(import.meta.url)('typescript')

// Execute actual browser queue code with synthetic settings and a controlled request.
test('telemetry completion after deletion cannot recreate an outbox entry or touch a different session',async()=>{
  const entries=new Map()
  globalThis.localStorage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)}
  const cache=new Map(), sent=[]
  let finish
  const pending=new Promise(resolve=>{finish=resolve})
  function load(path) {
    if(cache.has(path)) return cache.get(path).exports
    const module={exports:{}};cache.set(path,module)
    const source=readFileSync(path,'utf8').replaceAll('import.meta',JSON.stringify({env:{VITE_SUPABASE_URL:'http://localhost',VITE_SUPABASE_ANON_KEY:'test-only'}}))
    const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
    const require=specifier=>{
      if(!specifier.startsWith('.')) throw new Error('Unexpected import '+specifier)
      const next=resolve(dirname(path),specifier)
      return load(existsSync(next)?next:next+'.ts')
    }
    new Function('require','module','exports','fetch',compiled)(require,module,module.exports,async(_url,options)=>{
      sent.push(JSON.parse(options.body));return pending
    })
    return module.exports
  }
  const base=resolve(import.meta.dirname,'../../logs/sites/onju-web-mvp/web-mvp/src')
  const session=load(resolve(base,'agentSession.ts'))
  const cleanup=load(resolve(base,'sessionData.ts'))
  const telemetry=load(resolve(base,'testTelemetry.ts'))
  const id=session.resetAgentSession(),other=crypto.randomUUID()
  const outbox='onju-web-mvp-telemetry-outbox-v1'
  entries.set(outbox,JSON.stringify([{sessionId:other,eventId:crypto.randomUUID(),eventName:'setup_opened',stage:0,metadata:{},queuedAt:Date.now()}]))
  const attempt=telemetry.recordTestEvent({sessionId:id,eventName:'setup_opened',stage:0})
  assert.equal(sent.length,1)
  session.pauseAgentSession(id);cleanup.completeLocalSessionDeletion(id)
  finish(new Response('{}',{status:500}));await attempt
  assert.deepEqual(JSON.parse(entries.get(outbox)).map(item=>item.sessionId),[other])
  assert.equal(await telemetry.recordTestEvent({sessionId:id,eventName:'setup_exited',stage:0}),false)
  assert.equal(sent.length,1)
  assert.deepEqual(JSON.parse(entries.get(outbox)).map(item=>item.sessionId),[other])
})
