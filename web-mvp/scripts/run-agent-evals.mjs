import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { isDeepStrictEqual } from 'node:util'
import { EVAL_SUITES, evalOptions, prepareEvalPlan, assertLiveEvalAllowed } from './eval-plan.mjs'

const root=path.resolve(import.meta.dirname,'../..')
const options=evalOptions(process.argv.slice(2))
const cases=JSON.parse(fs.readFileSync(path.join(import.meta.dirname,'../evals',EVAL_SUITES[options.suite]),'utf8'))
const {selected,manifest}=prepareEvalPlan(cases,options)
if(!options.live){console.log(JSON.stringify(manifest,null,2));process.exit(0)}
assertLiveEvalAllowed(options,manifest)
process.loadEnvFile(path.join(root,'.env.local'))
const url=process.env.VITE_SUPABASE_URL,key=process.env.VITE_SUPABASE_ANON_KEY
if(!url||!key)throw new Error('VITE_SUPABASE_URL/ANON_KEY가 필요합니다.')
let failed=0
function check(result,e={}){
 const s=result.state??{}
 const lastSection=result.assistant_message.trim().split(/\n\n/).at(-1)??''
 const visiblyAsks=/[?？]/.test(lastSection)
 return [
  e.stage===undefined||s.stage===e.stage,
  e.allDayBounds===undefined||[0,1,2,3,4,5,6].every(d=>(s.dayBounds??[]).some(x=>x.days.includes(d)))===e.allDayBounds,
  e.minBlocks===undefined||(s.blocks??[]).length>=e.minBlocks,
  e.maxBlocks===undefined||(s.blocks??[]).length<=e.maxBlocks,
  !e.goalOutcome||Boolean(s.goalCard?.outcome),
  !e.contains||result.assistant_message.includes(e.contains),
  !e.paragraphs||result.assistant_message.includes('\n\n'),
  !e.forbidden||!result.assistant_message.includes(e.forbidden),
  !(e.forbiddenAny??[]).some(value=>result.assistant_message.includes(value)),
  !e.noKorean||!/[가-힣]/.test(result.assistant_message)&&!(result.suggestions??[]).some(value=>/[가-힣]/.test(value)),
  e.minChoices===undefined||(result.suggestions??[]).length>=e.minChoices,
  e.maxChoices===undefined||(result.suggestions??[]).length<=e.maxChoices,
  e.maxQuestions===undefined||(result.assistant_message.match(/[?？]/g)??[]).length<=e.maxQuestions,
  e.maxReplyLength===undefined||result.assistant_message.length<=e.maxReplyLength,
  e.goalActions===undefined||(s.goalCard?.weeklyActions?.length??0)>=e.goalActions,
  !e.noGoalActions||(s.goalCard?.weeklyActions?.length??0)===0,
  !e.dialogueFocus||s.dialogue?.focus===e.dialogueFocus,
  e.minMemory===undefined||(s.dialogue?.memory?.length??0)>=e.minMemory,
  result.needs_clarification===visiblyAsks,
  e.expectReply===undefined||result.needs_clarification===e.expectReply,
  !e.readyGoal||(s.goalCard?.durationWeeks>0&&Boolean(s.goalCard?.targetMetric)&&(s.goalCard?.weeklyActions??[]).every(a=>typeof a.title==='string'&&a.frequencyPerWeek>0&&a.durationMinutes>0)),
  (e.blocks??[]).every(want=>(s.blocks??[]).some(b=>b.start===want.start&&b.end===want.end&&JSON.stringify([...b.days].sort())===JSON.stringify(want.days))),
  (e.bounds??[]).every(want=>want.days.every(day=>(s.dayBounds??[]).some(b=>b.days.includes(day)&&b.wake===want.wake&&b.bedtime===want.bedtime))),
 ].every(Boolean)
}
for(const test of selected){let result;const sessionId=crypto.randomUUID(),sessionToken=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','')
 let turnsPassed=true
 for(const [i,message] of test.turns.entries()){const response=await fetch(`${url}/functions/v1/onju-agent-v2`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({sessionId,sessionToken,turnId:crypto.randomUUID(),message,...(test.regionalContext?{regionalContext:test.regionalContext}:{})}),signal:AbortSignal.timeout(90000)});result=await response.json();if(!response.ok)throw new Error(`${test.name}: ${JSON.stringify(result)}`)
  if(!check(result,test.turnExpect?.[i])){turnsPassed=false;console.log(`FAIL ${test.name} turn ${i+1}: ${JSON.stringify(result)}`)}
  if(process.argv.includes('--regressions')||process.argv.includes('--usability'))console.log(JSON.stringify({test:test.name,turn:i+1,reply:result.assistant_message,choices:result.suggestions,stage:result.state?.stage}))
 }
 const persistedResponse=await fetch(`${url}/functions/v1/onju-memory`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({sessionId,sessionToken,action:'load'}),signal:AbortSignal.timeout(30000)})
 const persisted=await persistedResponse.json()
 const matches=persistedResponse.ok&&persisted.state?.stage===result.state.stage&&isDeepStrictEqual(persisted.state?.blocks,result.state.blocks)&&isDeepStrictEqual(persisted.state?.day_bounds,result.state.dayBounds)
 const ok=turnsPassed&&check(result,test.expect)&&matches;console.log(`${ok?'PASS':'FAIL'} ${test.name}`);if(!ok){failed++;console.log(JSON.stringify(result,null,2));console.log(JSON.stringify({events:(persisted.state?.agent_v2_events??[]).map(e=>({tool:e.tool,result:e.result,model:e.model}))}))}
}
if(failed)process.exitCode=1
