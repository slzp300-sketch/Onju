import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'
import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyBrief, updateGoalBrief, loadGoalBrief } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { goalFactIsAsserted, goalResultIsDecided } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalEvidenceScope.ts'
import { periodUpdateIsExplicit, explicitAreaChange } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalIntakeEvidence.ts'
import { parseGoalQuantity, assessGoalFeasibility, nextGoalIntakeStep, goalFeasibilityIssue } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import { parseGoalCapacity } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import { loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'

const seed = (summary = '1 hour per week') => ({ ...emptyBrief(), period: { label:'4 weeks', weeks:4 }, areas:['reading'],
  baselines:[{ area:'reading', current:'1 book per week', evidence:'1 book per week', status:'known' }],
  objectives:[{ area:'reading', result:'4 books', evidence:'4 books', resultKind:'metric' }],
  capacity:{ summary, evidence:summary, status:'known' } })
const strategy = '첫 주 실제 시간을 기록하고 다음 주 실행량을 다시 제안합니다.'
const card = (minutes, frequency=1) => ({weeklyActions:[{durationMinutes:minutes,frequencyPerWeek:frequency}],execution:{progressStrategy:strategy}})

// Both terse extracts and whole-message quotes must retain the local authority.
for (const [message, value, expected] of [
  ['책 2권은 읽지 않을래. 지금 목표를 유지해줘.','책 2권',false],
  ['책 2권은 읽지는 않을래.','책 2권',false],
  ['책 2권은 안 읽을래.','책 2권',false],
  ['책 2권을 읽을래.','책 2권',true],
  ['무리하지 않고 4편 완성으로 줄일게.','4편 완성',true],
  ['8주 동안 진행할게.','8주',true],
  ["I do not have 3 hours per week.",'3 hours per week',false],
  ["I can't afford 3 hours per week.",'3 hours per week',false],
  ['I have 3 hours per week.','3 hours per week',true],
  ['팀원은 시안 6개를 끝냈어. 나는 시안 1개야.','시안 6개',false],
  ['팀원은 시안 6개를 끝냈어. 나는 시안 1개야.','시안 1개',true],
  ['My son has read 5 books. I have read 1 book.','5 books',false],
  ['My daughter has read 5 books. I have read 1 book.','1 book',true],
  ['지난달에는 영상 0편이었어. 지금은 영상 2편이야.','영상 0편',false],
  ['지난달에는 영상 0편이었어. 지금은 영상 2편이야.','영상 2편',true],
  ['지난주에는 책 1권을 읽었어.','책 1권',true],
  ['Last week I read 1 book.','1 book',true],
  ['Last month I had 0 projects. Now I have 1 project.','0 projects',false],
  ['Last month I had 0 projects. Now I have 1 project.','1 project',true],
]) for (const evidence of [...new Set([value,message])]) {
  test('authority variant: '+message+' / '+evidence,()=>assert.equal(goalFactIsAsserted(message,evidence,value),expected))
}

for (const message of [
  'When my shifts settle down, change the period to 12 weeks.',
  'Once my shifts settle down change the period to 12 weeks.',
  'After the exam finishes, please change the period to 12 weeks.',
]) test('future condition is not a period decision: '+message,()=> {
  assert.equal(periodUpdateIsExplicit(message,'12 weeks'),false)
  const brief=seed(), before=structuredClone(brief)
  assert.throws(()=>updateGoalBrief(brief,{period:'12 weeks'},message),/period_not_decided|period_change/)
  assert.deepEqual(brief,before)
})
test('conditional area removal is deferred but an immediate change is allowed',()=> {
  assert.equal(explicitAreaChange('reading','Once work is quieter, remove reading.',['reading']),null)
  assert.equal(periodUpdateIsExplicit('Change the period to 12 weeks now.','12 weeks'),true)
})
for (const [message,expected] of [
  ["I would like to finish 5 books, but I haven't decided yet.",false],
  ["I would like to finish 5 books. I have not decided yet.",false],
  ['I would like to finish 5 books.',true],
  ["I decided on 5 books, but I haven't decided the schedule yet.",true],
  ['책 5권으로 하고 싶어. 하지만 아직 결정하지 않았어.',false],
  ['책 5권으로 할게. 하지만 시간은 아직 결정하지 않았어.',true],
]) for(const evidence of [message.includes('책')?'책 5권':'5 books',message]) {
  test('decision-linked qualification: '+message+' / '+evidence,()=>assert.equal(goalResultIsDecided(message,evidence,message.includes('책')?'책 5권':'5 books'),expected))
}
test('a deferred objective does not mutate or survive reload as an approved value',()=> {
  const brief=seed(), before=structuredClone(brief), message="I would like to finish 5 books, but I haven't decided yet."
  assert.throws(()=>updateGoalBrief(brief,{objectives:[{area:'reading',result:'5 books',evidence:'5 books',result_kind:'metric'}]},message),/result_not_decided/)
  assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(brief))),before)
})

for (const [text,rate] of [
  ['평일 매일 1편',5],['하루 1편',7],['주말 매일 1편',2],['평일에만 주당 5편',5],
  ['1 article each weekday',5],['1 article every weekday',5],['1 article per day on weekdays',5],
  ['1 article each weekend day',2],['5 articles per week on weekdays',5],['1 article per day',7],
]) test('calendar scope without double multiplication: '+text,()=>assert.equal(parseGoalQuantity(text)?.perWeek,rate))
for(const text of ['1 article each weekday and weekend day','평일 매일 또는 주당 1편','1 article per sprint']) {
  test('conflicting/unknown rate stays unmeasured: '+text,()=>assert.equal(parseGoalQuantity(text),null))
}
for(const [current,target,expected] of [
  ['30 minutes per week','1 hour per week','ready'],['0.5 hours per week','60 minutes per week','ready'],
  ['1 book per week','1 hour per week','needs_rate'],
]) test('convert only compatible units: '+current+' -> '+target,()=> {
  const brief=seed('2 hours per week')
  brief.baselines[0].current=current;brief.objectives[0].result=target
  const assessment=assessGoalFeasibility(brief)
  assert.equal(assessment.status,expected)
  if(expected==='ready')assert.equal(assessment.gaps[0].requiredPerWeek,60)
  else assert.equal(assessment.gaps.length,0)
})
test('raw hour units remain available for display',()=>assert.deepEqual(parseGoalQuantity('1 hour per week'),{value:1,unit:'시간',perWeek:1}))

for (const [text,min,max,sessions] of [
  ['주 2회 각 0.5시간 가능해.',60,60,2],['주 두 회 각 반 시간',60,60,2],['주 2회 각 30분',60,60,2],
  ['주당 30~60분 가능해.',30,60,null],['주당 30 - 60분',30,60,null],['30 to 60 minutes per week',30,60,null],
  ['주 2~3회 각 20분',40,60,3],['주당 0.5~1시간',30,60,null],
  ['two sessions of 20 minutes per week',40,40,2],['two sessions per week, 20 minutes each',40,40,2],
  ['20 minutes each, two sessions per week',40,40,2],['two sessions per week, 40 minutes total',40,40,2],
  ['주 2회 총 40분',40,40,2],['20 minutes per day on weekdays',100,100,null],
  ['주당 최대 60분',60,60,null],['0 hours per week',0,0,null],['주 0회 각 30분',0,0,0],
  ['thirty minutes per week',30,30,null],
]) test('structured weekly budget: '+text,()=> {
  const limits=parseGoalCapacity(text)
  assert.equal(limits.status,'bounded')
  assert.deepEqual(limits.weeklyMinutes,{min,max})
  assert.equal(limits.weeklySessions?.max??null,sessions)
  const brief=seed(text)
  if(max>0) {
    // Spend the weekly total over its stated sessions, not in one long block.
    const daily = text === '20 minutes per day on weekdays'
    const duration=daily ? 20 : limits.perSessionMinutes?.max??max
    assert.equal(goalFeasibilityIssue(card(duration,daily ? 5 : limits.perSessionMinutes?sessions:1),brief),null)
    if(duration<max) assert.match(goalFeasibilityIssue(card(max),brief),/goal_capacity_conflict/)
    assert.match(goalFeasibilityIssue(card(max+1),brief),/goal_capacity_conflict/)
  } else {
    assert.equal(nextGoalIntakeStep(brief,null),'feasibility')
    assert.match(goalFeasibilityIssue(card(10),brief),/goal_feasibility_choice_required/)
  }
})
for(const text of ['주당 60~30분','30 or 60 minutes per week','주당 최소 30분','at least 30 minutes per week',
  'two sessions of 20 minutes per week, 30 minutes total','-30 minutes per week','- 30 minutes per week','30 minutes per sprint']) {
  test('explicit ambiguous budget is not unlimited: '+text,()=> {
    assert.equal(parseGoalCapacity(text).status,'unresolved')
    const brief=seed(text)
    assert.equal(assessGoalFeasibility(brief).status,'needs_measurement')
    assert.equal(nextGoalIntakeStep(brief,null),'capacity')
    assert.match(goalFeasibilityIssue(card(90),brief),/goal_capacity_unresolved/)
  })
}
test('narrative/unmeasured availability is not forced into a guessed numeric budget',()=> {
  assert.equal(parseGoalCapacity('주간 실행 시간 확인됨').status,'unspecified')
  const brief=seed('일정이 유동적이야');brief.capacity.status='unmeasured'
  assert.equal(assessGoalFeasibility(brief).status,'needs_measurement')
  assert.equal(goalFeasibilityIssue(card(10),brief),null)
})

test('real agent rejects over-budget mock draft and accepts only the repaired draft, without confirming it',async()=> {
  const brief=seed('two sessions of 20 minutes per week')
  const proposal=minutes=>({category:'reading',outcome:'4 books',identity:'',cue:'',environment:'',deadline:'',
    baselineMetric:'1 book per week',targetMetric:'4 books',durationWeeks:4,measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,progressStrategy:strategy,
    actions:[{title:'Read and note one useful idea',frequencyPerWeek:2,durationMinutes:minutes,preferredDays:[],planningStyle:'repeat',
      completionCriterion:'Record the pages read and one useful idea',minimumAction:'Open the book',minimumMinutes:1,goalResult:'4 books',steps:['Open the book','Read and note one useful idea']}]})
  const state=loadState({stage:5,agent_v2_context:{brief},messages:[{role:'user',text:'My goal is 4 books in 4 weeks. I read 1 book per week. I can spend two sessions of 20 minutes per week.'}]})
  let attempts=0
  const result=await runAgentTurn(state,'Create a starting draft using the time I gave you.',{today:'2026-09-16',now:'September 16, 2026',request:async body=> {
    assert.ok(++attempts<=4,'unexpected extra mock request')
    const route=!body.tools.some(tool=>tool.name==='respond')
    const previous=body.input.filter(item=>item.type==='function_call_output').map(item=>JSON.parse(item.output))
    const rejected=previous.some(item=>/goal_capacity_conflict/.test(item.error??''))
    const name=route?'route_request':'respond'
    const args=route?{module:'goal',evidence:'Create a starting draft using the time I gave you.',reason:'Use the recorded goal brief.'}
      :{focus:'goals',goal_outcome:'4 books',goal_draft:withCoachingDetails(proposal(rejected?15:45)),summary:'A starting draft.',details:[],question:'Would you like to start?',choices:[]}
    return {id:'mock-'+attempts,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:'call-'+attempts,arguments:JSON.stringify(args)}]}
  }})
  assert.ok(result.events.some(event=>/goal_capacity_conflict/.test(event.result?.error??'')))
  assert.equal(result.state.agent_v2_context.draft.card.weeklyActions[0].durationMinutes,15)
  assert.deepEqual(result.state.goal_card,state.goal_card)
  assert.deepEqual(result.state.agent_v2_context.brief,brief)
})
