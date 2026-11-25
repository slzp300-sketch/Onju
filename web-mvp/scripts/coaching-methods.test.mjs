import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {materializeGoalDraft,goalSchema} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goal.ts'
import {coachingTimingIssue,renderCoachingStep} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingTiming.ts'
import {validTimedRepeats,repeatedSeconds} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/timedRepeats.ts'
import {reviseGoal,goalEditSchema,draftMessage} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalRevision.ts'
import {initialGoalMessage} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalExecution.ts'
import {loadState,runAgentTurn} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'

// Authored fixtures, not live model answers or a quality grade.
const makeCard=()=>materializeGoalDraft(withCoachingDetails({category:'건강',outcome:'체력 향상',identity:'',cue:'',environment:'',deadline:'',baselineMetric:'턱걸이 10회',targetMetric:'턱걸이 12회',durationWeeks:12,measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,planningEvidence:[],actions:[
  {title:'근력 A',frequencyPerWeek:1,durationMinutes:30,preferredDays:[],planningStyle:'repeat',completionCriterion:'실제 반복 수 기록',minimumAction:'자세 연습 한 번',minimumMinutes:1,steps:['관절을 가볍게 움직여 준비한다.','턱걸이 5회씩 3세트, 세트 사이 60초 쉰다.','실제 반복 수와 힘든 정도를 기록한다.'],stepMinutes:[5,20,5]},
  {title:'유산소 B',frequencyPerWeek:1,durationMinutes:30,preferredDays:[],planningStyle:'repeat',completionCriterion:'실제 진행 시간 기록',minimumAction:'가볍게 걷기 시작',minimumMinutes:1,steps:['가볍게 걸으며 준비한다.','편안한 속도로 걷기와 달리기를 번갈아 한다.','호흡을 정리하고 진행 시간을 기록한다.'],stepMinutes:[5,20,5]},
]}))
const repeat=(rounds=10)=>({stepIndex:1,rounds,segmentSeconds:[60,60],restSeconds:0,restPlacement:'none'})
const withRepeat=(rounds=10)=>{
  const card=makeCard(),a=card.execution.actions[1]
  a.steps[1]=`조깅 1분과 걷기 1분을 한 묶음으로 총 ${rounds}회 반복한다.`
  a.timedRepeats=[repeat(rounds)]
  return card
}
const refresh=card=>({scope:'requested',guide:structuredClone(card.execution.coachingGuide),steps:card.execution.actions.map(a=>[...a.steps]),stepMinutes:card.execution.actions.map(a=>[...a.stepMinutes]),timedRepeats:card.execution.actions.map(a=>structuredClone(a.timedRepeats??[])),conditionalRules:card.execution.actions.map(a=>[...a.conditionalRules]),contextNotes:[...(card.execution.contextNotes??[])]})
const request='시간과 주당 횟수는 그대로 두고 턱걸이 반복만 줄여줘'
const edit={field:'executionMethod',actionIndex:0,text:'턱걸이',number:null,days:null,evidence:request}
const changed=card=>{const fresh=refresh(card);fresh.steps[0][1]='턱걸이 3회씩 3세트, 세트 사이 60초 쉰다.';return fresh}

test('schema exposes calculable intervals and method-only edits',()=>{
  assert.ok(goalSchema.properties.actions.items.required.includes('timedRepeats'))
  assert.ok(goalEditSchema.items.properties.field.enum.includes('executionMethod'))
})
test('original 1+1 minute x12 fails a 20-minute budget; x10 passes',()=>{
  assert.match(coachingTimingIssue(withRepeat(12)),/repeats_exceed_step/)
  assert.equal(coachingTimingIssue(withRepeat(10)),null)
  const card=withRepeat(12);delete card.execution.actions[1].timedRepeats
  assert.match(coachingTimingIssue(card),/repeats_required/)
})
test('seconds, multiple intervals and between/after rests use exact arithmetic',()=>{
  const a={...repeat(3),segmentSeconds:[30,30],restSeconds:60,restPlacement:'between'}
  assert.equal(repeatedSeconds(a),300)
  assert.equal(repeatedSeconds({...a,restPlacement:'after_each'}),360)
  assert.equal(repeatedSeconds({...a,rounds:1}),60)
  assert.equal(validTimedRepeats([{...a,rounds:0}],3),false)
  assert.equal(validTimedRepeats([{...a,segmentSeconds:[NaN]}],3),false)
  assert.equal(validTimedRepeats([a,a],3),false)
  assert.equal(validTimedRepeats([{...a,restPlacement:'none'}],3),false)
})
test('small structured numbers cannot hide a larger interval or repetition in prose',()=>{
  for(const alter of [a=>{a.timedRepeats[0].rounds=1},a=>{a.timedRepeats[0].segmentSeconds=[1,1]},a=>{a.timedRepeats[0].segmentSeconds=[60]}]){
    const card=withRepeat();alter(card.execution.actions[1]);assert.match(coachingTimingIssue(card),/repeat_text_conflict/)
  }
  const card=withRepeat();card.execution.actions[1].steps[1]='Run 1 minute and walk 1 minute; repeat 12 times.'
  assert.match(coachingTimingIssue(card),/repeat_text_conflict/)
})
test('untimed exercise reps are not multiplied as durations; formula is visible',()=>{
  assert.equal(coachingTimingIssue(makeCard()),null)
  assert.match(initialGoalMessage(withRepeat()),/\(60 \+ 60\)초 × 10 = 20분/)
  assert.match(renderCoachingStep('Run then walk',20,s=>s,repeat()),/반복 시간 계산/)
})
test('rest between timed sets is counted n-1, not n, in validation as well as arithmetic',()=>{
  const card=makeCard(),a=card.execution.actions[1]
  a.steps[1]='60초 움직임을 총 11회 반복하고 세트 사이 60초 쉰다.'
  a.timedRepeats=[{stepIndex:1,rounds:11,segmentSeconds:[60],restSeconds:60,restPlacement:'between'}]
  assert.match(coachingTimingIssue(card),/repeats_exceed_step/)
  a.timedRepeats[0].rounds=10;a.steps[1]=a.steps[1].replace('11회','10회')
  assert.equal(coachingTimingIssue(card),null)
  a.timedRepeats[0].restPlacement='after_each'
  assert.match(coachingTimingIssue(card),/repeat_text_conflict/)
})
test('timed sets before a duration are calculated without treating ordinary reps as timed work',()=>{
  const card=makeCard(),a=card.execution.actions[0]
  a.steps[1]='플랭크 2세트를 30~40초씩 하고 세트 사이 20초 쉰다.'
  assert.match(coachingTimingIssue(card),/repeats_required/)
  a.timedRepeats=[{stepIndex:1,rounds:2,segmentSeconds:[40],restSeconds:20,restPlacement:'between'}]
  assert.equal(coachingTimingIssue(card),null)
  assert.equal(repeatedSeconds(a.timedRepeats[0]),100)
})
test('method-only revision preserves goal, cadence, time and all other actions',()=>{
  const card=makeCard(),before=structuredClone(card)
  const result=reviseGoal(card,[edit],request,[changed(card)])
  assert.deepEqual(card,before)
  assert.deepEqual(result.card.weeklyActions,card.weeklyActions)
  for(const key of ['durationWeeks','targetMetric','outcome','baselineMetric'])assert.equal(result.card[key],card[key])
  assert.deepEqual(result.card.execution.actions[1],card.execution.actions[1])
  assert.match(result.card.execution.actions[0].steps[1],/3회씩/)
  assert.equal(result.related,undefined)
  assert.match(draftMessage({...result,id:'fixture',presentedMessageId:'fixture'}),/5회씩.*→.*3회씩/)
})
test('method edits reject fabricated evidence, ambiguity, unrelated changes and no-ops',()=>{
  const card=makeCard()
  assert.throws(()=>reviseGoal(card,[{...edit,evidence:'없는 사용자 요청'}],request,[changed(card)]),/exact_user_evidence/)
  assert.throws(()=>reviseGoal(card,[{...edit,actionIndex:1}],request,[changed(card)]),/method_target_ambiguous/)
  assert.throws(()=>reviseGoal(card,[edit],request,[refresh(card)]),/no_changes/)
  const wrong=changed(card);wrong.steps[1][1]='경사 걷기로 모두 바꾼다.'
  assert.throws(()=>reviseGoal(card,[edit],request,[wrong]),/unrequested_execution_method/)
  const sameAction=changed(card);sameAction.steps[0][0]='준비 없이 바로 시작한다.'
  assert.throws(()=>reviseGoal(card,[edit],request,[sameAction]),/unrequested_execution_step/)
  const ambiguous=makeCard();ambiguous.execution.actions[1].steps[0]='턱걸이 자세를 점검한다.'
  assert.throws(()=>reviseGoal(ambiguous,[edit],request,[changed(ambiguous)]),/method_target_ambiguous/)
  const named='근력 A의 턱걸이 반복만 줄여줘'
  assert.doesNotThrow(()=>reviseGoal(ambiguous,[{...edit,evidence:named}],named,[changed(ambiguous)]))
})
test('an exercise mentioned in a composite title does not authorize changing the whole session',()=>{
  const card=makeCard();card.weeklyActions[0].title='턱걸이·팔굽혀펴기 A'
  card.execution.actions[0].steps=['관절을 가볍게 움직여 준비한다.','턱걸이 5회씩 3세트, 세트 사이 60초 쉰다.','팔굽혀펴기 15회씩 3세트 진행한다.','실제 반복 수와 힘든 정도를 기록한다.']
  card.execution.actions[0].stepMinutes=[5,10,10,5]
  const proposed=changed(card)
  assert.doesNotThrow(()=>reviseGoal(card,[edit],request,[proposed]))
  proposed.steps[0][2]='팔굽혀펴기 대신 스쿼트를 진행한다.'
  assert.throws(()=>reviseGoal(card,[edit],request,[proposed]),/unrequested_execution_step/)
  const whole='턱걸이·팔굽혀펴기 A 실행 방법을 바꿔줘'
  assert.doesNotThrow(()=>reviseGoal(card,[{...edit,text:card.weeklyActions[0].title,evidence:whole}],whole,[proposed]))
})
test('method refresh can retain unchanged instructions without copying their prose',()=>{
  const card=withRepeat(),original=structuredClone(card)
  card.execution.contextNotes=['근력 회차 사이에는 가능하면 하루 이상 쉬세요.']
  const proposed=changed(card)
  proposed.guide=null;proposed.contextNotes=null
  proposed.steps[1]=null
  proposed.stepMinutes=[null,null]
  proposed.timedRepeats=[null,null]
  proposed.conditionalRules=[null,null]
  const result=reviseGoal(card,[edit],request,[proposed])
  assert.deepEqual(result.card.execution.coachingGuide,card.execution.coachingGuide)
  assert.deepEqual(result.card.execution.contextNotes,card.execution.contextNotes)
  assert.deepEqual(result.card.execution.actions[1],card.execution.actions[1])
  assert.deepEqual(result.card.weeklyActions,original.weeklyActions)
  assert.match(result.card.execution.actions[0].steps[1],/3회씩/)
  assert.equal(result.changes.length,1)
  assert.equal(card.execution.actions[0].steps[1],original.execution.actions[0].steps[1])
})
test('changed rules and management notes are disclosed even when steps also change',()=>{
  const card=makeCard()
  card.execution.actions[0].conditionalRules=['통증이 있으면 중단하고 상태를 확인한다.']
  card.execution.contextNotes=['근력 회차 사이에는 가능하면 하루 이상 쉬세요.']
  const proposed=changed(card)
  proposed.conditionalRules[0]=['통증이 있으면 중단하고 전문가와 상담한다.']
  proposed.contextNotes=[]
  proposed.guide.progression='반복 수를 줄인 첫 회차의 기록을 확인하고 같은 범위를 안정적으로 마칠 때 다음 구간을 진행합니다.'
  const result=reviseGoal(card,[edit],request,[proposed])
  assert.ok(result.changes.some(c=>c.before===card.execution.actions[0].conditionalRules[0]&&c.after===proposed.conditionalRules[0][0]))
  assert.ok(result.changes.some(c=>c.before===card.execution.contextNotes[0]&&c.after==='(없음)'))
  assert.ok(result.changes.some(c=>c.before===card.execution.coachingGuide.progression&&c.after===proposed.guide.progression))
  assert.ok(draftMessage({...result,id:'fixture',presentedMessageId:'fixture'}).includes(card.execution.contextNotes[0]))
})
test('a nullable refresh cannot bypass changed scalar conditions, invalid lengths or no-op checks',()=>{
  const card=makeCard(),partial={scope:'requested',guide:null,contextNotes:null,steps:[null,null],stepMinutes:[null,null],timedRepeats:[null,null],conditionalRules:[null,null]}
  assert.throws(()=>reviseGoal(card,[edit],request,[partial]),/no_changes/)
  assert.throws(()=>reviseGoal(card,[edit],request,[{...partial,steps:[null]}]),/coaching_guide_required/)
  const duration='근력 A 시간만 15분으로 바꿔줘'
  assert.throws(()=>reviseGoal(card,[{field:'durationMinutes',actionIndex:0,number:15,text:null,days:null,evidence:duration}],duration,[partial]),/coaching_guide_required/)
})
for(const partial of [false,true])test(`method changes remain pending until explicit approval; reload preserves them (partial=${partial})`,async()=>{
  const card=withRepeat()
  card.execution.contextNotes=['다음 회차에는 실제 기록을 기준으로 조정한다.']
  const base=loadState({stage:5,goal_card:card})
  const proposed=changed(card)
  if(partial){proposed.guide=null;proposed.contextNotes=null;proposed.steps[1]=null;proposed.stepMinutes=[null,null];proposed.timedRepeats=[null,null];proposed.conditionalRules=[null,null]}
  let calls=0
  const result=await runAgentTurn(base,request,{now:'2026-09-17T09:00:00Z',request:async body=>{
    assert.equal(++calls,1,JSON.stringify(body.input.filter(x=>x.type==='function_call_output')))
    assert.ok(body.tools.some(t=>t.name==='revise_goal'))
    return {id:'fixture',model:'fixture',output:[{type:'function_call',call_id:'r1',name:'revise_goal',arguments:JSON.stringify({edits:[edit],capacity_update:null,coaching_refresh:[proposed]})}]}
  }})
  assert.deepEqual(result.state.goal_card,card)
  const pending=result.state.agent_v2_context.draft
  assert.ok(pending)
  const accepted=await runAgentTurn(loadState(JSON.parse(JSON.stringify(result.state))),'이 초안으로 시작할게요',{now:'2026-09-17T09:01:00Z',request:async()=>{throw Error('provider forbidden')}},{draftId:pending.id})
  const reloaded=loadState(JSON.parse(JSON.stringify(accepted.state)))
  assert.deepEqual(reloaded.goal_card.execution,pending.card.execution)
  assert.deepEqual(reloaded.goal_card.execution.contextNotes,card.execution.contextNotes)
  assert.deepEqual(reloaded.goal_card.execution.actions[1],card.execution.actions[1])
})
for(const message of ['턱걸이 반복만 줄여줘','근력 A의 턱걸이 세트만 줄여줘'])test(`short method request reaches the revision tool: ${message}`,async()=>{
  const card=makeCard(),base=loadState({stage:5,goal_card:card})
  let calls=0
  const result=await runAgentTurn(base,message,{now:'2026-09-17T09:00:00Z',request:async body=>{
    assert.equal(++calls,1,JSON.stringify(body.input.filter(x=>x.type==='function_call_output')))
    assert.ok(body.tools.some(t=>t.name==='revise_goal'))
    return {id:'fixture',model:'fixture',output:[{type:'function_call',call_id:'r1',name:'revise_goal',arguments:JSON.stringify({edits:[{...edit,evidence:message}],capacity_update:null,coaching_refresh:[changed(card)]})}]}
  }})
  assert.ok(result.state.agent_v2_context.draft)
  assert.deepEqual(result.state.goal_card,card)
})
test('method-only contract cannot smuggle a duration change or an unapproved related plan',()=>{
  const card=makeCard()
  assert.throws(()=>reviseGoal(card,[edit,{field:'durationMinutes',actionIndex:0,text:null,number:15,days:null,evidence:request}],request,[changed(card)]),/must_be_separate/)
  assert.throws(()=>reviseGoal(card,[edit],request,[changed(card),{...changed(card),scope:'related'}]),/requested_refresh_only/)
  const bad=changed(card);bad.stepMinutes[0][1]=30
  assert.throws(()=>reviseGoal(card,[edit],request,[bad]),/time_exceeds_session/)
})
test('personal interpretation leads both detailed and compact drafts without losing notes',()=>{
  const card=makeCard();card.execution.coachingGuide.rationale='턱걸이 10회라는 현재 기록은 유지하면서, 부족하다고 말씀한 지구력을 별도 회차에 연습하도록 나눴어요.'
  card.execution.contextNotes=['운동한 날의 실제 기록을 보내주시면 다음 회차를 조정할 수 있어요.']
  for(const compact of [true,false]) {
    const text=initialGoalMessage(card,[],compact,'고정 요약')
    assert.ok(text.startsWith(card.execution.coachingGuide.rationale))
    assert.equal(text.split(card.execution.coachingGuide.rationale).length-1,1)
    assert.ok(text.includes(card.execution.contextNotes[0]))
    assert.ok(text.includes(card.targetMetric))
    assert.doesNotMatch(text,/고정 요약|말씀하신 현재 상황에 맞춘/)
  }
})
