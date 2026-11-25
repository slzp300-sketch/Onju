import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'
import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyBrief,updateGoalBrief,loadGoalBrief} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import {knownGoalValueHasEvidence} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalIntakeEvidence.ts'
import {goalBaselineIsCurrent,goalCapacityAppliesNow} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalEvidenceScope.ts'
import {parseGoalCapacity,analyzeGoalCapacity} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import {goalFeasibilityIssue} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import {loadState,runAgentTurn} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'

const strategy='첫 주 실제 시간을 기록하고 다음 주 실행량을 다시 제안합니다.'
const seed=(summary='1 hour per week')=>({...emptyBrief(),period:{label:'8 weeks',weeks:8},areas:['writing'],
  baselines:[{area:'writing',current:'1 project',evidence:'1 project',status:'known'}],objectives:[{area:'writing',result:'4 projects',evidence:'4 projects',resultKind:'metric'}],capacity:{summary,evidence:summary,status:'known'}})
const card=(minutes,count=1,days=[])=>({weeklyActions:[{durationMinutes:minutes,frequencyPerWeek:count,preferredDays:days}],execution:{progressStrategy:strategy}})
const change=(field,value,evidence,status='known')=>field==='capacity'?{capacity:{summary:value,evidence,status}}:{baselines:[{area:'writing',current:value,evidence,status}]}

for(const [field,text,value] of [
  ['capacity','I do not know how much time I can spend yet.','2 hours per week'],
  ['capacity','가능한 시간은 아직 모르겠어.','주당 2시간'],
  ['baseline','I do not know how many projects I have completed.','2 projects'],
  ['baseline','현재 실적은 아직 측정한 적 없어.','프로젝트 2개'],
  ['capacity','I can spend some time after work.','3 hours per week'],
  ['baseline','I have some experience writing.','5 projects'],
]) for(const status of ['known','estimate']) test('unsupported measurement cannot be laundered through a real quote: '+field+'/'+status+'/'+text,()=> {
  const before=seed(),copy=structuredClone(before)
  assert.equal(knownGoalValueHasEvidence(text,text,value,field),false)
  assert.throws(()=>updateGoalBrief(before,change(field,value,text,status),text),/requires_grounded_measurement|requires_grounded_user_evidence/)
  assert.deepEqual(before,copy)
})
for(const [field,source,evidence,value,expected] of [
  ['capacity','I can spend 1 hour per week.','1 hour per week','60 minutes per week',true],
  ['capacity','I can spend two hours per week.','two hours per week','120 minutes per week',true],
  ['capacity','I can spend 2 minutes per week.','2 minutes per week','2 hours per week',false],
  ['capacity','I can spend 2 hours per week.','2 hours per week','3 hours per week',false],
  ['capacity','주당1시간 가능해.','주당1시간','60 minutes per week',true],
  ['capacity','I do not know my score. I can spend 30 minutes per week.','30 minutes per week','30 minutes per week',true],
  ['baseline','I completed two projects.','two projects','2 projects',true],
  ['baseline','I currently study 1 hour per week.','1 hour per week','60 minutes per week',true],
  ['baseline','I completed 2 projects.','2 projects','2 books',false],
  ['baseline','I do not know my availability. I completed 2 projects.','2 projects','2 projects',true],
]) for(const quote of [evidence,source]) test('grounding preserves scope and explicit unit conversions: '+value+'/'+quote,()=> {
  assert.equal(knownGoalValueHasEvidence(source,quote,value,field),expected)
})
for(const [field,text] of [
  ['capacity','I do not know how much time I can spend yet.'],
  ['baseline','I do not know how many projects I have completed.'],
]) test('genuine unknown still saves as unmeasured: '+field,()=> {
  const next=updateGoalBrief(seed(),change(field,'Measure during the first week',text,'unmeasured'),text)
  assert.equal(field==='capacity'?next.capacity.status:next.baselines[0].status,'unmeasured')
  assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(next))),next)
})

for(const [source,value,expected] of [
  ['2주 후부터 주당 2시간 가능해.','주당 2시간',false],
  ['주당 2시간은 두 달 뒤부터 가능해.','주당 2시간',false],
  ['In two weeks, I can spend 2 hours per week.','2 hours per week',false],
  ['I can spend 2 hours per week after 3 months.','2 hours per week',false],
  ['I can spend 2 hours per week two weeks from now.','2 hours per week',false],
  ['2주 후까지 주당 2시간 가능해.','주당 2시간',true],
  ['I can spend 2 hours per week for two weeks.','2 hours per week',true],
  ['I can spend 2 hours per week until two weeks from now.','2 hours per week',true],
  ['우리 가족 전체는 주당 3시간 가능해. 나는 주당 30분 가능해.','주당 3시간',false],
  ['우리 가족 전체는 주당 3시간 가능해, 나는 주당 30분 가능해.','주당 30분',true],
  ['나는 주당 30분 가능하고 우리 가족 전체는 주당 3시간 가능해.','주당 30분',true],
  ['My whole household has 3 hours per week and I have 30 minutes per week.','3 hours per week',false],
  ['My whole household has 3 hours per week and I have 30 minutes per week.','30 minutes per week',true],
  ['I have 30 minutes per week and my entire family has 3 hours per week.','30 minutes per week',true],
]) for(const evidence of [value,source]) test('time and owner are bound to the selected fact: '+value+'/'+evidence,()=> {
  assert.equal(goalCapacityAppliesNow(source,evidence,value),expected)
  const before=seed(),copy=structuredClone(before)
  if(expected) assert.equal(updateGoalBrief(before,change('capacity',value,evidence),source).capacity.summary,value)
  else assert.throws(()=>updateGoalBrief(before,change('capacity',value,evidence),source),/capacity_|no_grounded/)
  assert.deepEqual(before,copy)
})

for(const [source,completed,total] of [
  ['목표인 프로젝트 4개 중 2개를 완료했어.','2개','프로젝트 4개'],
  ['목표인 책 6권 중 3권을 완료했어.','3권','책 6권'],
  ['Of my target of 4 projects, I have completed 2 projects.','2 projects','4 projects'],
  ['I completed 2 projects out of my target of 4 projects.','2 projects','4 projects'],
  ['Of my goal of six projects, I have finished two projects.','two projects','six projects'],
]) for(const value of [completed,total]) for(const evidence of [value,source]) test('partial completion resolves the amount role: '+value+'/'+evidence,()=> {
  const expected=value===completed
  assert.equal(goalBaselineIsCurrent(source,evidence,value),expected)
  const before=seed(),copy=structuredClone(before)
  if(expected) assert.equal(updateGoalBrief(before,change('baseline',value,evidence),source).baselines[0].current,value)
  else assert.throws(()=>updateGoalBrief(before,change('baseline',value,evidence),source),/baseline_not_decided/)
  assert.deepEqual(before,copy)
})

for(const [text,weekly,count,session] of [
  ['평일 하루 두 번, 회당 10분',100,10,10],['하루 세 회, 회당 5분',105,21,5],
  ['주당 한 시간 반씩',90,null,null],['주당 2시간 반 정도',150,null,null],['회당 한 시간 반만',null,null,90],
  ['one and a quarter of an hour per week',75,null,null],['two and a half hours per week',150,null,null],
  ['one and a quarter hours per session',null,null,75],['one and half an hour per week',90,null,null],
  ['90 minutes total per week; 2 sessions per week; 20 minutes per session',90,2,20],
  ['20 minutes per session; 90 minutes total per week; 2 sessions per week',90,2,20],
  ['주당 총 90분; 주 2회; 회당 20분',90,2,20],
]) test('compound amounts and independent limits: '+text,()=> {
  const limits=parseGoalCapacity(text)
  assert.equal(limits.status,'bounded')
  assert.equal(limits.weeklyMinutes?.max??null,weekly)
  assert.equal(limits.weeklySessions?.max??null,count)
  assert.equal(limits.perSessionMinutes?.max??null,session)
  assert.equal(Object.keys(limits).length,4,'internal daily fields are not added to the public shape')
  assert.equal(goalFeasibilityIssue(card(5),seed(text)),null)
})
for(const text of [
  '90 minutes per week; 120 minutes per week; 20 minutes per session',
  '2 sessions per week; 3 sessions per week; 20 minutes per session',
  '90 minutes per week or 2 sessions per week; 20 minutes per session',
  '90 minutes per week; -2 sessions per week; 20 minutes per session',
  '90 minutes per week; at least 2 sessions per week; 20 minutes per session',
  'twenty one and a quarter of an hour per week','주당 1~2시간 반씩',
]) test('partial, conflicting, or negative budgets do not become limits: '+text,()=> {
  assert.equal(parseGoalCapacity(text).status,'unresolved')
  assert.match(goalFeasibilityIssue(card(5),seed(text)),/goal_capacity_unresolved/)
})
for(const count of [1,2,3]) for(const minutes of [5,10,20]) for(const useMinutes of [true,false]) {
  const text=useMinutes?`${count} sessions of ${minutes} minutes each weekday`:`${count} sessions each weekday`
  test('daily session cap survives multiple actions, preferences, and reload: '+text,()=> {
    const analysis=analyzeGoalCapacity(text),brief=loadGoalBrief(JSON.parse(JSON.stringify(seed(text))))
    assert.deepEqual(analysis.dailySessions,[count,count,count,count,count,0,0])
    const draft=card(1,1,[0])
    draft.weeklyActions=Array.from({length:count},()=>card(1,1,[0]).weeklyActions[0])
    const before=structuredClone(brief),valid=structuredClone(draft)
    assert.equal(goalFeasibilityIssue(draft,brief),null)
    assert.deepEqual(draft,valid)
    draft.weeklyActions.push(card(1,1,[0]).weeklyActions[0])
    assert.match(goalFeasibilityIssue(draft,brief),/goal_capacity_conflict/)
    draft.weeklyActions.at(-1).preferredDays=[1]
    assert.equal(goalFeasibilityIssue(draft,brief),null)
    assert.deepEqual(brief,before)
  })
}

// Completed real handler paths with locally authored responses, no provider API.
test('handler rejects invented measured baseline and records genuine uncertainty',async()=> {
  const brief={...emptyBrief(),period:{label:'8 weeks',weeks:8},areas:['writing']}
  const state=loadState({stage:5,agent_v2_context:{brief},messages:[{role:'user',text:'writing for 8 weeks'}]}),before=structuredClone(state)
  const message='I do not know how many projects I have completed.'
  let calls=0
  const result=await runAgentTurn(state,message,{today:'2026-09-16',now:'2026년 9월 16일',request:async body=>{
    assert.ok(++calls<=4,'unexpected retry')
    const route=!body.tools.some(tool=>tool.name==='record_goal_brief')
    const rejected=body.input.filter(item=>item.type==='function_call_output').some(item=>/baseline_requires_grounded_measurement/.test(JSON.parse(item.output).error??''))
    const name=route?'route_request':'record_goal_brief'
    const args=route?{module:'goal',evidence:message,reason:'Record a starting point.'}:{period:null,areas:[],area_changes:[],baselines:[{area:'writing',current:rejected?'Measure during the first week':'2 projects',evidence:message,status:rejected?'unmeasured':'known'}],objectives:[],priority:null,capacity:null,feasibility_acceptance:null,
      reply:{paragraphs:['첫 주 기록으로 현재 수준을 확인할게요.'],bullets:[],question:'기간이 끝날 때 어떤 결과를 이루고 싶으세요?',choices:[]}}
    return {id:'mock-'+calls,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:'call-'+calls,arguments:JSON.stringify(args)}]}
  }})
  assert.ok(result.events.some(event=>/baseline_requires_grounded_measurement/.test(event.result?.error??'')))
  assert.equal(result.state.agent_v2_context.brief.baselines[0].status,'unmeasured')
  assert.doesNotMatch(result.assistant_message,/2 projects/)
  assert.equal(result.state.agent_v2_context.draft,null)
  assert.deepEqual(state,before)
})

for(const text of ['two 10-minute sessions each weekday','월요일부터 금요일까지 하루 두 번, 회당 10분 가능해.','평일 하루 두 번, 회당 10분 가능해.']) test('handler validates daily counts after existing day normalization: '+text,async()=> {
  // The existing weekday normalizer broadens ungrounded Monday preferences
  // for "평일". Three actions can then fit on different days. Named-day input
  // retains Monday preferences, so a third Monday action must be rejected.
  const expectsRetry=!text.startsWith('평일')
  const brief=seed(text),state=loadState({stage:5,agent_v2_context:{brief},messages:[{role:'user',text:'writing: 8 weeks, current 1 project, target 4 projects. '+text}]}),before=structuredClone(state)
  const draft=count=>({category:'writing',outcome:'4 projects',identity:'',cue:'',environment:'',deadline:'',baselineMetric:'1 project',targetMetric:'4 projects',durationWeeks:8,measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,progressStrategy:strategy,
    actions:Array.from({length:count},(_,i)=>({title:['Outline a project note','Draft a project note','Review a project note'][i],frequencyPerWeek:1,durationMinutes:5,preferredDays:[0],planningStyle:'repeat',completionCriterion:'Save one project note',minimumAction:'Open the draft',minimumMinutes:1,goalResult:'4 projects',steps:['Open the draft','Write and save one note']}))})
  let calls=0
  const result=await runAgentTurn(state,'지금 말한 시간을 기준으로 초안을 만들어줘.',{today:'2026-09-16',now:'2026년 9월 16일',request:async body=>{
    assert.ok(++calls<=4,'unexpected retry')
    const route=!body.tools.some(tool=>tool.name==='respond')
    const rejected=body.input.filter(item=>item.type==='function_call_output').some(item=>/goal_capacity_conflict/.test(JSON.parse(item.output).error??''))
    const name=route?'route_request':'respond',args=route?{module:'goal',evidence:'지금 말한 시간을 기준으로 초안을 만들어줘.',reason:'Use recorded limits.'}:{focus:'goals',goal_outcome:'4 projects',goal_draft:withCoachingDetails(draft(rejected?2:3)),summary:'시작할 초안이에요.',details:[],question:'시작할까요?',choices:[]}
    return {id:'mock-'+calls,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:'call-'+calls,arguments:JSON.stringify(args)}]}
  }})
  assert.equal(result.events.some(event=>/goal_capacity_conflict/.test(event.result?.error??'')),expectsRetry)
  assert.equal(result.state.agent_v2_context.draft.card.weeklyActions.length,expectsRetry?2:3)
  assert.ok(result.state.agent_v2_context.draft.card.weeklyActions.every(action=>JSON.stringify(action.preferredDays)===JSON.stringify(expectsRetry?[0]:[0,1,2,3,4])))
  assert.equal(goalFeasibilityIssue(result.state.agent_v2_context.draft.card,brief),null)
  assert.deepEqual(result.state.agent_v2_context.brief,before.agent_v2_context.brief)
  assert.deepEqual(result.state.goal_card,before.goal_card)
  assert.deepEqual(state,before)
})
