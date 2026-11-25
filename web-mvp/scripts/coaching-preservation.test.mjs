import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {materializeGoalDraft, validGoalCard, goalSchema} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goal.ts'
import {coachingTimingIssue, renderConditionalRules, renderCoachingStep} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingTiming.ts'
import {newCoachingPlanIssue} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingPlan.ts'
import {planContextNotes, validContextNotes} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingNotes.ts'
import {initialGoalMessage} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalExecution.ts'
import {reviseGoal, draftMessage} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalRevision.ts'
import {loadState, runAgentTurn} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'

// Authored regression fixtures, NOT provider output or a model quality grade.
const proposal=()=>withCoachingDetails({category:'자기계발',outcome:'발표 자료 완성',identity:'',cue:'',environment:'',deadline:'',baselineMetric:'자료 초안 있음',targetMetric:'발표 자료 완성',durationWeeks:4,
  measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,planningEvidence:[],
  actions:[{title:'발표 자료 다듬기',frequencyPerWeek:2,durationMinutes:30,preferredDays:[],planningStyle:'repeat',completionCriterion:'수정 문장과 남은 질문 기록',minimumAction:'수정할 문장 하나 표시',minimumMinutes:1,
    steps:['현재 자료를 열고 수정할 부분을 표시합니다.','핵심 문장을 고쳐 읽고 이해하기 어려운 표현을 확인합니다.','수정 이유와 다음 시작 지점을 기록합니다.'],stepMinutes:[5,20,5],conditionalRules:['집중이 어려우면 수정 범위를 줄이고 다음 회차로 넘깁니다.']}]})
const card=()=>materializeGoalDraft(proposal())
const timing=step=>{
  const value=card();value.execution.actions[0].steps[1]=step
  return coachingTimingIssue(value)
}

test('conditional rules have a separate persisted schema; historical cards remain readable',()=>{
  assert.ok(goalSchema.properties.actions.items.required.includes('conditionalRules'))
  const value=card(),rules=value.execution.actions[0].conditionalRules
  assert.equal(newCoachingPlanIssue(value),null)
  assert.equal(value.execution.actions[0].stepMinutes.reduce((s,n)=>s+n,0),30)
  const rendered=initialGoalMessage(value)
  assert.ok(rendered.includes(renderConditionalRules(rules)))
  assert.equal((rendered.match(/집중이 어려우면/g)??[]).length,1)
  delete value.execution.actions[0].conditionalRules
  assert.equal(validGoalCard(value),true)
  assert.match(newCoachingPlanIssue(value),/new_coaching_rules_required/)
})

test('conditional-only steps cannot evade lint with prefixes, numbers or ordering words',()=>{
  for(const step of [
    '통증이 있으면 운동을 중단한다.',
    '만약 통증이 있으면 운동을 중단한다.',
    '먼저 통증이 있으면 운동을 중단한다.',
    '만약 호흡이 무너지면 2분 쉬고 걷기로 전환한다.',
    '필요한 경우 통증이 있으면 중단하고, 어지러우면 쉰다.',
    'If pain appears, stop immediately.',
    'Remember: if pain appears, stop for 2 minutes.',
  ]) assert.match(timing(step),/conditional_rule_is_not_timed_step/,step)
})

test('actual work, rest and recording remain eligible including an inline conditional sentence',()=>{
  for(const step of ['자료를 검토하고 문장 25개 중 12개를 정리합니다.','실행한다. 통증이 있으면 중단한다.','잠시 쉬면서 물을 마시고 다음 동작을 준비합니다.','기록을 정리하고 다음 시작점을 표시합니다.','화면 밝기를 줄이고 문장을 읽습니다.']) assert.equal(timing(step),null,step)
})

test('prose exceeding the allocation rejects minutes, seconds, hours and ranges',()=>{
  for(const step of ['편안한 조깅을 25분 동안 진행한다.','자료를 1201초 동안 검토한다.','자료를 0.5시간 검토한다.','검토 시간을 15~25분으로 잡는다.','Jog for 25 minutes.','Review for 0.5 hours.','이 단계는 15분으로 진행한다.']) assert.match(timing(step),/coaching_text_time_conflict/,step)
})

test('intervals, sets, rest and repetitions are not mistaken for whole-step totals',()=>{
  for(const step of ['1분 달리기와 1분 걷기를 반복한다.','팔굽혀펴기 25회씩 진행하고 세트 사이 60초 쉰다.','20분 안에서 문장을 검토하고 마지막에 요약한다.','이 단계는 20분으로 진행한다.','Read for 10 minutes and write notes during the remaining time.']) assert.equal(timing(step),null,step)
})

test('adjacent compound durations cannot each pass while exceeding their total budget',()=>{
  for (const step of ['20분 30초 동안 검토합니다.', 'Review for 20 minutes 30 seconds.']) assert.match(timing(step),/coaching_text_time_conflict/)
  assert.equal(timing('19분 30초 동안 검토하고 짧게 정리합니다.'),null)
})

test('rendering uses the same canonical time and translates only UI labels',()=>{
  assert.equal(renderCoachingStep('Review a paragraph.',2,text=>({'예상':'Estimate','분':' min','휴식·전환 포함':'including breaks'}[text]??text)),'Review a paragraph. · Estimate 2 min(including breaks)')
  assert.doesNotMatch(renderConditionalRules(['힘들면 쉬세요.']),/예상|분/)
})

test('unique paragraphs and bullets survive; only exact duplicate blocks are removed',()=>{
  const value=card(),reason=value.execution.coachingGuide.rationale
  const important='공유하기 전에 작성자의 동의를 확인하세요.'
  const nearDuplicate=`${reason} ${important}`
  assert.deepEqual(planContextNotes(value,[reason,important,nearDuplicate],[important,'기록에는 실명을 쓰지 마세요.']),[important,nearDuplicate,'기록에는 실명을 쓰지 마세요.'])
  assert.equal(validContextNotes([null]),false)
  assert.throws(()=>planContextNotes(value,['x'.repeat(901)],[]),/context_notes_invalid/)
})

test('important guidance survives response -> card -> approval -> reload and compact rendering',async()=>{
  const base=loadState({stage:5,agent_v2_context:{brief:{period:{label:'4주',weeks:4},areas:['발표'],baselines:[{area:'발표',current:'자료 초안 있음',status:'known'}],objectives:[{area:'발표',result:'발표 자료 완성'}],capacity:{summary:'주 2회 30분 가능',status:'known'}}}})
  const note='공유하기 전에 작성자의 동의를 확인하세요.',bullet='기록에는 실명을 쓰지 마세요.'
  let calls=0
  const result=await runAgentTurn(base,'이 조건으로 계획을 만들어줘',{now:'2026-09-17T07:00:00Z',request:async()=>{
    assert.equal(++calls,1)
    return {id:'offline',model:'fixture',output:[{type:'function_call',call_id:'offline',name:'respond',arguments:JSON.stringify({focus:'goals',intent:'seek_advice',move:'suggest',confidence:'high',expects_reply:true,open_threads:[],remember:[],forget:[],question_updates:[],paragraphs:[note],bullets:[bullet],question:'',choices:[],goal_outcome:'',goal_draft:proposal()})}]}
  }})
  const draft=result.state.agent_v2_context.draft
  assert.deepEqual(draft.card.execution.contextNotes,[note,bullet])
  for(const text of [note,bullet]) {
    assert.equal(result.assistant_message.split(text).length-1,1)
    assert.ok(initialGoalMessage(draft.card,[],true).includes(text))
  }
  const accepted=await runAgentTurn(loadState(JSON.parse(JSON.stringify(result.state))),'이 초안으로 시작할게요',{now:'2026-09-17T07:01:00Z',request:async()=>{throw Error('provider forbidden')}},{draftId:draft.id})
  assert.deepEqual(loadState(JSON.parse(JSON.stringify(accepted.state))).goal_card.execution,draft.card.execution)
})

test('revisions must reconsider existing rules and notes without mutating the approved card',()=>{
  const value=card();value.execution.contextNotes=['공유하기 전에 작성자의 동의를 확인하세요.']
  const before=structuredClone(value)
  const edit={field:'durationMinutes',actionIndex:0,number:15,text:null,days:null,evidence:'시간만 15분'}
  const fresh={scope:'requested',guide:value.execution.coachingGuide,steps:[['한 문단을 검토하고 수정합니다.','수정 이유와 다음 시작점을 기록합니다.']],stepMinutes:[[12,3]]}
  assert.throws(()=>reviseGoal(value,[edit],'시간만 15분으로 바꿔줘',[fresh]),/revised_coaching_rules_required/)
  fresh.conditionalRules=[value.execution.actions[0].conditionalRules]
  assert.throws(()=>reviseGoal(value,[edit],'시간만 15분으로 바꿔줘',[fresh]),/revised_coaching_context_required/)
  fresh.contextNotes=value.execution.contextNotes
  const revised=reviseGoal(value,[edit],'시간만 15분으로 바꿔줘',[fresh])
  const rendered=draftMessage({...revised,id:'offline',presentedMessageId:'offline'})
  assert.ok(rendered.includes(value.execution.contextNotes[0]))
  assert.ok(rendered.includes(value.execution.actions[0].conditionalRules[0]))
  assert.deepEqual(value,before)
})
