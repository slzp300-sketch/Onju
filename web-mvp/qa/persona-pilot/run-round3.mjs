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
import {round3Personas} from './round3-personas.mjs'

// Deliberately separate from earlier frozen diagnostics: no lowered expectations,
// rewritten historical results, or live model requests.
const root=fileURLToPath(new URL('../../../',import.meta.url))
const startedAt=new Date().toISOString(), clock=new Date('2026-09-15T23:30:00Z')
const checks=[],traces=[],paths=new Set()
async function collect(path) {
  const full=resolve(root,path)
  if(paths.has(full))return
  paths.add(full)
  const source=await readFile(full,'utf8')
  for(const match of source.matchAll(/(?:from\s*|import\s*)['"]([^'"]+)['"]/g)) {
    if(match[1].startsWith('.')&&/\.(?:ts|mjs)$/.test(match[1]))await collect(resolve(dirname(full),match[1]))
  }
}
await collect(fileURLToPath(import.meta.url))
const fingerprint=()=>Promise.all([...paths].sort().map(async path=>({path:relative(root,path).replaceAll('\\','/'),sha256:createHash('sha256').update(await readFile(path)).digest('hex')})))
const source=await fingerprint()
function check(persona,caseId,kind,field,expected,actual) {
  let passed=true
  try {assert.deepEqual(actual,expected)}catch {passed=false}
  checks.push({persona,caseId,kind,field,expected,actual,passed})
}
function observe(state,accepted=true) {
  const assessment=assessGoalFeasibility(state)
  return {...structuredClone(state),accepted,missing:missingGoalBrief(state),feasibility:assessment.status,
    next:nextGoalIntakeStep(state,missingGoalBrief(state)),conflicts:assessment.conflicts,
    objectiveAreas:state.objectives.map(item=>item.area),baselineAreas:state.baselines.map(item=>item.area)}
}
function verify(id,caseId,kind,expected,state,accepted=true) {
  const observed=observe(state,accepted)
  for(const [field,value] of Object.entries({accepted:true,...expected})) {
    const actual=field==='minimumConflicts'?observed.conflicts.length>=value:field.split('.').reduce((result,key)=>result?.[key],observed)??null
    check(id,caseId,kind,field,field==='minimumConflicts'?true:value,actual)
  }
  return observed
}
function capture(persona,caseId,kind,state,entry,history) {
  const before=structuredClone(state)
  let after=structuredClone(state),candidateState=null,error=null,accepted=true
  try {
    candidateState=updateGoalBrief(state,entry.candidate,entry.message,history,regionalDateKey(persona.context,clock),persona.context.locale)
    after=loadGoalBrief(JSON.parse(JSON.stringify(candidateState)))
  }catch(cause){error=cause.message;accepted=false}
  check(persona.id,caseId,kind,'input-state-immutable',before,state)
  check(persona.id,caseId,kind,'storage-boundary',accepted?candidateState:before,after)
  const observation=verify(persona.id,caseId,kind,entry.expect,after,accepted)
  traces.push({persona:persona.id,caseId,kind,userMessage:entry.message,manuallyAuthoredCandidate:entry.candidate,
    priorUserMessages:history,expected:entry.expect,accepted,error,before,immediatelyAfterUpdate:candidateState,afterReload:after,
    observation,assessment:assessGoalFeasibility(after),actualModelReply:null})
  return after
}
function exactEvidence(candidate,sources,label) {
  if(!candidate||typeof candidate!=='object')return
  if(typeof candidate.evidence==='string')assert.ok(sources.some(text=>text.includes(candidate.evidence)),`Fixture evidence not in its source: ${label}: ${candidate.evidence}`)
  for(const value of Object.values(candidate))if(Array.isArray(value))value.forEach(item=>exactEvidence(item,sources,label));else if(value&&typeof value==='object')exactEvidence(value,sources,label)
}
assert.equal(round3Personas.length,10)
assert.equal(new Set(round3Personas.map(p=>p.id)).size,10)
assert.ok(round3Personas.every(p=>p.synthetic&&p.age>=20&&p.age<50))
assert.equal(round3Personas.filter(p=>p.context.locale==='ko-KR').length,6)
assert.equal(round3Personas.filter(p=>p.context.locale==='en-US').length,4)
// Preflight fixture consistency before executing product behavior.
for(const p of round3Personas) {
  p.steps.forEach((entry,index)=>exactEvidence(entry.candidate,p.steps.slice(0,index).map(s=>s.message).concat(entry.message),p.id+'/turn-'+(index+1)))
  for(const entry of [...(p.probes??[]),...(p.agentProbes??[])]) {
    assert.ok(entry.seedAfterTurn>=0&&entry.seedAfterTurn<=p.steps.length)
    exactEvidence(entry.candidate,p.steps.slice(0,entry.seedAfterTurn).map(s=>s.message).concat(entry.message),p.id+'/'+entry.id)
  }
}
const summaries=[]
for(const persona of round3Personas) {
  check(persona.id,'region','context','context',persona.context,normalizeRegionalContext(persona.context))
  const kr=persona.context.countryCode==='KR'
  check(persona.id,'region','context','localDate',kr?'2026-09-16':'2026-09-15',regionalDateKey(persona.context,clock))
  check(persona.id,'region','context','week',kr?{start:'2026-09-14',end:'2026-09-20'}:{start:'2026-09-13',end:'2026-09-19'},regionalWeekRange(persona.context,clock))
  let state=emptyBrief()
  const history=[],snapshots=[structuredClone(state)]
  for(const [index,entry] of persona.steps.entries()) {
    state=capture(persona,'turn-'+(index+1),'journey',state,entry,[...history])
    snapshots.push(structuredClone(state));history.push(entry.message)
  }
  for(const probe of persona.probes??[])capture(persona,probe.id,probe.kind,structuredClone(snapshots[probe.seedAfterTurn]),probe,history.slice(0,probe.seedAfterTurn))
  for(const probe of persona.agentProbes??[]) {
    const brief=structuredClone(snapshots[probe.seedAfterTurn]), toolTrace=[]
    // Preserve chronological user evidence, especially for stale-fact replay probes.
    const priorUserMessages=history.slice(0,probe.seedAfterTurn)
    const seeded=loadState({stage:5,messages:priorUserMessages.map(text=>({role:'user',text})),agent_v2_context:{brief}})
    check(persona.id,probe.id,'agent-path','seed-brief',brief,seeded.agent_v2_context.brief)
    check(persona.id,probe.id,'agent-path','seed-user-history',priorUserMessages,seeded.messages.filter(m=>m.role==='user').map(m=>m.text))
    let requests=0,captured=false,recovered=false,after=brief,error=null,reply=null
    try {
      const result=await runAgentTurn(seeded,probe.message,{
        now:kr?'2026년 9월 16일':'September 15, 2026',today:regionalDateKey(persona.context,clock),regionalContext:persona.context,
        request:async body=>{
          requests++
          if(requests>4||recovered)throw Error('fixture_sequence_exhausted: not a live model failure')
          const availableTools=body.tools.map(tool=>tool.name)
          let name,args
          if(captured) {
            recovered=true; name='respond'
            args={focus:'goals',goal_outcome:'',goal_draft:null,summary:kr?'말씀해 주신 내용을 기준으로 계속 정리할게요.':'Let us continue from the information you have shared.',details:[],question:probe.question,choices:[]}
          } else if(!availableTools.includes('record_goal_brief')) {
            name='route_request';args={module:'goal',evidence:probe.message}
          } else {
            captured=true;name='record_goal_brief'
            args={period:null,areas:[],area_changes:[],objective_changes:[],baselines:[],objectives:[],priority:null,capacity:null,feasibility_acceptance:null,...probe.candidate,
              reply:{paragraphs:[kr?'말씀해 주신 정보를 바탕으로 정리할게요.':'Let us base the plan on what you have shared.'],bullets:[],question:probe.question,choices:[],remember:[],forget:[]}}
          }
          assert.ok(availableTools.includes(name),'Fixture requested unavailable tool: '+name)
          toolTrace.push({availableTools,fixtureTool:name,fixtureArgs:args,previousToolResults:body.input.filter(item=>item.type==='function_call_output')})
          return {id:'fixture-'+requests,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,arguments:JSON.stringify(args),call_id:'fixture-call-'+requests}]}
        },
      })
      after=result.state.agent_v2_context.brief;reply=result.assistant_message
    }catch(cause){error=cause.message}
    const observed=verify(persona.id,probe.id,'agent-path',probe.expect,after,!error)
    check(persona.id,probe.id,'agent-path','storage-boundary',after,loadGoalBrief(JSON.parse(JSON.stringify(after))))
    traces.push({persona:persona.id,caseId:probe.id,kind:'agent-path',candidateKind:probe.candidateKind??'intended-extraction',
      userMessage:probe.message,priorUserMessages,seedAfterTurn:probe.seedAfterTurn,before:brief,afterReload:after,
      expected:probe.expect,observation:observed,accepted:!error,error,mockProviderRequests:requests,actualProviderCalls:0,
      toolTrace,renderedReplyFromFixture:reply,actualModelReply:null})
  }
  const own=checks.filter(check=>check.persona===persona.id)
  summaries.push({id:persona.id,age:persona.age,profile:persona.profile,situation:persona.situation,locale:persona.context.locale,
    authoredTurns:persona.steps.length,checks:own.length,passed:own.filter(c=>c.passed).length,failed:own.filter(c=>!c.passed).length,
    liveQuestionsNotTested:persona.liveQuestions,satisfaction:null,retention:null,willingnessToPay:null})
}
assert.deepEqual(await fingerprint(),source,'Source/fixtures changed during diagnosis')
const report={schemaVersion:1,studyType:'synthetic-offline-diagnostic-round3',startedAt,finishedAt:new Date().toISOString(),simulatedClock:clock.toISOString(),
  source,sourceUnchanged:true,syntheticPersonas:10,realParticipants:0,
  authoredJourneyTurns:round3Personas.reduce((n,p)=>n+p.steps.length,0),authoredBoundaryProbes:round3Personas.reduce((n,p)=>n+(p.probes?.length??0),0),
  authoredAgentProbes:round3Personas.reduce((n,p)=>n+(p.agentProbes?.length??0),0),providerCalls:0,incrementalModelApiCostUsd:0,productionWrites:0,productSourceModified:false,
  liveQualityValidated:false,uiTested:false,deploymentTested:false,
  limitations:['Fictional additional personas, not a representative real-user sample or survey.',
    'Tool candidates and recovery replies are authored fixtures, not model inference.',
    'Prior user evidence is explicitly seeded in agent probes; histories are diagnostic fixtures, not full real dialogues.',
    'State probes distinguish intended input, invalid candidates, controls and agent orchestration. One defect may fail several assertions.',
    'Pause test verifies only non-deletion; it does not validate a pause/resume workflow.',
    'No satisfaction, retention, willingness-to-pay, live model quality, latency or measured provider cost.'],
  totals:{assertions:checks.length,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length},summaries,traces,checks}
const folder=resolve(root,'logs/persona-pilot-round3',startedAt.replace(/[:.]/g,'-'))
await mkdir(folder,{recursive:true})
await writeFile(resolve(folder,'results.json'),JSON.stringify(report,null,2))
await writeFile(resolve(folder,'summary.md'),[
  '# 온주 — 3차 가상 사용자 10명 무료 진단','',
  '한국어 6명·영어 4명, 24~47세의 가상 설정. 실제 참여자 0명, 실제 AI 대화 품질 평가는 아님.','',
  `- 작성 여정 발언 ${report.authoredJourneyTurns}개 / 별도 상태 경계 ${report.authoredBoundaryProbes}개 / 모의 응답 기반 실제 에이전트 경로 ${report.authoredAgentProbes}개`,
  `- 조건 ${report.totals.assertions}개: 통과 ${report.totals.passed}, 실패 ${report.totals.failed}. 실패 수는 독립 결함 수나 사용자 실패율이 아니다.`,
  '- 공급자 API 0회 / 이번 추가 API 비용 $0 / 제품 코드 수정·배포 없음.','',
  '| ID | 가상 상황 | 통과 | 실패 |','|---|---|---:|---:|',...summaries.map(p=>`| ${p.id} | ${p.profile} | ${p.passed} | ${p.failed} |`),'',
  '## 실패 조건','',...checks.filter(c=>!c.passed).map(c=>`- ${c.persona} / ${c.caseId} / ${c.kind} / ${c.field}: 기대 ${JSON.stringify(c.expected)}, 실제 ${JSON.stringify(c.actual)}`),'',
  '## 해석 제한','',...report.limitations.map(text=>'- '+text),'',
  '원문·근거 후보·기대값·상태 전후·오류·모의 도구 응답·소스 지문은 results.json에 보존했다.','',
].join('\n'))
console.log(JSON.stringify({folder,totals:report.totals,journeyTurns:report.authoredJourneyTurns,boundaryProbes:report.authoredBoundaryProbes,agentProbes:report.authoredAgentProbes,providerCalls:0,
  failures:checks.filter(c=>!c.passed).map(({persona,caseId,field,expected,actual})=>({persona,caseId,field,expected,actual}))}))
if(report.totals.failed)process.exitCode=1
