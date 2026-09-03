import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const root=path.resolve(import.meta.dirname,'../..')
for(const line of fs.readFileSync(path.join(root,'.env.local'),'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0&&!line.startsWith('#'))process.env[line.slice(0,i)]=line.slice(i+1).trim()}
const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_ANON_KEY
if(!url||!key)throw new Error('VITE_SUPABASE_URL/ANON_KEY가 필요합니다.')
const cases=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'../evals/onju-agent-v2-cases.json'),'utf8'))
const named=process.argv.indexOf('--name')
const selected=named>=0?cases.filter(x=>x.name.includes(process.argv[named+1]??'')):process.argv.includes('--all')?cases:cases.slice(0,5)
let failed=0
for(const test of selected){let result;const sessionId=crypto.randomUUID()
 for(const message of test.turns){const response=await fetch(`${url}/functions/v1/onju-agent-v2`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({sessionId,message})});result=await response.json();if(!response.ok)throw new Error(`${test.name}: ${JSON.stringify(result)}`)}
 const e=test.expect,s=result.state??{},checks=[
  e.stage===undefined||s.stage===e.stage,
  !e.allDayBounds||[0,1,2,3,4,5,6].every(d=>(s.dayBounds??[]).some(x=>x.days.includes(d))),
  e.minBlocks===undefined||(s.blocks??[]).length>=e.minBlocks,
  e.maxBlocks===undefined||(s.blocks??[]).length<=e.maxBlocks,
  !e.goalOutcome||Boolean(s.goalCard?.outcome),
  !e.contains||result.assistant_message.includes(e.contains),
  !e.forbidden||!result.assistant_message.includes(e.forbidden),
 ];const ok=checks.every(Boolean);console.log(`${ok?'PASS':'FAIL'} ${test.name}`);if(!ok){failed++;console.log(JSON.stringify(result,null,2))}
}
if(failed)process.exitCode=1
