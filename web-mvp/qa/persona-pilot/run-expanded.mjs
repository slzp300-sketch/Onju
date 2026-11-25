import '../../scripts/offline-network-guard.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,dirname,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {emptyBrief,updateGoalBrief,loadGoalBrief,missingGoalBrief} from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import {assessGoalFeasibility,nextGoalIntakeStep} from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import {loadState,runAgentTurn} from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import {normalizeRegionalContext,regionalDateKey,regionalWeekRange} from '../../../logs/sites/onju-web-mvp/web-mvp/src/regionalContext.ts'
import {expandedPersonas} from './expanded-personas.mjs'

const root=fileURLToPath(new URL('../../../',import.meta.url))
const startedAt=new Date().toISOString()
const clock=new Date('2026-09-15T23:30:00Z')
const checks=[]
const traces=[]
const subjectPaths=new Set()
async function collect(path) {
  const full=resolve(root,path)
  if(subjectPaths.has(full)) return
  subjectPaths.add(full)
  const source=await readFile(full,'utf8')
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    if(match[1].startsWith('.')&&/\.(?:ts|mjs)$/.test(match[1])) await collect(resolve(dirname(full),match[1]))
  }
}
await collect(fileURLToPath(import.meta.url))
async function fingerprint() {
  return Promise.all([...subjectPaths].sort().map(async path=>({path:relative(root,path).replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(path)).digest('hex')})))
}
const source=await fingerprint()
function check(persona,caseId,kind,field,expected,actual) {
  let passed=true
  try { assert.deepEqual(actual,expected) } catch { passed=false }
  checks.push({persona,caseId,kind,field,expected,actual,passed})
}
function observe(state,accepted=true) {
  const assessment=assessGoalFeasibility(state)
  return {...structuredClone(state),accepted,missing:missingGoalBrief(state),feasibility:assessment.status,
    next:nextGoalIntakeStep(state,missingGoalBrief(state)),conflicts:assessment.conflicts,
    objectiveAreas:state.objectives.map(item=>item.area),baselineAreas:state.baselines.map(item=>item.area)}
}
function verify(persona,caseId,kind,expect,observed) {
  const expected={accepted:true,...expect}
  for(const [field,value] of Object.entries(expected)) {
    const actual=field==='minimumConflicts' ? observed.conflicts.length>=value
      : field.split('.').reduce((result,key)=>result?.[key],observed) ?? null
    check(persona,caseId,kind,field,field==='minimumConflicts'?true:value,actual)
  }
}
function runStateCase(persona,caseId,kind,seed,entry,history) {
  const before=structuredClone(seed)
  let after=structuredClone(seed),candidateState=null,error=null,accepted=true
  try {
    candidateState=updateGoalBrief(seed,entry.candidate,entry.message,history,regionalDateKey(persona.context,clock),persona.context.locale)
    after=loadGoalBrief(JSON.parse(JSON.stringify(candidateState)))
  } catch(cause) {error=cause.message;accepted=false}
  check(persona.id,caseId,kind,'input-state-immutable',before,seed)
  // Always count the invariant, including rejected inputs; counts do not vary
  // when a defect is fixed. Rejection must leave the prior state unchanged.
  check(persona.id,caseId,kind,'storage-boundary',accepted?candidateState:before,after)
  const observed=observe(after,accepted)
  verify(persona.id,caseId,kind,entry.expect,observed)
  traces.push({persona:persona.id,caseId,kind,userMessage:entry.message,manuallyAuthoredCandidate:entry.candidate,
    expected:entry.expect,accepted,error,before,immediatelyAfterUpdate:candidateState,afterReload:after,
    assessment:assessGoalFeasibility(after),actualModelReply:null,observation:observed})
  return after
}
const summaries=[]
assert.equal(expandedPersonas.length,10)
assert.equal(new Set(expandedPersonas.map(p=>p.id)).size,10)
assert.ok(expandedPersonas.every(p=>p.synthetic===true&&p.age>=20&&p.age<=49))
assert.equal(expandedPersonas.filter(p=>p.context.locale==='ko-KR').length,6)
assert.equal(expandedPersonas.filter(p=>p.context.locale==='en-US').length,4)
for(const persona of expandedPersonas) {
  check(persona.id,'region','context','context',persona.context,normalizeRegionalContext(persona.context))
  const isKorean=persona.context.countryCode==='KR'
  check(persona.id,'region','context','localDate',isKorean?'2026-09-16':'2026-09-15',regionalDateKey(persona.context,clock))
  check(persona.id,'region','context','week',isKorean?{start:'2026-09-14',end:'2026-09-20'}:{start:'2026-09-13',end:'2026-09-19'},regionalWeekRange(persona.context,clock))
  let state=emptyBrief()
  const history=[],snapshots=[structuredClone(state)]
  for(const [i,entry] of persona.steps.entries()) {
    state=runStateCase(persona,'turn-'+(i+1),'journey',state,entry,history)
    snapshots.push(structuredClone(state))
    history.push(entry.message)
  }
  for(const probe of persona.probes??[]) {
    const index=probe.seedAfterTurn??persona.steps.length
    runStateCase(persona,probe.id,probe.kind,structuredClone(snapshots[index]),probe,history.slice(0,index))
  }
  for(const probe of persona.agentProbes??[]) {
    const brief=structuredClone(snapshots[probe.seedAfterTurn])
    const toolTrace=[]
    let requests=0,recorded=false,after=brief,error=null,reply=null
    try {
      const result=await runAgentTurn(loadState({stage:5,agent_v2_context:{brief}}),probe.message,{
        now:'September 16, 2026',today:regionalDateKey(persona.context,clock),regionalContext:persona.context,
        request:async body=>{
          requests++
          const availableTools=body.tools.map(tool=>tool.name)
          if(requests>3||recorded) throw Error('mock_sequence_exhausted: inspect tool results; do not infer live model failure')
          const routeFirst=!availableTools.includes('record_goal_brief')
          const name=routeFirst?'route_request':'record_goal_brief'
          assert.ok(availableTools.includes(name),'expected routing/capture tool unavailable')
          const args=routeFirst?{module:'goal',evidence:probe.message}:{period:null,areas:[],baselines:[],objectives:[],capacity:null,...probe.candidate,
            reply:{paragraphs:['Let us base the plan on what you have shared.'],bullets:[],question:probe.question,choices:[],remember:[],forget:[]}}
          toolTrace.push({availableTools,fixtureTool:name,fixtureArgs:args,previousToolResults:body.input.filter(item=>item.type==='function_call_output')})
          if(!routeFirst)recorded=true
          return {id:'fixture-'+requests,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,arguments:JSON.stringify(args),call_id:'fixture-call-'+requests}]}
        },
      })
      after=result.state.agent_v2_context.brief
      reply=result.assistant_message
    } catch(cause) {error=cause.message}
    const observed=observe(after,!error)
    verify(persona.id,probe.id,'agent-path',probe.expect,observed)
    traces.push({persona:persona.id,caseId:probe.id,kind:'agent-path',userMessage:probe.message,
      candidateKind:probe.candidateKind??'intended-extraction',seedSource:'snapshot after authored journey turn '+probe.seedAfterTurn,before:brief,afterReload:after,
      accepted:!error,error,expected:probe.expect,observation:observed,mockProviderRequests:requests,
      actualProviderCalls:0,toolTrace,renderedReplyFromFixture:reply,actualModelReply:null})
  }
  const own=checks.filter(c=>c.persona===persona.id)
  summaries.push({id:persona.id,age:persona.age,profile:persona.profile,situation:persona.situation,
    locale:persona.context.locale,authoredTurns:persona.steps.length,checks:own.length,passed:own.filter(c=>c.passed).length,failed:own.filter(c=>!c.passed).length,
    liveQuestionsNotTested:persona.liveQuestions,satisfaction:null,retention:null,willingnessToPay:null})
}
assert.deepEqual(await fingerprint(),source,'Code or fixtures changed during diagnosis')
const report={schemaVersion:1,studyType:'synthetic-offline-diagnostic-expanded',startedAt,finishedAt:new Date().toISOString(),
  simulatedClock:clock.toISOString(),source,sourceUnchanged:true,syntheticPersonas:10,realParticipants:0,
  authoredJourneyTurns:expandedPersonas.reduce((n,p)=>n+p.steps.length,0),
  authoredBoundaryProbes:expandedPersonas.reduce((n,p)=>n+(p.probes?.length??0),0),
  authoredAgentProbes:expandedPersonas.reduce((n,p)=>n+(p.agentProbes?.length??0),0),
  providerCalls:0,incrementalModelApiCostUsd:0,productionWrites:0,productSourceModified:false,
  liveQualityValidated:false,uiTested:false,deploymentTested:false,
  limitations:['Fictional personas and manually authored tool candidates; no representative real-user sample.',
    'Ordinary journey failures, invalid-candidate guard failures and unsupported capabilities are separated.',
    'Agent-path probe executes real orchestration with fixture responses; not model inference or live dialogue quality.',
    'Failures after a rejected update may cascade. Assertion counts are not independent defects or user failure rates.',
    'No measurement of user satisfaction, retention, market demand, willingness to pay, live latency or real API cost.'],
  totals:{assertions:checks.length,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length},summaries,traces,checks}
const folder=resolve(root,'logs/persona-pilot-expanded',startedAt.replace(/[:.]/g,'-'))
await mkdir(folder,{recursive:true})
await writeFile(resolve(folder,'results.json'),JSON.stringify(report,null,2))
await writeFile(resolve(folder,'summary.md'),[
  '# 온주 — 추가 가상 사용자 10명 무료 진단','',
  '실제 참여자 0명. 한국어 6명·영어 4명, 모두 가상 20~40대. 대표성·실제 AI 대화 평가 없음.','',
  `- 작성 발언 ${report.authoredJourneyTurns}개 / 경계·기능 검사 ${report.authoredBoundaryProbes}개 / 모의 응답 기반 실제 에이전트 경로 검사 ${report.authoredAgentProbes}개`,
  `- 검사 ${report.totals.assertions}개: 통과 ${report.totals.passed}, 실패 ${report.totals.failed}. 실패 조건 수를 독립 결함 수로 해석하지 않는다.`,
  '- 모델 API 호출 0회 / 추가 모델 API 비용 $0 / 제품 코드 수정·배포 없음.','',
  '| ID | 가상 상황 | 통과 | 실패 |','|---|---|---:|---:|',
  ...summaries.map(p=>`| ${p.id} | ${p.profile} | ${p.passed} | ${p.failed} |`),'',
  '## 실패 조건','',...checks.filter(c=>!c.passed).map(c=>`- ${c.persona} / ${c.caseId} / ${c.kind} / ${c.field}: 기대 ${JSON.stringify(c.expected)}, 실제 ${JSON.stringify(c.actual)}`),'',
  '## 해석 제한','',...report.limitations.map(value=>'- '+value),'',
  '입력·기대값·모의 인자·실제 상태·오류·소스 지문은 results.json에 보존했다.','',
].join('\n'))
console.log(JSON.stringify({folder,totals:report.totals,authoredJourneyTurns:report.authoredJourneyTurns,
  boundaryProbes:report.authoredBoundaryProbes,agentProbes:report.authoredAgentProbes,providerCalls:0,
  failures:checks.filter(c=>!c.passed).map(({persona,caseId,field,expected,actual})=>({persona,caseId,field,expected,actual}))}))
if(report.totals.failed)process.exitCode=1
