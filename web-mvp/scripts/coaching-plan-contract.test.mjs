import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyGoal,materializeGoalDraft,validGoalCard,goalSchema} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goal.ts'
import {newCoachingPlanIssue} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingPlan.ts'
import {coachingTimingIssue,validStepMinutes} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingTiming.ts'
import {initialGoalMessage} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalExecution.ts'
import {reviseGoal,draftMessage} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalRevision.ts'
import {loadState,runAgentTurn} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'

// Authored work example, NOT a generated/model-graded response. Tests enforce
// storage, validation and approval behavior without copying the fitness source.
const guide={rationale:'이미 작성한 초안이 있으므로 새로 쓰기보다 독자가 이해할 수 있는지 검토하는 데 시간을 배분합니다.',
  progression:'첫 주에는 한 문단의 핵심을 독자에게 설명하고 이해하기 어려웠던 표현을 기록합니다. 같은 문제가 없어지면 다음 문단으로 갑니다.',
  tracking:'수정한 문단과 남은 질문을 적어 주세요. 예: 소개 문단 / 목적이 모호했음 / 핵심 문장 수정.',
  adjustment:'핵심을 설명하기 어려우면 같은 시간 안에서 검토할 문단 수를 줄이고 표현을 다시 정리합니다.',
  recovery:'하루 놓치면 밀린 양을 더하지 않고 표시해 둔 문단부터 이어갑니다.'}
const proposal=()=>({category:'일·커리어',outcome:'소개 문서 완성',identity:'',cue:'',environment:'',deadline:'',baselineMetric:'소개 문서 초안 작성됨',targetMetric:'소개 문서 완성',durationWeeks:4,
  measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,progressStrategy:'매주 설명하기 어려운 문단을 확인하고 이해되지 않는 문단은 같은 시간 안에서 범위를 줄입니다.',coachingGuide:structuredClone(guide),planningEvidence:[],
  actions:[{title:'소개 문단 검토',frequencyPerWeek:2,durationMinutes:20,preferredDays:[],planningStyle:'repeat',goalResult:'소개 문서 완성',completionCriterion:'핵심 문장과 수정 이유 기록',minimumAction:'소개 문단 한 문장 표시',minimumMinutes:1,
    steps:['기존 문단을 열고 가장 전달하고 싶은 내용을 표시합니다.','핵심 문장을 다시 쓰고 소리 내어 읽으며 뜻을 확인합니다.','바뀐 표현과 다음에 검토할 문단을 기록합니다.'],stepMinutes:[2,15,3],conditionalRules:[]}]})
const saved=()=>loadState({stage:5,agent_v2_context:{brief:{period:{label:'4주',weeks:4},areas:['문서 작성'],baselines:[{area:'문서 작성',current:'소개 문서 초안 작성됨',status:'known'}],objectives:[{area:'문서 작성',result:'소개 문서 완성'}],capacity:{summary:'주 2회 20분 가능',status:'known'}}}})
const reply=goal_draft=>({focus:'goals',intent:'seek_advice',move:'suggest',confidence:'high',expects_reply:true,open_threads:[],remember:[],forget:[],question_updates:[],paragraphs:['기존 초안을 검토하는 방향으로 진행할 수 있어요.'],bullets:[],question:'',choices:[],goal_outcome:'',goal_draft})
const output=(args,i)=>({id:`offline-${i}`,model:'fixture',output:[{type:'function_call',name:'respond',call_id:`c${i}`,arguments:JSON.stringify(args)}]})

test('new-plan requirements are independent of old-card deserialization',()=>{
  const card=materializeGoalDraft(proposal())
  assert.equal(newCoachingPlanIssue(card),null)
  delete card.execution.coachingGuide
  assert.equal(validGoalCard(card),true,'historical data is not corrupted')
  assert.match(newCoachingPlanIssue(card),/new_coaching_guide_required/)
  assert.deepEqual(loadState({goal_card:card}).goal_card,card)
  const old={...emptyGoal,outcome:'기존 목표',durationWeeks:4,targetMetric:'완료',weeklyActions:[{title:'문서 검토',frequencyPerWeek:2,durationMinutes:20,preferredDays:[]}]}
  assert.equal(validGoalCard(old),true)
  assert.match(newCoachingPlanIssue(old),/required/)
})

test('new schema requires timing and rejects missing methods or timing at the server',()=>{
  assert.ok(goalSchema.properties.actions.items.required.includes('stepMinutes'))
  for(const field of ['steps','goalResult','stepMinutes','conditionalRules']){
    const card=materializeGoalDraft(proposal());delete card.execution.actions[0][field]
    assert.match(newCoachingPlanIssue(card),/required/,field)
  }
  for(const value of [[],[1,2],[1,2,NaN],[1,2,Infinity],[0,10,10],[1,-2,21],[1,2,'3']])assert.equal(validStepMinutes(value,3),false)
})

test('timing rejects a one-minute overflow without silently changing user capacity',()=>{
  const card=materializeGoalDraft(proposal()),before=structuredClone(card)
  assert.equal(coachingTimingIssue(card),null)
  card.execution.actions[0].stepMinutes=[3,15,3]
  assert.match(coachingTimingIssue(card),/time_exceeds_session/)
  assert.equal(card.weeklyActions[0].durationMinutes,20)
  assert.equal(before.execution.actions[0].stepMinutes.reduce((s,n)=>s+n,0),20)
  card.execution.actions[0].stepMinutes=[2,12,3]
  assert.match(coachingTimingIssue(card),/time_unallocated/,'rest and buffer must be budgeted too')
  card.execution.actions[0].stepMinutes=[2,14.5,3.5]
  assert.equal(coachingTimingIssue(card),null)
})

test('new legacy-shaped draft cannot bypass guide gate, repair is isolated until consent',async()=>{
  const old=materializeGoalDraft(proposal());delete old.execution.coachingGuide
  const base=saved();let calls=0
  const proposed=await runAgentTurn(base,'이 조건으로 계획을 만들어줘',{now:'2026-09-17T05:00:00Z',request:async body=>{
    calls++;assert.ok(calls<=2)
    if(calls===2)assert.match(JSON.stringify(body.input),/new_coaching_guide_required/)
    return output(reply(calls===1?old:proposal()),calls)
  }})
  assert.equal(calls,2)
  assert.equal(proposed.state.goal_card.weeklyActions.length,0)
  assert.deepEqual(base,saved())
  const draft=proposed.state.agent_v2_context.draft
  assert.deepEqual(draft.card.execution.actions[0].stepMinutes,[2,15,3])
  for(const n of [2,15,3])assert.ok(proposed.assistant_message.includes(`예상 ${n}분`))
  const committed=await runAgentTurn(loadState(JSON.parse(JSON.stringify(proposed.state))),'이 초안으로 시작할게요',{now:'2026-09-17T05:01:00Z',request:async()=>{throw Error('no provider during explicit approval')}},{draftId:draft.id})
  assert.deepEqual(committed.state.goal_card.execution,draft.card.execution)
  assert.deepEqual(loadState(JSON.parse(JSON.stringify(committed.state))).goal_card.execution,draft.card.execution)
})

test('time reduction requires a matching new budget and cannot mutate approved conditions',()=>{
  const card=materializeGoalDraft(proposal()),before=structuredClone(card)
  const edit={field:'durationMinutes',actionIndex:0,number:10,text:null,days:null,evidence:'시간만 10분'}
  const fresh={scope:'requested',guide,conditionalRules:[[]],steps:[['첫 문단만 읽고 핵심 문장을 고칩니다.','수정 이유와 다음 시작 문장을 적습니다.']]}
  assert.throws(()=>reviseGoal(card,[edit],'시간만 10분으로 바꿔줘',[fresh]),/timing_required/)
  assert.throws(()=>reviseGoal(card,[edit],'시간만 10분으로 바꿔줘',[{...fresh,stepMinutes:[[9,3]]}]),/time_exceeds/)
  assert.throws(()=>reviseGoal(card,[edit],'시간만 10분으로 바꿔줘',[{...fresh,stepMinutes:[[7,3]],guide:{...guide,tracking:'열심히 해 주세요. 기록을 남겨요.'}}]),/tracking_example/)
  const changed=reviseGoal(card,[edit],'시간만 10분으로 바꿔줘',[{...fresh,stepMinutes:[[7,3]]}])
  assert.equal(changed.card.weeklyActions[0].durationMinutes,10)
  assert.equal(changed.card.targetMetric,before.targetMetric)
  assert.equal(changed.card.weeklyActions[0].frequencyPerWeek,2)
  assert.ok(draftMessage({...changed,id:'fixture',presentedMessageId:'fixture'}).includes('예상 7분'))
  assert.deepEqual(card,before)
})

test('detailed methods precede management and do not bloat the compact overview',()=>{
  const card=materializeGoalDraft(proposal()),text=initialGoalMessage(card)
  assert.ok(text.indexOf('이번 주 행동')<text.indexOf('실행 방법'))
  assert.ok(text.startsWith(card.execution.coachingGuide.rationale))
  assert.ok(text.indexOf('실행 방법')<text.indexOf('기간 동안의 진행 방법'))
  assert.ok(text.indexOf('기록에 따른 조정')<text.indexOf('이대로 시작할까요'))
  assert.equal((text.match(/소개 문단 한 문장 표시/g)??[]).length,0)
  assert.doesNotMatch(initialGoalMessage(card,[],true),/예상 15분|이렇게 구성한 이유/)
})
