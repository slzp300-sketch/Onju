import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'
import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyBrief,updateGoalBrief,loadGoalBrief} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import {goalCapacityAppliesNow,goalBaselineIsCurrent} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalEvidenceScope.ts'
import {parseGoalCapacity,analyzeGoalCapacity} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import {goalFeasibilityIssue,nextGoalIntakeStep} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import {loadState,runAgentTurn} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'

const strategy='첫 주 실제 시간을 기록하고 다음 주 실행량을 다시 제안합니다.'
const seed=(summary='1 hour per week')=>({...emptyBrief(),period:{label:'8 weeks',weeks:8},areas:['writing'],
  baselines:[{area:'writing',current:'1 project',evidence:'1 project',status:'known'}],
  objectives:[{area:'writing',result:'4 projects',evidence:'4 projects',resultKind:'metric'}],capacity:{summary,evidence:summary,status:'known'}})
const card=(minutes,frequency=1,days=[])=>({weeklyActions:[{durationMinutes:minutes,frequencyPerWeek:frequency,preferredDays:days}],execution:{progressStrategy:strategy}})

// Pair broad model quotations with narrow extracts: a correct number alone is
// not evidence that it describes the user's present, decided availability.
for(const [source,value,expected] of [
  ['다음 달부터 주당 2시간 가능해. 지금은 야간 근무 중이야.','주당 2시간',false],
  ['주당 2시간은 다음 주부터 가능해.','주당 2시간',false],
  ['현재 주당 2시간 가능하고 다음 달에는 목표를 끝낼 거야.','주당 2시간',true],
  ['다음 달까지 주당 2시간 가능해.','주당 2시간',true],
  ['Starting next month, I can spend 2 hours per week.','2 hours per week',false],
  ['I can spend 2 hours per week starting tomorrow.','2 hours per week',false],
  ['I can spend 2 hours per week until next month.','2 hours per week',true],
  ['I can spend 2 hours per week now. My target is 4 projects next month.','2 hours per week',true],
  ['배우자는 주당 3시간 가능해. 나는 주당 30분 가능해.','주당 3시간',false],
  ['배우자는 주당 3시간 가능해. 나는 주당 30분 가능해.','주당 30분',true],
  ['My employer has 5 hours per week for training. I can spend 30 minutes per week on my goal.','5 hours per week',false],
  ['My employer has 5 hours per week for training. I can spend 30 minutes per week on my goal.','30 minutes per week',true],
  ['I can spend 30 minutes per week and my company has 5 hours per week for training.','30 minutes per week',true],
  ['I can spend 30 minutes per week and my company has 5 hours per week for training.','5 hours per week',false],
]) for(const evidence of [value,source]) test('present personal capacity: '+evidence+' => '+value,()=> {
  const before=seed(),original=structuredClone(before)
  assert.equal(goalCapacityAppliesNow(source,evidence,value),expected)
  const change={capacity:{summary:value,evidence,status:'known'}}
  if(expected) {
    const after=updateGoalBrief(before,change,source)
    assert.equal(after.capacity.summary,value)
    assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(after))),after)
  } else assert.throws(()=>updateGoalBrief(before,change,source),/capacity_/)
  assert.deepEqual(before,original)
})

for(const [source,value,expected] of [
  ['올해 목표는 프로젝트 4개야. 현재 끝낸 건 프로젝트 1개야.','프로젝트 4개',false],
  ['올해 목표는 프로젝트 4개야. 현재 끝낸 건 프로젝트 1개야.','프로젝트 1개',true],
  ['My target is 4 projects. Currently I have completed 1 project.','4 projects',false],
  ['My target is 4 projects. Currently I have completed 1 project.','1 project',true],
  ['I completed 1 project and my target is 4 projects.','1 project',true],
  ['I completed 1 project and my target is 4 projects.','4 projects',false],
  ['현재 프로젝트 1개이고 목표는 프로젝트 4개야.','프로젝트 1개',true],
  ['현재 프로젝트 1개이고 목표는 프로젝트 4개야.','프로젝트 4개',false],
  ['I completed my goal of 4 projects.','4 projects',true],
  ['목표 프로젝트 4개를 달성했어.','프로젝트 4개',true],
]) for(const evidence of [value,source]) test('baseline is achieved rather than targeted: '+evidence+' => '+value,()=> {
  assert.equal(goalBaselineIsCurrent(source,evidence,value),expected)
  const before=seed(),original=structuredClone(before)
  const payload={baselines:[{area:'writing',current:value,evidence,status:'known'}]}
  if(expected) assert.equal(updateGoalBrief(before,payload,source).baselines[0].current,value)
  else assert.throws(()=>updateGoalBrief(before,payload,source),/baseline_not_decided/)
  assert.deepEqual(before,original)
})

for(const [source,expected] of [
  ['글쓰기를 우선한다고 가정해보자. 아직 결정한 것은 없어.',false],
  ['글쓰기를 우선할게. 아직 결정한 것은 없어.',false],
  ['Hypothetically, prioritize writing. I have not decided yet.',false],
  ['Suppose writing is the priority.',false],
  ['글쓰기를 우선할게.',true],['I choose writing as my priority.',true],
]) test('priority distinguishes discussion from decision: '+source,()=> {
  const before={...seed(),areas:['writing','reading'],priority:{mode:'equal',primaryArea:'',flexibleAreas:[],evidence:'Both equally.'}}
  const original=structuredClone(before),payload={priority:{mode:'ranked',primary_area:'writing',flexible_areas:['reading'],evidence:source}}
  if(expected) assert.equal(updateGoalBrief(before,payload,source).priority.primaryArea,'writing')
  else assert.throws(()=>updateGoalBrief(before,payload,source),/priority_not_decided/)
  assert.deepEqual(before,original)
})

for(const [text,total,session,count] of [
  ['주당 1시간 반 가능해.',90,null,null],['주당 한 시간 반 가능해.',90,null,null],
  ['주당 ２시간 반 가능해.',150,null,null],['회당 1시간 반 가능해.',null,90,null],
  ['I can spend a quarter of an hour per session.',null,15,null],
  ['a quarter-hour per session',null,15,null],
  ['a quarter of an hour per week',15,null,null],['three quarter-hour sessions per week',45,15,3],
  ['90 minutes total per week, no more than 20 minutes per session',90,20,null],
  ['20 minutes per session; 90 minutes total per week',90,20,null],
  ['주당 총 90분, 회당 20분',90,20,null],['회당 20분 그리고 주당 총 90분',90,20,null],
  ['2 sessions per week and 20 minutes per session',40,20,2],
  ['60 to 90 minutes per week; 10 to 20 minutes per session',90,20,null],
]) test('composed bounds retain independent scopes: '+text,()=> {
  const limits=parseGoalCapacity(text)
  assert.equal(limits.status,'bounded')
  assert.equal(limits.weeklyMinutes?.max??null,total)
  assert.equal(limits.perSessionMinutes?.max??null,session)
  assert.equal(limits.weeklySessions?.max??null,count)
  assert.deepEqual(Object.keys(limits).sort(),['perSessionMinutes','status','weeklyMinutes','weeklySessions'])
  assert.equal(nextGoalIntakeStep(seed(text),null),null)
  assert.equal(goalFeasibilityIssue(card(session??total),seed(text)),null)
  assert.match(goalFeasibilityIssue(card((session??total)+1),seed(text)),/goal_capacity_conflict/)
})
for(const text of ['주당 1~2시간 반','주당 -1시간 반','90 minutes per week or 20 minutes per session',
  '90 minutes per week, 120 minutes per week, 20 minutes per session',
  '90 minutes per week; at least 20 minutes per session','90 minutes per week, -20 minutes per session',
  'quarter of an hour','20 minutes per day on weekdays, 30 minutes per day on weekdays']) {
  test('ambiguous compound budgets stay unresolved: '+text,()=> {
    assert.equal(parseGoalCapacity(text).status,'unresolved')
    assert.match(goalFeasibilityIssue(card(5),seed(text)),/goal_capacity_unresolved/)
  })
}

for(const [text,days,max] of [
  ['평일 하루 20분 가능해.',[0,1,2,3,4],20],
  ['20 minutes each weekday',[0,1,2,3,4],20],
  ['20 minutes daily except weekends',[0,1,2,3,4],20],
  ['20 minutes every Monday and Wednesday',[0,2],20],
  ['a quarter of an hour per day',[0,1,2,3,4,5,6],15],
]) test('daily budget fits each occurrence and preserves evidence: '+text,()=> {
  const before=seed(text),original=structuredClone(before)
  assert.deepEqual(analyzeGoalCapacity(text).dailyMinutes,Array.from({length:7},(_,i)=>days.includes(i)?max:0))
  const draft=card(max,days.length),copy=structuredClone(draft)
  assert.equal(goalFeasibilityIssue(draft,before),null)
  assert.match(goalFeasibilityIssue(card(max+1),before),/goal_capacity_conflict/)
  assert.deepEqual(before,original);assert.deepEqual(draft,copy)
})
test('unequal daily budgets constrain duration, repeats, and preferred days independently',()=> {
  const brief=seed('10 minutes per day on weekdays, 20 minutes per day on weekends')
  assert.deepEqual(analyzeGoalCapacity(brief.capacity.summary).dailyMinutes,[10,10,10,10,10,20,20])
  assert.equal(goalFeasibilityIssue(card(20,2,[5,6]),brief),null)
  assert.match(goalFeasibilityIssue(card(20,3),brief),/goal_capacity_conflict/)
  assert.match(goalFeasibilityIssue(card(20,1,[0]),brief),/goal_capacity_conflict/)
  assert.match(goalFeasibilityIssue(card(50),brief),/goal_capacity_conflict/)
})
test('multiple actions cannot share nonexistent daily space even below the weekly total',()=> {
  const brief=seed('10 minutes per day on weekdays'),draft=card(6,3)
  draft.weeklyActions.push(...card(6,3).weeklyActions)
  assert.match(goalFeasibilityIssue(draft,brief),/goal_capacity_conflict/)
  draft.weeklyActions[1].frequencyPerWeek=2
  assert.equal(goalFeasibilityIssue(draft,brief),null)
})
test('daily and per-session caps compose without losing either limit',()=> {
  const brief=seed('20 minutes per day on weekdays; 10 minutes per session'),draft=card(10,5)
  draft.weeklyActions.push(...card(10,5).weeklyActions)
  assert.equal(goalFeasibilityIssue(draft,brief),null)
  assert.match(goalFeasibilityIssue(card(15),brief),/goal_capacity_conflict/)
  draft.weeklyActions[1].frequencyPerWeek=6
  assert.match(goalFeasibilityIssue(draft,brief),/goal_capacity_conflict/)
})

// Actual handler with mock provider replies, not paid/live language evaluation.
for(const text of ['5 minutes per day on weekdays','5 minutes each weekday','평일 하루 5분 가능해.']) {
  test('handler retries oversized daily draft and surfaces only the valid replacement: '+text,async()=> {
    const brief=seed(text),state=loadState({stage:5,agent_v2_context:{brief},messages:[{role:'user',text:'writing: 8 weeks, current 1 project, target 4 projects. '+text}]})
    const before=structuredClone(state)
    const draft=minutes=>({category:'writing',outcome:'4 projects',identity:'',cue:'',environment:'',deadline:'',baselineMetric:'1 project',targetMetric:'4 projects',durationWeeks:8,
      measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,progressStrategy:strategy,
      actions:[{title:'Draft a project note',frequencyPerWeek:1,durationMinutes:minutes,preferredDays:[],planningStyle:'repeat',completionCriterion:'Save one draft note',minimumAction:'Open the draft',minimumMinutes:1,goalResult:'4 projects',steps:['Open the draft','Write and save one note']}]})
    let calls=0
    const result=await runAgentTurn(state,'지금 말한 시간을 기준으로 초안을 만들어줘.',{today:'2026-09-16',now:'2026년 9월 16일',request:async body=>{
      assert.ok(++calls<=4,'unbounded mock retry')
      const route=!body.tools.some(tool=>tool.name==='respond')
      const rejected=body.input.filter(item=>item.type==='function_call_output').some(item=>/goal_capacity_conflict/.test(JSON.parse(item.output).error??''))
      const name=route?'route_request':'respond',args=route?{module:'goal',evidence:'지금 말한 시간을 기준으로 초안을 만들어줘.',reason:'Use recorded capacity.'}
        :{focus:'goals',goal_outcome:'4 projects',goal_draft:withCoachingDetails(draft(rejected?5:10)),summary:'시작할 초안이에요.',details:[],question:'시작할까요?',choices:[]}
      return {id:'mock-'+calls,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:'call-'+calls,arguments:JSON.stringify(args)}]}
    }})
    assert.ok(result.events.some(event=>/goal_capacity_conflict/.test(event.result?.error??'')))
    assert.equal(result.state.agent_v2_context.draft.card.weeklyActions[0].durationMinutes,5)
    assert.deepEqual(result.state.agent_v2_context.brief,before.agent_v2_context.brief)
    assert.deepEqual(result.state.goal_card,before.goal_card)
    assert.deepEqual(state,before)
  })
}
