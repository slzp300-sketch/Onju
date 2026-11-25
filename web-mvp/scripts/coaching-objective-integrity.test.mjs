import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyBrief,loadGoalBrief,updateGoalBrief,goalBriefIssue,goalResultKey} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import {AGENT_TOOL_DEFINITIONS,loadState,runAgentTurn} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import {assessGoalFeasibility} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import {assertModelTimeBudget} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/modelTimeBudget.ts'
import {coachingTimingIssue} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingTiming.ts'
import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'

const results=['책 3권 완독','서평 5편 작성','발표 2회 진행']
const objectives=results.map(result=>({area:'독서',result,evidence:result,result_kind:'metric'}))
const input={areas:['독서'],objectives}
const utterance='독서 목표는 책 3권 완독, 서평 5편 작성, 발표 2회 진행이야.'
const captured=()=>updateGoalBrief(emptyBrief(),input,utterance)
const change=(previous_result,replacement_result,evidence,target_evidence)=>({area:'독서',previous_result,replacement_result,evidence,target_evidence})

test('one category retains three independent results across capture and storage',()=>{
  const brief=captured()
  assert.deepEqual(brief.objectives.map(o=>o.result),results)
  assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(brief))),brief)
  assert.deepEqual(updateGoalBrief(brief,input,utterance),brief,'replay is idempotent')
  assert.equal(emptyBrief().objectives.length,0)
})

test('later grounded additions do not replace earlier results in the same area',()=>{
  const first=updateGoalBrief(emptyBrief(),{areas:['독서'],objectives:[objectives[0]]},utterance)
  const later=updateGoalBrief(first,{objectives:objectives.slice(1)},'추가 목표를 정리해줘',[utterance])
  assert.deepEqual(later.objectives.map(o=>o.result),results)
  assert.equal(first.objectives.length,1,'input is not mutated')
})

test('explicit replacement changes only its named result, stale history cannot resurrect it',()=>{
  const original=captured(),evidence='책 목표를 4권 완독으로 바꿔줘'
  const revised=updateGoalBrief(original,{objectives:[{area:'독서',result:'책 4권 완독',evidence,result_kind:'metric'}],objective_changes:[change(results[0],'책 4권 완독',evidence,'책')]},evidence)
  assert.deepEqual(revised.objectives.map(o=>o.result),[results[1],results[2],'책 4권 완독'])
  assert.equal(original.objectives.length,3)
  const reloaded=loadGoalBrief(JSON.parse(JSON.stringify(revised)))
  assert.deepEqual(updateGoalBrief(reloaded,input,'계속해줘',[utterance]).objectives,revised.objectives)
})

test('explicit deletion preserves peer results and rejects missing or ambiguous target evidence',()=>{
  const original=captured(),evidence='서평 목표는 빼줘'
  const deleted=updateGoalBrief(original,{objective_changes:[change(results[1],null,evidence,'서평')]},evidence)
  assert.deepEqual(deleted.objectives.map(o=>o.result),[results[0],results[2]])
  assert.throws(()=>updateGoalBrief(original,{objective_changes:[change(results[0],null,evidence,'서평')]},evidence),/targeted_evidence/)
  assert.throws(()=>updateGoalBrief(original,{objective_changes:[change(results[1],null,evidence,'서평')]},'좋아',[evidence]),/targeted_evidence/)
  assert.throws(()=>updateGoalBrief(original,{objective_changes:[change(results[1],null,'서평 목표를 빼면 어떨까?','서평')]},'서평 목표를 빼면 어떨까?'),/targeted_evidence/)
  const ambiguous=updateGoalBrief(original,{objectives:[{area:'독서',result:'책 2권 요약',evidence:'책 2권 요약',result_kind:'metric'}]},'책 2권 요약')
  assert.throws(()=>updateGoalBrief(ambiguous,{objective_changes:[change(results[0],null,'책 목표는 빼줘','책')]},'책 목표는 빼줘'),/targeted_evidence/)
})

test('replacement cannot delete a goal without a grounded replacement; conflicting changes fail atomically',()=>{
  const original=captured(),evidence='책 목표를 4권 완독으로 바꿔줘'
  assert.throws(()=>updateGoalBrief(original,{objective_changes:[change(results[0],'책 4권 완독',evidence,'책')]},evidence),/grounded_new_result/)
  const c=change(results[1],null,'서평 목표는 빼줘','서평')
  assert.throws(()=>updateGoalBrief(original,{objective_changes:[c,c]},c.evidence),/conflicting/)
  assert.deepEqual(original.objectives.map(o=>o.result),results)
})

test('multiple targets never reuse the first target rate as the category feasibility',()=>{
  const brief={...captured(),period:{label:'4주',weeks:4},baselines:[{area:'독서',current:'주 1권 완독',status:'known'}],capacity:{summary:'주 3회 30분 가능',status:'known'}}
  const assessment=assessGoalFeasibility(brief)
  assert.equal(assessment.status,'needs_rate')
  assert.equal(assessment.requiresFirstWeekCalibration,true)
  assert.equal(assessment.gaps.length,0,'no cross-metric arithmetic')
})

test('equivalent time units deduplicate only when the goal subject and cadence are unchanged',()=>{
  assert.equal(goalResultKey('study 1 hour per week'),goalResultKey('study 60 minutes per week'))
  assert.notEqual(goalResultKey('study 1 hour per week'),goalResultKey('run 60 minutes per week'))
  assert.notEqual(goalResultKey('study 1 hour per week'),goalResultKey('study 60 minutes per day'))
  assert.notEqual(goalResultKey('write 2 projects'),goalResultKey('write 2 articles'))
  const original={...emptyBrief(),areas:['study'],objectives:[{area:'study',result:'1 hour per week',evidence:'1 hour per week',resultKind:'metric'}]}
  const after=updateGoalBrief(original,{objectives:[{area:'study',result:'60 minutes per week',evidence:'60 minutes per week',result_kind:'metric'}]},'My target is 60 minutes per week.')
  assert.deepEqual(after,original)
})

test('goal/action links preserve all agreed results and reject invented links',()=>{
  const brief={...captured(),period:{label:'4주',weeks:4},baselines:[{area:'독서',current:'첫 주 측정 필요',status:'unmeasured'}],capacity:{summary:'주 3회 30분 가능',status:'known'}}
  const card={durationWeeks:4,targetMetric:results.join(' · '),baselineMetric:'첫 주 측정 필요',execution:{actions:[{steps:['a','b'],goalResult:results[2]},{steps:['a','b'],goalResult:results[0]}]}}
  assert.equal(goalBriefIssue(card,brief),null)
  card.execution.actions[0].goalResult='임의의 새 목표'
  assert.match(goalBriefIssue(card,brief),/daily_guide_must_link_agreed_result/)
})

test('capture can hand off without generating discarded prose; final response retains full depth budget',()=>{
  const capture=AGENT_TOOL_DEFINITIONS.find(t=>t.name==='record_goal_brief').parameters.properties
  assert.ok(capture.reply.anyOf.some(s=>s.type==='null'))
  assert.equal(capture.reply.anyOf.find(s=>s.type==='object').properties.paragraphs.maxItems,2)
  assert.ok(capture.objective_changes)
  assert.equal(AGENT_TOOL_DEFINITIONS.find(t=>t.name==='respond').parameters.properties.paragraphs.maxItems,8)
})

test('nullable capture reply saves all goals and continues with a fresh response',async()=>{
  let calls=0
  const state=loadState({stage:5})
  const response=await runAgentTurn(state,utterance,{now:'2026-09-17T09:00:00Z',request:async body=>{
    calls++
    const name=calls===1?'record_goal_brief':'respond'
    const args=calls===1?{...input,reply:null}:{focus:'goals',intent:'share_context',move:'ask',confidence:'high',expects_reply:true,open_threads:[],remember:[],forget:[],paragraphs:['읽기, 쓰기, 발표를 각각 달성하고 싶으시군요. 기간과 현재 수준에 따라 실행량을 조정할 수 있어요.'],bullets:[],question:'언제까지 이루고 싶고, 지금은 얼마나 하고 있나요?',choices:[],goal_outcome:'',goal_draft:null}
    assert.ok(calls<=2)
    if(calls===2)assert.match(JSON.stringify(body.input),/발표 2회 진행/)
    return {id:`fixture-${calls}`,output:[{type:'function_call',name,call_id:`c${calls}`,arguments:JSON.stringify(args)}]}
  }})
  assert.equal(calls,2)
  assert.deepEqual(response.state.agent_v2_context.brief.objectives.map(o=>o.result),results)
  assert.match(response.assistant_message,/언제까지/)
})

test('do not reserve an expensive model call with only the observed 24-second remainder',()=>{
  assert.throws(()=>assertModelTimeBudget(24002,6500),/no_valid_agent_reply/)
  assert.throws(()=>assertModelTimeBudget(59999,4200),/no_valid_agent_reply/)
  assert.doesNotThrow(()=>assertModelTimeBudget(60000,6500))
  assert.doesNotThrow(()=>assertModelTimeBudget(15000,1800))
  assert.throws(()=>assertModelTimeBudget(14999,1800),/no_valid_agent_reply/)
})

test('conditional safety advice is not allocated as a scheduled activity',()=>{
  const card={weeklyActions:[{durationMinutes:30}],execution:{actions:[{steps:['준비한다.','실행한다.','통증이 있으면 중단한다.','기록한다.'],stepMinutes:[5,18,2,5]}]}}
  assert.match(coachingTimingIssue(card),/conditional_rule_is_not_timed_step/)
  card.execution.actions[0]={steps:['준비한다.','실행한다. 통증이 있으면 중단한다.','기록한다.'],stepMinutes:[5,20,5]}
  assert.equal(coachingTimingIssue(card),null)
})

test('full handler preserves reordered action links and rejects an invented link instead of overwriting it',async()=>{
  const brief={...captured(),period:{label:'4주',weeks:4},baselines:[{area:'독서',current:'주 1권 완독',status:'known'}],capacity:{summary:'주 3회 회당 20분 가능',status:'known'}}
  const order=[results[2],results[0],results[1]]
  const draft=withCoachingDetails({category:'자기계발',outcome:'읽고 쓰고 발표하기',identity:'',cue:'',environment:'',deadline:'',baselineMetric:'주 1권 완독',targetMetric:results.join(' · '),durationWeeks:4,measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,progressStrategy:'첫 주 기록을 확인하고 같은 시간 안에서 마칠 범위를 조정한다.',planningEvidence:[],
    actions:order.map(result=>({title:result,frequencyPerWeek:1,durationMinutes:20,preferredDays:[],planningStyle:'repeat',completionCriterion:'완료한 범위와 다음 시작점 기록',minimumAction:'자료를 열고 첫 문장 표시',minimumMinutes:1,goalResult:result}))})
  for(const invalidFirst of [false,true]) {
    let calls=0
    const result=await runAgentTurn(loadState({stage:5,agent_v2_context:{brief}}),'이 조건으로 계획을 만들어줘',{now:'2026-09-17T09:00:00Z',request:async body=>{
      calls++;assert.ok(calls<3)
      const candidate=structuredClone(draft)
      if(invalidFirst&&calls===1)candidate.actions[0].goalResult='사용자가 말하지 않은 결과'
      if(calls===2)assert.match(JSON.stringify(body.input),/daily_guide_must_link_agreed_result/)
      return {id:`fixture-${calls}`,output:[{type:'function_call',name:'respond',call_id:`c${calls}`,arguments:JSON.stringify({focus:'goals',intent:'seek_advice',move:'suggest',confidence:'high',expects_reply:true,open_threads:[],remember:[],forget:[],question_updates:[],paragraphs:['알려주신 조건에 맞춘 계획이에요.'],bullets:[],question:'',choices:[],goal_outcome:'',goal_draft:candidate})}]}
    }})
    assert.equal(calls,invalidFirst?2:1)
    assert.deepEqual(result.state.agent_v2_context.draft.card.execution.actions.map(a=>a.goalResult),order)
    assert.equal(result.state.goal_card.weeklyActions.length,0)
  }
})
