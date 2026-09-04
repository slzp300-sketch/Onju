import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { isDeepStrictEqual } from 'node:util'

const root=path.resolve(import.meta.dirname,'../..')
for(const line of fs.readFileSync(path.join(root,'.env.local'),'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0&&!line.startsWith('#'))process.env[line.slice(0,i)]=line.slice(i+1).trim()}
const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_ANON_KEY
if(!url||!key)throw new Error('VITE_SUPABASE_URL/ANON_KEY가 필요합니다.')
const cases=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,process.argv.includes('--usability')?'../evals/onju-agent-usability.json':process.argv.includes('--regressions')?'../evals/onju-agent-regressions.json':'../evals/onju-agent-v2-cases.json'),'utf8'))
const named=process.argv.indexOf('--name')
const selected=named>=0?cases.filter(x=>x.name.includes(process.argv[named+1]??'')):process.argv.includes('--all')?cases:cases.slice(0,5)
let failed=0
function check(result,e={}){
 const s=result.state??{}
 return [
  e.stage===undefined||s.stage===e.stage,
  e.allDayBounds===undefined||[0,1,2,3,4,5,6].every(d=>(s.dayBounds??[]).some(x=>x.days.includes(d)))===e.allDayBounds,
  e.minBlocks===undefined||(s.blocks??[]).length>=e.minBlocks,
  e.maxBlocks===undefined||(s.blocks??[]).length<=e.maxBlocks,
  !e.goalOutcome||Boolean(s.goalCard?.outcome),
  !e.contains||result.assistant_message.includes(e.contains),
  !e.paragraphs||result.assistant_message.includes('\n\n'),
  !e.forbidden||!result.assistant_message.includes(e.forbidden),
  e.minChoices===undefined||(result.suggestions??[]).length>=e.minChoices,
  e.maxQuestions===undefined||(result.assistant_message.match(/[?？]/g)??[]).length<=e.maxQuestions,
  e.maxReplyLength===undefined||result.assistant_message.length<=e.maxReplyLength,
  e.goalActions===undefined||(s.goalCard?.weeklyActions?.length??0)>=e.goalActions,
  !e.noGoalActions||(s.goalCard?.weeklyActions?.length??0)===0,
  !e.readyGoal||(s.goalCard?.durationWeeks>0&&Boolean(s.goalCard?.targetMetric)&&(s.goalCard?.weeklyActions??[]).every(a=>typeof a.title==='string'&&a.frequencyPerWeek>0&&a.durationMinutes>0)),
  (e.blocks??[]).every(want=>(s.blocks??[]).some(b=>b.start===want.start&&b.end===want.end&&JSON.stringify([...b.days].sort())===JSON.stringify(want.days))),
  (e.bounds??[]).every(want=>want.days.every(day=>(s.dayBounds??[]).some(b=>b.days.includes(day)&&b.wake===want.wake&&b.bedtime===want.bedtime))),
 ].every(Boolean)
}
for(const test of selected){let result;const sessionId=crypto.randomUUID()
 let turnsPassed=true
 for(const [i,message] of test.turns.entries()){const response=await fetch(`${url}/functions/v1/onju-agent-v2`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({sessionId,message}),signal:AbortSignal.timeout(90000)});result=await response.json();if(!response.ok)throw new Error(`${test.name}: ${JSON.stringify(result)}`)
  if(!check(result,test.turnExpect?.[i])){turnsPassed=false;console.log(`FAIL ${test.name} turn ${i+1}: ${JSON.stringify(result)}`)}
  if(process.argv.includes('--regressions')||process.argv.includes('--usability'))console.log(JSON.stringify({test:test.name,turn:i+1,reply:result.assistant_message,choices:result.suggestions,stage:result.state?.stage}))
 }
 const persistedResponse=await fetch(`${url}/functions/v1/onju-memory`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({sessionId,action:'load'}),signal:AbortSignal.timeout(30000)})
 const persisted=await persistedResponse.json()
 const matches=persistedResponse.ok&&persisted.state?.stage===result.state.stage&&isDeepStrictEqual(persisted.state?.blocks,result.state.blocks)&&isDeepStrictEqual(persisted.state?.day_bounds,result.state.dayBounds)
 const ok=turnsPassed&&check(result,test.expect)&&matches;console.log(`${ok?'PASS':'FAIL'} ${test.name}`);if(!ok){failed++;console.log(JSON.stringify(result,null,2));console.log(JSON.stringify({events:(persisted.state?.agent_v2_events??[]).map(e=>({tool:e.tool,result:e.result,model:e.model}))}))}
}
if(failed)process.exitCode=1
