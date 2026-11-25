// Offline, structured-state diagnostic. No synthetic satisfaction/retention metrics.
import '../../scripts/offline-network-guard.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {fileURLToPath} from 'node:url'
import {resolve} from 'node:path'
import {emptyBrief,updateGoalBrief,loadGoalBrief,missingGoalBrief} from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import {normalizeRegionalContext,regionalDateKey,regionalWeekRange,orderedWeekdayIndices} from '../../../logs/sites/onju-web-mvp/web-mvp/src/regionalContext.ts'
import {scheduleOpenings} from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/state.ts'
import {personas} from './personas.mjs'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const startedAt=new Date().toISOString()
const clock=new Date('2026-09-15T23:30:00Z')
const checks=[]
function check(id,person,expected,actual) {
  let passed=true
  try{assert.deepEqual(actual,expected)}catch{passed=false}
  checks.push({id,persona:person,passed,expected,actual})
}
const subjects=[
  'logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts',
  'logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalIntakeEvidence.ts',
  'logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/state.ts',
  'logs/sites/onju-web-mvp/web-mvp/src/regionalContext.ts',
  'web-mvp/qa/persona-pilot/personas.mjs', 'web-mvp/qa/persona-pilot/run.mjs',
]
async function fingerprint(){return Promise.all(subjects.map(async path=>({path,sha256:createHash('sha256').update(await readFile(resolve(root,path))).digest('hex')})))}
const source=await fingerprint()
const journeys=[]
assert.equal(personas.filter(p=>p.context.countryCode==='KR').length,3)
assert.equal(personas.filter(p=>p.context.countryCode==='US').length,2)
for(const persona of personas) {
  const context=normalizeRegionalContext(persona.context)
  check('region-normalization',persona.id,persona.context,context)
  check('local-calendar-date',persona.id,persona.expectedDate,regionalDateKey(context,clock))
  check('local-week-range',persona.id,persona.expectedWeek,regionalWeekRange(context,clock))
  check('weekday-order',persona.id,context.weekStartsOn===1?[0,1,2,3,4,5,6]:[6,0,1,2,3,4,5],orderedWeekdayIndices(context))
  check('no-invented-free-time',persona.id,true,scheduleOpenings([],[]).every(day=>day.slots.length===0))
  let state=emptyBrief()
  const history=[],trace=[]
  for(const [index,step] of persona.steps.entries()) {
    const before=structuredClone(state)
    let accepted=true,error=null,candidateState=null
    try{
      candidateState=updateGoalBrief(state,step.candidate,step.message,history,persona.expectedDate)
      // The actual loader is also used at the start of later agent turns.
      state=loadGoalBrief(JSON.parse(JSON.stringify(candidateState)))
    }catch(cause){accepted=false;error=String(cause.message)}
    check('turn-'+(index+1)+'-accepted',persona.id,true,accepted)
    if(accepted)check('turn-'+(index+1)+'-roundtrip',persona.id,candidateState,state)
    check('turn-'+(index+1)+'-missing',persona.id,step.expected.missing,missingGoalBrief(state))
    check('turn-'+(index+1)+'-period',persona.id,step.expected.periodLabel,state.period?.label??null)
    trace.push({turn:index+1,userMessage:step.message,manuallyAuthoredCandidate:step.candidate,
      actualModelReply:null,accepted,error,before,immediatelyAfterUpdate:candidateState,afterReload:structuredClone(state),missing:missingGoalBrief(state)})
    history.push(step.message)
  }
  journeys.push({...persona,trace,checksPassed:checks.filter(c=>c.persona===persona.id&&c.passed).length,
    checksFailed:checks.filter(c=>c.persona===persona.id&&!c.passed).length,
    liveDialogueQuality:'not_measured',satisfaction:null,retention:null,willingnessToPay:null})
}

// Paired probes isolate language/order differences; do not count them as people.
const probeProfiles=[]
for(const [locale,area,outcome,evidence,current,time] of [
  ['ko-KR','독서','책 2권 완독','8주','현재 0권','평일 하루 20분 가능해.'],
  ['en-US','reading','read 2 books','8 weeks','0 books completed','I can spend 20 minutes on weekdays.'],
]) {
  const message=[area,outcome,evidence,current,time].join(' ')
  const input={period:{kind:'duration',evidence,normalized:'8주'},areas:[area],
    objectives:[{area,result:outcome,evidence:outcome,result_kind:'metric'}],
    baselines:[{area,current,evidence:current,status:'known'}],capacity:{summary:time,evidence:time,status:'known'}}
  let actual=null,error=null
  try{actual=updateGoalBrief(emptyBrief(),input,message,[], '2026-09-16')}catch(cause){error=cause.message}
  check('all-facts-one-turn',locale,true,error===null)
  probeProfiles.push({id:'all-facts-one-turn',locale,message,input,error,actual})

  const maybe=locale==='ko-KR'?'8주가 좋을까? 아직 미정이야.':'Maybe 8 weeks, but I have not decided yet.'
  let declined=false,uncertainResult=null
  try{uncertainResult=updateGoalBrief(emptyBrief(),{period:{kind:'duration',evidence,normalized:'8주'}},maybe,[],'2026-09-16')}catch{declined=true}
  check('tentative-period-not-confirmed',locale,true,declined)
  probeProfiles.push({id:'tentative-period-not-confirmed',locale,message:maybe,declined,actual:uncertainResult})

  // Use a confirmed dated period to avoid confounding these checks with the
  // English duration reload defect. Every seed is explicitly fixture-authored.
  const seed=emptyBrief()
  seed.period={label:'2026-12-31',deadline:'2026-12-31',weeks:15}
  seed.areas=[area]
  seed.objectives=[{area,result:outcome,evidence:outcome,resultKind:'metric'}]
  const unknown=locale==='ko-KR'?'현재 수준은 측정해본 적 없어.':'I have never measured my current level.'
  let baselineResult=null,baselineError=null
  try{baselineResult=updateGoalBrief(seed,{baselines:[{area,current:unknown,evidence:unknown,status:'unmeasured'}]},unknown)}catch(cause){baselineError=cause.message}
  check('explicitly-unmeasured-baseline',locale,true,baselineError===null&&baselineResult.baselines[0]?.status==='unmeasured')
  probeProfiles.push({id:'explicitly-unmeasured-baseline',locale,message:unknown,error:baselineError,actual:baselineResult})

  seed.baselines=[{area,current,evidence:current,status:'known'}]
  const variable=locale==='ko-KR'?'일정이 매주 달라서 시간은 유동적이야.':'My schedule changes every week and my available time varies.'
  let capacityResult=null,capacityError=null
  try{capacityResult=updateGoalBrief(seed,{capacity:{summary:variable,evidence:variable,status:'unmeasured'}},variable)}catch(cause){capacityError=cause.message}
  check('explicitly-variable-capacity',locale,true,capacityError===null&&capacityResult.capacity?.status==='unmeasured')
  probeProfiles.push({id:'explicitly-variable-capacity',locale,message:variable,error:capacityError,actual:capacityResult})
}

const after=await fingerprint()
assert.deepEqual(after,source,'Source changed during diagnostics; rerun before using this report')
const report={schemaVersion:1,studyType:'synthetic-offline-structured-state-diagnostic',startedAt,finishedAt:new Date().toISOString(),
  simulatedClock:clock.toISOString(),source,sourceUnchanged:true,realParticipants:0,syntheticPersonas:5,
  providerCalls:0,incrementalModelApiCostUsd:0,productionWrites:0,liveQualityValidated:false,
  deploymentTested:false,uiTested:false,
  limitations:['All people, goals, inputs and candidate tool arguments are authored fixtures.',
    'Actual local Site validation/state functions executed; no actual model-generated answers or production backend used.',
    'Failures show conditional software behavior, not live-model failure rates.',
    'No user satisfaction, retention, task success probability, response speed, market demand or willingness-to-pay evidence.'],
  totals:{assertions:checks.length,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length},
  journeys,pairedProbes:probeProfiles,checks}
const folder=resolve(root,'logs/persona-pilot',startedAt.replace(/[:.]/g,'-'))
await mkdir(folder,{recursive:true})
await writeFile(resolve(folder,'results.json'),JSON.stringify(report,null,2))
const csvCell=value=>'"'+String(value??'').replaceAll('"','""')+'"'
await writeFile(resolve(folder,'checks.csv'),'\uFEFF'+[
  ['persona','check','passed','expected','actual'].map(csvCell).join(','),
  ...checks.map(c=>[c.persona,c.id,c.passed,JSON.stringify(c.expected),JSON.stringify(c.actual)].map(csvCell).join(',')),
].join('\n'))
await writeFile(resolve(folder,'summary.md'),[
  '# 온주 가상 사용자 5명 — 무료 구조·상태 진단', '',
  '실제 참여자 0명 / 가상 한국 사용자 3명·미국 사용자 2명. 실사용 연구·실제 AI 대화 평가가 아니다.', '',
  '- 소스: 로컬 Site 작업본. 원본 앱과 운영 사이트는 변경하지 않음.',
  '- 실제 모델 공급자 API 호출 0회 / 추가 모델 API 비용 $0.',
  '- 조건 검사: '+report.totals.passed+' 통과 / '+report.totals.failed+' 실패. 사용자 성공률로 환산하지 않는다.', '',
  '| 가상 사례 | 설정 | 조건 통과 | 조건 실패 |', '|---|---|---:|---:|',
  ...journeys.map(p=>'| '+p.id+' | '+p.profile+' | '+p.checksPassed+' | '+p.checksFailed+' |'), '',
  '## 실패한 조건', '', ...checks.filter(c=>!c.passed).map(c=>'- '+c.persona+' / '+c.id), '',
  '## 해석 제한', '', ...report.limitations.map(value=>'- '+value), '',
  '원시 상태·입력·수동 도구 인자는 results.json, 전체 조건 결과는 checks.csv에 기록했다.', '',
].join('\n'))
console.log(JSON.stringify({folder,totals:report.totals,realParticipants:0,syntheticPersonas:5,providerCalls:0}))
// Preserve non-passing diagnostics; never silently call detected failures a pass.
if(report.totals.failed)process.exitCode=1
