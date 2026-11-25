import '../../scripts/offline-network-guard.mjs'
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,dirname,relative} from 'node:path'
import {fileURLToPath} from 'node:url'
import {emptyBrief,updateGoalBrief,loadGoalBrief,missingGoalBrief} from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import {assessGoalFeasibility,nextGoalIntakeStep,goalFeasibilityIssue,parseGoalQuantity} from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import {materializeGoalDraft,validGoalCard} from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goal.ts'
import {loadState,runAgentTurn} from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import {normalizeRegionalContext,regionalDateKey,regionalWeekRange} from '../../../logs/sites/onju-web-mvp/web-mvp/src/regionalContext.ts'
import {parseGoalCapacity} from '../../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import {round9Personas,round9FixtureCorrections} from './round9-personas.mjs'

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
    gaps:assessment.gaps,gapCount:assessment.gaps.length,feasibilityReady:assessment.status==='ready',next:nextGoalIntakeStep(state,missingGoalBrief(state)),conflicts:assessment.conflicts,
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
    priorUserMessages:history,deliberatelyUngroundedEvidence:Boolean(entry.allowUngroundedEvidence),expected:entry.expect,accepted,error,before,immediatelyAfterUpdate:candidateState,afterReload:after,
    observation,assessment:assessGoalFeasibility(after),actualModelReply:null})
  return after
}
function exactEvidence(candidate,sources,label) {
  if(!candidate||typeof candidate!=='object')return
  if(typeof candidate.evidence==='string')assert.ok(sources.some(text=>text.includes(candidate.evidence)),`Fixture evidence not in its source: ${label}: ${candidate.evidence}`)
  for(const value of Object.values(candidate))if(Array.isArray(value))value.forEach(item=>exactEvidence(item,sources,label));else if(value&&typeof value==='object')exactEvidence(value,sources,label)
}
// Validate the authored function response against the actual request schema.
// Fixture mistakes must not be reported as semantic product defects.
function schemaCheck(value,schema,label) {
  if(schema.anyOf) {
    const valid=schema.anyOf.some(branch=>{try{schemaCheck(value,branch,label);return true}catch{return false}})
    assert.ok(valid,'Fixture schema union mismatch: '+label);return
  }
  if(schema.enum)assert.ok(schema.enum.includes(value),'Fixture enum mismatch: '+label)
  if(schema.type==='null'){assert.equal(value,null,label);return}
  if(schema.type==='object') {
    assert.ok(value&&typeof value==='object'&&!Array.isArray(value),label)
    for(const key of schema.required??[])assert.ok(key in value,'Missing fixture argument: '+label+'.'+key)
    if(schema.additionalProperties===false)for(const key of Object.keys(value))assert.ok(key in schema.properties,'Extra fixture argument: '+label+'.'+key)
    for(const [key,child] of Object.entries(schema.properties??{}))if(key in value)schemaCheck(value[key],child,label+'.'+key)
  } else if(schema.type==='array') {
    assert.ok(Array.isArray(value),label)
    if(schema.minItems!==undefined)assert.ok(value.length>=schema.minItems,label)
    if(schema.maxItems!==undefined)assert.ok(value.length<=schema.maxItems,label)
    value.forEach((item,index)=>schemaCheck(item,schema.items,label+'['+index+']'))
  } else if(schema.type==='string') {
    assert.equal(typeof value,'string',label)
    if(schema.minLength!==undefined)assert.ok(value.length>=schema.minLength,label)
    if(schema.maxLength!==undefined)assert.ok(value.length<=schema.maxLength,label)
  } else if(schema.type==='boolean')assert.equal(typeof value,'boolean',label)
  else if(schema.type==='integer'||schema.type==='number') {
    assert.equal(typeof value,'number',label)
    if(schema.type==='integer')assert.ok(Number.isInteger(value),label)
    if(schema.minimum!==undefined)assert.ok(value>=schema.minimum,label)
    if(schema.maximum!==undefined)assert.ok(value<=schema.maximum,label)
  }
}
assert.equal(round9Personas.length,20)
assert.equal(new Set(round9Personas.map(p=>p.id)).size,20)
assert.ok(round9Personas.every(p=>p.synthetic&&p.age>=20&&p.age<50))
assert.equal(round9Personas.filter(p=>p.context.locale==='ko-KR').length,10)
assert.equal(round9Personas.filter(p=>p.context.locale==='en-US').length,10)
// Preflight fixture consistency before executing product behavior.
for(const p of round9Personas) {
  p.steps.forEach((entry,index)=>exactEvidence(entry.candidate,p.steps.slice(0,index).map(s=>s.message).concat(entry.message),p.id+'/turn-'+(index+1)))
  for(const entry of [...(p.probes??[]),...(p.agentProbes??[])]) {
    assert.ok(entry.seedAfterTurn>=0&&entry.seedAfterTurn<=p.steps.length)
    if(!entry.allowUngroundedEvidence)exactEvidence(entry.candidate,p.steps.slice(0,entry.seedAfterTurn).map(s=>s.message).concat(entry.message),p.id+'/'+entry.id)
  }
  for(const entry of p.draftProbes??[]) {
    assert.ok(entry.seedAfterTurn>=1&&entry.seedAfterTurn<=p.steps.length)
    assert.ok(Number.isInteger(entry.frequency)&&entry.frequency>=1&&entry.frequency<=7)
    assert.ok(Number.isInteger(entry.minutes)&&entry.minutes>=1&&entry.minutes<=240)
  }
}
const previousIds=new Set()
for(const file of ['personas.mjs','expanded-personas.mjs','round3-personas.mjs','round4-personas.mjs','round5-personas.mjs','round6-personas.mjs','round7-personas.mjs','round8-personas.mjs']) {
  const previous=await readFile(new URL(file,import.meta.url),'utf8')
  for(const match of previous.matchAll(/\bid:\s*['"]((?:KR|US)-\d+)['"]/g))previousIds.add(match[1])
}
assert.ok(round9Personas.every(p=>!previousIds.has(p.id)),'Synthetic participant ID overlaps a previous study')
const summaries=[]
for(const persona of round9Personas) {
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
    let requests=0,captured=false,captureCallId=null,captureResult=null,boundaryObserved=false,after=brief,error=null,reply=null
    try {
      const result=await runAgentTurn(seeded,probe.message,{
        now:kr?'2026년 9월 16일':'September 15, 2026',today:regionalDateKey(persona.context,clock),regionalContext:persona.context,
        request:async body=>{
          requests++
          if(requests>4)throw Error('fixture_sequence_exhausted: not a live model failure')
          const availableTools=body.tools.map(tool=>tool.name)
          let name,args
          if(captured) {
            // Observe the real capture handler's result, then deliberately stop
            // BEFORE draft generation. Do not invent a schema-invalid final reply
            // to make a complete brief end without an execution draft.
            const output=body.input.find(item=>item.type==='function_call_output'&&item.call_id===captureCallId)
            assert.ok(output,'Missing capture result in fixture boundary')
            captureResult=JSON.parse(output.output)
            after=captureResult.ok&&captureResult.goalBrief?loadGoalBrief(captureResult.goalBrief):brief
            boundaryObserved=true
            throw Error('DIAGNOSTIC_CAPTURE_BOUNDARY_REACHED')
          } else if(!availableTools.includes('record_goal_brief')) {
            name='route_request';args={module:'goal',evidence:probe.message,reason:'Inspect this goal-information capture.'}
          } else {
            captured=true;name='record_goal_brief'
            args={period:null,areas:[],area_changes:[],objective_changes:[],baselines:[],objectives:[],priority:null,capacity:null,feasibility_acceptance:null,...probe.candidate,
              reply:{paragraphs:[kr?'말씀해 주신 정보를 바탕으로 정리할게요.':'Let us base the plan on what you have shared.'],bullets:[],question:probe.question,question_updates:[],choices:[],remember:[],forget:[]}}
          }
          assert.ok(availableTools.includes(name),'Fixture requested unavailable tool: '+name)
          const schema=body.tools.find(tool=>tool.name===name).parameters
          schemaCheck(args,schema,name)
          if(name==='record_goal_brief')captureCallId='fixture-call-'+requests
          toolTrace.push({availableTools,fixtureTool:name,fixtureArgs:args,previousToolResults:body.input.filter(item=>item.type==='function_call_output')})
          return {id:'fixture-'+requests,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,arguments:JSON.stringify(args),call_id:'fixture-call-'+requests}]}
        },
      })
      after=result.state.agent_v2_context.brief;reply=result.assistant_message
      // A valid inline clarification can finish at the first capture. Observe
      // its real projected event instead of requiring another provider request.
      const event=result.events.findLast(item=>item.tool==='record_goal_brief')
      assert.ok(event,'Missing completed capture event')
      captureResult=event.result
    }catch(cause){if(cause.message!=='DIAGNOSTIC_CAPTURE_BOUNDARY_REACHED'||!boundaryObserved)error=cause.message}
    check(persona.id,probe.id,'agent-harness','fixture-execution-error',null,error)
    check(persona.id,probe.id,'agent-harness','capture-result-observed',true,boundaryObserved||captureResult!==null)
    const observed=verify(persona.id,probe.id,'agent-path',probe.expect,after,!error&&captureResult?.ok===true)
    check(persona.id,probe.id,'agent-path','storage-boundary',after,loadGoalBrief(JSON.parse(JSON.stringify(after))))
    traces.push({persona:persona.id,caseId:probe.id,kind:'agent-path',candidateKind:probe.candidateKind??'intended-extraction',
      userMessage:probe.message,priorUserMessages,seedAfterTurn:probe.seedAfterTurn,before:brief,afterReload:after,
      expected:probe.expect,observation:observed,accepted:!error&&captureResult?.ok===true,error,mockProviderRequests:requests,actualProviderCalls:0,
      completedFullTurn:!boundaryObserved&&!error,stoppedAtCaptureBoundary:boundaryObserved,captureResult,returnedMockResponses:toolTrace.length,
      toolTrace,renderedReplyFromFixture:reply,actualModelReply:null})
  }
  for(const probe of persona.capacityProbes??[]) {
    const actual=parseGoalCapacity(probe.text)
    check(persona.id,probe.id,'capacity-boundary','limits',probe.expected,actual)
    traces.push({persona:persona.id,caseId:probe.id,kind:'capacity-boundary',text:probe.text,expected:probe.expected,actual,actualModelReply:null})
  }
  for(const probe of persona.quantityProbes??[]) {
    const actual=parseGoalQuantity(probe.text)
    check(persona.id,probe.id,'quantity-boundary','quantity',probe.expected,actual)
    traces.push({persona:persona.id,caseId:probe.id,kind:'quantity-boundary',text:probe.text,expected:probe.expected,actual,actualModelReply:null})
  }
  for(const probe of persona.draftProbes??[]) {
    const seeded=structuredClone(snapshots[probe.seedAfterTurn]), before=structuredClone(seeded)
    let brief=seeded
    if(probe.capacityCorrection) brief=updateGoalBrief(brief,{capacity:{summary:probe.capacityCorrection,evidence:probe.capacityCorrection,status:'known'}},probe.capacityCorrection)
    if(!brief.period || !brief.objectives[0] || !brief.baselines[0]) {
      check(persona.id,probe.id,'draft-boundary','seed-ready',true,false)
      traces.push({persona:persona.id,caseId:probe.id,kind:'draft-boundary',before,brief,error:'seed_incomplete: draft not tested',actualModelReply:null})
      continue
    }
    const proposal={category:brief.areas[0],outcome:brief.objectives[0].result,identity:'',cue:'',environment:'',
      deadline:brief.period.deadline??'',baselineMetric:brief.baselines[0].current,targetMetric:brief.objectives[0].result,durationWeeks:brief.period.weeks,
      measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,progressStrategy:'첫 주 실제 완료 횟수와 걸린 시간을 기록하고 다음 주 실행량을 다시 제안합니다.',
      actions:[{title:brief.areas[0]+' practice',frequencyPerWeek:probe.frequency,durationMinutes:probe.minutes,preferredDays:probe.preferredDays??[],planningStyle:'repeat',
        completionCriterion:'Record the work actually completed',minimumAction:'Open the working material',minimumMinutes:1,goalResult:brief.objectives[0].result,
        steps:['Open the working material','Practice and record the result']}]}
    if(probe.actions) proposal.actions=probe.actions.map((action,index)=>({
      ...proposal.actions[0], title:action.area+' practice '+(index+1),
      frequencyPerWeek:action.frequency, durationMinutes:action.minutes, preferredDays:action.preferredDays??[],
      goalResult:brief.objectives.find(item=>item.area===action.area)?.result??brief.objectives[0].result,
    }))
    const card=materializeGoalDraft(proposal,brief.areas)
    assert.ok(card&&validGoalCard(card),'Invalid authored draft fixture: '+persona.id+'/'+probe.id)
    const actualIssue=goalFeasibilityIssue(card,brief), code=actualIssue?.split(':')[0]??null
    check(persona.id,probe.id,'draft-boundary','issue-code',probe.expectIssue,code)
    check(persona.id,probe.id,'draft-boundary','seed-immutable',before,seeded)
    traces.push({persona:persona.id,caseId:probe.id,kind:'draft-boundary',before,brief,proposal,card,expectedIssue:probe.expectIssue,actualIssue,actualIssueCode:code,
      capacityCorrection:probe.capacityCorrection??null,scope:'goalFeasibilityIssue only, not end-to-end draft acceptance',actualModelReply:null})
  }
  const own=checks.filter(check=>check.persona===persona.id)
  summaries.push({id:persona.id,age:persona.age,profile:persona.profile,situation:persona.situation,locale:persona.context.locale,
    authoredTurns:persona.steps.length,checks:own.length,passed:own.filter(c=>c.passed).length,failed:own.filter(c=>!c.passed).length,
    liveQuestionsNotTested:persona.liveQuestions??[persona.situation],satisfaction:null,retention:null,willingnessToPay:null})
}
assert.deepEqual(await fingerprint(),source,'Source/fixtures changed during diagnosis')
const report={schemaVersion:1,studyType:'synthetic-offline-diagnostic-round9',startedAt,finishedAt:new Date().toISOString(),simulatedClock:clock.toISOString(),
  fixtureCorrections:round9FixtureCorrections,
  source,sourceUnchanged:true,syntheticPersonas:20,realParticipants:0,
  authoredJourneyTurns:round9Personas.reduce((n,p)=>n+p.steps.length,0),authoredBoundaryProbes:round9Personas.reduce((n,p)=>n+(p.probes?.length??0),0),
  authoredCapacityProbes:round9Personas.reduce((n,p)=>n+(p.capacityProbes?.length??0),0),
  authoredDraftProbes:round9Personas.reduce((n,p)=>n+(p.draftProbes?.length??0),0),authoredQuantityProbes:round9Personas.reduce((n,p)=>n+(p.quantityProbes?.length??0),0),
  authoredAgentProbes:round9Personas.reduce((n,p)=>n+(p.agentProbes?.length??0),0),providerCalls:0,incrementalModelApiCostUsd:0,productionWrites:0,productSourceModified:false,
  liveQualityValidated:false,uiTested:false,deploymentTested:false,
  limitations:['Fictional additional personas, not a representative real-user sample or survey.',
    'Tool candidates and recovery replies are authored fixtures, not model inference.',
    'Prior user evidence is explicitly seeded in agent probes; histories are diagnostic fixtures, not full real dialogues.',
    'State probes distinguish intended input, invalid candidates, controls and agent orchestration. One defect may fail several assertions.',
    'Agent probes inspect the real capture-handler output and deliberately stop before draft generation when needed; this is not a completed real-user turn.',
    'Draft probes test only the local feasibility guard on a valid authored card; another end-to-end guard may still block it.',
    'Quantity probes test normalization directly; they are not model arithmetic outputs.',
    'No satisfaction, retention, willingness-to-pay, live model quality, latency or measured provider cost.'],
  totals:{assertions:checks.length,passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length},summaries,traces,checks}
const folder=resolve(root,'logs/persona-pilot-round9',startedAt.replace(/[:.]/g,'-'))
await mkdir(folder,{recursive:true})
await writeFile(resolve(folder,'results.json'),JSON.stringify(report,null,2))
await writeFile(resolve(folder,'summary.md'),[
  '# 온주 — 9차 가상 사용자 20명 무료 진단','',
  '한국어 10명·영어 10명, 20~49세의 가상 설정. 실제 참여자 0명, 실제 AI 대화 품질 평가는 아님.','',
  `- 작성 여정 발언 ${report.authoredJourneyTurns}개 / 별도 상태 경계 ${report.authoredBoundaryProbes}개 / 모의 응답 기반 실제 에이전트 경로 ${report.authoredAgentProbes}개`,
  `- 추가 계산 경계: 초안 가용 시간 검사 ${report.authoredDraftProbes}개 / 수량 정규화 ${report.authoredQuantityProbes}개 / 구조화 예산 ${report.authoredCapacityProbes}개. 초안 검사는 최종 전체 승인과 다름.`,
  `- 조건 ${report.totals.assertions}개: 통과 ${report.totals.passed}, 실패 ${report.totals.failed}. 실패 수는 독립 결함 수나 사용자 실패율이 아니다.`,
  '- 공급자 API 0회 / 이번 추가 API 비용 $0 / 제품 코드 수정·배포 없음.','',
  '| ID | 가상 상황 | 통과 | 실패 |','|---|---|---:|---:|',...summaries.map(p=>`| ${p.id} | ${p.profile} | ${p.passed} | ${p.failed} |`),'',
  '## 실패 조건','',...checks.filter(c=>!c.passed).map(c=>`- ${c.persona} / ${c.caseId} / ${c.kind} / ${c.field}: 기대 ${JSON.stringify(c.expected)}, 실제 ${JSON.stringify(c.actual)}`),'',
  '## 해석 제한','',...report.limitations.map(text=>'- '+text),'',
  '## 테스트 작성 오류 정정','',...report.fixtureCorrections.map(item=>`- ${item.caseId}: ${item.reason} 초기 결과는 ${item.preliminaryReport}에 보존. 제품 수정 없음.`),'',
  '원문·근거 후보·기대값·상태 전후·오류·모의 도구 응답·소스 지문은 results.json에 보존했다.','',
].join('\n'))
console.log(JSON.stringify({folder,totals:report.totals,journeyTurns:report.authoredJourneyTurns,boundaryProbes:report.authoredBoundaryProbes,agentProbes:report.authoredAgentProbes,draftProbes:report.authoredDraftProbes,quantityProbes:report.authoredQuantityProbes,capacityProbes:report.authoredCapacityProbes,providerCalls:0,
  failures:checks.filter(c=>!c.passed).map(({persona,caseId,field,expected,actual})=>({persona,caseId,field,expected,actual}))}))
if(report.totals.failed)process.exitCode=1
