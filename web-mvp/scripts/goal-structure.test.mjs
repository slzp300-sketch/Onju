import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'
import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyBrief,updateGoalBrief,loadGoalBrief,goalBriefDecisionView} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import {bindGoalFact} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFactBinding.ts'
import {capacityContractLimits} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacityContract.ts'
import {assessGoalFeasibility,goalFeasibilityIssue} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import {loadState,runAgentTurn} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import {emptyGoal} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goal.ts'

const strategy='첫 주 실제 완료량과 시간을 기록해 다음 주 실행량을 다시 제안합니다.'
const base=(areas=['writing'])=>({...emptyBrief(),period:{label:'8 weeks',weeks:8},areas,
  baselines:areas.map(area=>({area,current:'1 project',evidence:'1 project',status:'known'})),
  objectives:areas.map(area=>({area,result:'8 projects',evidence:'8 projects',resultKind:'metric'})),
  priority:areas.length>1?{mode:'equal',primaryArea:'',flexibleAreas:[],evidence:'Both goals have equal priority.'}:null,
  capacity:{summary:'1 hour per week',evidence:'1 hour per week',status:'known'}})
const baseline=(area,current,evidence)=>({baselines:[{area,current,evidence,status:'known'}]})
const cap=(summary,evidence)=>({capacity:{summary,evidence,status:'known'}})
const card=(minutes,count=1,days=[])=>({weeklyActions:[{title:'Practice',durationMinutes:minutes,frequencyPerWeek:count,preferredDays:days}],execution:{progressStrategy:strategy}})
const current=(state,area)=>state.baselines.find(item=>item.area===area)

// Metamorphic invariants: renaming goals, reordering sentences, changing amounts
// or shortening the quote cannot move a fact to another goal with the same unit.
for(const areas of [['design','coding'],['piano','guitar'],['그림','공예'],['독서','영어']])
for(const reverse of [false,true]) for(const whole of [false,true]) for(const n of [3,6]) {
  test('goal identity invariant '+JSON.stringify({areas,reverse,whole,n}),()=>{
    const lines=[`${areas[1]}: I completed ${n} projects.`,`${areas[0]}: no change.`]
    const message=(reverse?lines.reverse():lines).join(' '),evidence=whole?message:`${n} projects`
    const before=base(areas),copy=structuredClone(before)
    assert.throws(()=>updateGoalBrief(before,baseline(areas[0],`${n} projects`,evidence),message),/goal_fact_area_mismatch/)
    const next=updateGoalBrief(before,baseline(areas[1],`${n} projects`,evidence),message)
    assert.equal(current(next,areas[0]).current,'1 project')
    assert.equal(current(next,areas[1]).binding.area,areas[1])
    assert.equal(current(next,areas[1]).binding.progress,'completed')
    assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(next))),next)
    assert.deepEqual(before,copy)
  })
}
for(const areas of [['design','coding'],['그림','공예']])for(const whole of [false,true]) {
  test('repeated identical quantities bind to either explicitly named goal '+JSON.stringify({areas,whole}),()=>{
    const message=`${areas[0]}: 3 projects completed. ${areas[1]}: 3 projects completed.`
    for(const area of areas){
      const next=updateGoalBrief(base(areas),baseline(area,'3 projects',whole?message:'3 projects'),message)
      assert.equal(current(next,area).current,'3 projects')
      assert.ok(current(next,area).binding.scope.includes(area))
    }
  })
}
for(const ko of [false,true])for(const n of [2,4,6])for(const reverse of [false,true]) {
  test('progress roles survive numbers and clause order '+JSON.stringify({ko,n,reverse}),()=>{
    const area=ko?'코딩':'coding'
    const lines=ko?[`프로젝트 ${n}개를 완료했어.`,`프로젝트 ${n+1}개는 아직 진행 중이야.`]:[`I have ${n} completed projects.`,`I have ${n+1} unfinished projects.`]
    const message=(reverse?lines.reverse():lines).join(' ')
    const good=ko?`${n}개`:`${n} projects`,bad=ko?`${n+1}개`:`${n+1} projects`
    assert.throws(()=>updateGoalBrief(base([area]),baseline(area,bad,message),message),/baseline_not_decided/)
    const next=updateGoalBrief(base([area]),baseline(area,good,message),message)
    assert.equal(current(next,area).binding.progress,'completed')
    assert.equal(current(next,area).binding.quantity.value,n)
  })
}
for(const message of ['I have 3 projects in progress.','프로젝트 3개는 진행 중이야.'])test('explicit pending state stays pending, never completed: '+message,()=>{
  const value=message.startsWith('I')?'3 projects in progress':'프로젝트 3개 진행 중'
  const next=updateGoalBrief(base(),baseline('writing',value,message),message)
  assert.equal(next.baselines[0].binding.progress,'in_progress')
  assert.equal(assessGoalFeasibility(next).gaps.length,0)
  const raw=JSON.parse(JSON.stringify(next));raw.baselines[0].binding.progress='completed'
  assert.equal(loadGoalBrief(raw).baselines[0].binding.progress,'in_progress')
})
for(const n of [2,3,8])for(const label of ['task number','project identifier','week number'])test('unrelated numbers cannot create time: '+n+'/'+label,()=>{
  const source=`I do not know my available time yet. The ${label} is ${n}.`
  assert.throws(()=>updateGoalBrief(base(),cap(`${n} hours per week`,source),source),/capacity_requires_grounded/)
})
for(const source of ['부부 합쳐서 주당 4시간 가능해.','Between the two of us, we have 4 hours per week.'])test('collective owner cannot become personal capacity: '+source,()=>{
  assert.throws(()=>updateGoalBrief(base(),cap(source,source),source),/capacity_not_decided/)
})
for(const status of ['known','estimate'])for(const source of ['주당 2시간 가능할 거라고 예상해.','I expect to have 2 hours per week.'])test('projection is not present availability: '+status+'/'+source,()=>{
  assert.throws(()=>updateGoalBrief(base(),{capacity:{summary:source,evidence:source,status}},source),/capacity_not_decided/)
})

// The constraint contract is invariant under summarization and serialization.
for(const count of [1,2,3])for(const minutes of [5,10])for(const ko of [false,true]) {
  test('summary cannot relax any constraint '+JSON.stringify({count,minutes,ko}),()=>{
    const source=ko?`평일 하루 ${count}회, 회당 ${minutes}분 가능해.`:`I can spend ${count} sessions of ${minutes} minutes each weekday.`
    const summary=`${count*minutes*5} minutes per week`,before=base(),snapshot=structuredClone(before)
    const saved=updateGoalBrief(before,cap(summary,source),source)
    assert.equal(saved.capacity.summary,summary)
    assert.equal(saved.capacity.contract.version,1)
    for(const state of [saved,loadGoalBrief(JSON.parse(JSON.stringify(saved)))]){
      const limits=capacityContractLimits(state.capacity)
      assert.equal(limits.weeklySessions.max,count*5)
      assert.equal(limits.perSessionMinutes.max,minutes)
      assert.deepEqual(limits.dailySessions,[count,count,count,count,count,0,0])
      assert.equal(goalFeasibilityIssue(card(minutes,1,[0]),state),null)
      assert.match(goalFeasibilityIssue(card(minutes+1,1,[0]),state),/goal_capacity_conflict/)
      const tooMany=card(1);tooMany.weeklyActions=Array.from({length:count+1},()=>card(1,1,[0]).weeklyActions[0])
      assert.match(goalFeasibilityIssue(tooMany,state),/goal_capacity_conflict/)
      const tampered=structuredClone(state)
      tampered.capacity.contract.limits={status:'bounded',weeklyMinutes:{min:99999,max:99999},weeklySessions:null,perSessionMinutes:null}
      assert.deepEqual(capacityContractLimits(tampered.capacity),limits)
      assert.match(goalFeasibilityIssue(card(minutes+1,1,[0]),loadGoalBrief(tampered)),/goal_capacity_conflict/)
    }
    assert.deepEqual(before,snapshot)
  })
}
test('legacy summaries also enforce original evidence without requiring a migration',()=>{
  const state=base();state.capacity={summary:'100 minutes per week',evidence:'two 10-minute sessions each weekday',status:'known'}
  assert.match(goalFeasibilityIssue(card(30,1,[0]),loadGoalBrief(state)),/goal_capacity_conflict/)
  assert.equal(goalFeasibilityIssue(card(10,2,[0,1]),loadGoalBrief(state)),null)
})
test('legacy summary cannot hide a zero-day restriction in the original evidence',()=>{
  const brief=base();brief.capacity={summary:'140 minutes per week',evidence:'매일 20분 가능하고 수요일은 0분이야.',status:'known'}
  const limits=capacityContractLimits(loadGoalBrief(brief).capacity)
  assert.equal(limits.status,'bounded')
  assert.equal(limits.weeklyMinutes.max,120)
  assert.deepEqual(limits.dailyMinutes,[20,20,0,20,20,20,20])
  assert.match(goalFeasibilityIssue(card(5,1,[2]),loadGoalBrief(brief)),/goal_capacity_conflict/)
  assert.equal(goalFeasibilityIssue(card(20,1,[0]),loadGoalBrief(brief)),null)
})
for(const summary of ['every Monday, Wednesday, and Friday 20 minutes','60 minutes per week'])test('comma-separated cadence is not truncated by candidate scoping: '+summary,()=>{
  const source='every Monday, Wednesday, and Friday 20 minutes'
  const brief=updateGoalBrief(base(),cap(summary,source),source)
  for(const loaded of [brief,loadGoalBrief(JSON.parse(JSON.stringify(brief)))]){
    const limits=capacityContractLimits(loaded.capacity)
    assert.equal(limits.weeklyMinutes.max,60)
    assert.deepEqual(limits.dailyMinutes,[20,0,20,0,20,0,0])
  }
})
for(const value of ['3 unfinished projects','프로젝트 3개 진행 중'])test('legacy pending baseline is never subtracted as completed work: '+value,()=>{
  const brief=base();brief.baselines[0].current=value
  const assessment=assessGoalFeasibility(loadGoalBrief(JSON.parse(JSON.stringify(brief))))
  assert.equal(assessment.status,'needs_measurement')
  assert.deepEqual(assessment.gaps,[])
})
test('stale contract fails closed; explicit revision creates a fresh contract',()=>{
  const source='two 10-minute sessions each weekday'
  const state=updateGoalBrief(base(),cap('100 minutes per week',source),source)
  state.capacity.summary='120 minutes per week'
  assert.equal(capacityContractLimits(state.capacity).status,'unresolved')
  const next=updateGoalBrief(state,cap('30 minutes per week','30 minutes per week'),'I can now spend 30 minutes per week.')
  assert.equal(next.capacity.contract.limits.weeklyMinutes.max,30)
  assert.equal(next.capacity.contract.limits.weeklySessions,null)
})
test('explicit unmeasured replacement clears old numerical authority',()=>{
  const source='I do not know how much time I can spend yet.'
  const next=updateGoalBrief(base(),{capacity:{summary:'Measure during the first week',evidence:source,status:'unmeasured'}},source)
  assert.equal(capacityContractLimits(next.capacity).status,'unspecified')
  assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(next))),next)
})
test('provider cannot inject its own binding or constraint contract',()=>{
  const source='I can spend 20 minutes per week.'
  const next=updateGoalBrief(base(),{capacity:{...cap('20 minutes per week',source).capacity,binding:{subject:'self'},contract:{limits:{weeklyMinutes:{max:9000}}}}},source)
  assert.equal(next.capacity.contract.limits.weeklyMinutes.max,20)
  assert.equal(next.capacity.binding.version,1)
})
test('a rejected relation rolls back the entire update, including an earlier period edit',()=>{
  const before=base(['design','coding']),copy=structuredClone(before)
  const message='Extend the period to 12 weeks. For coding, I completed 3 projects.'
  assert.throws(()=>updateGoalBrief(before,{period:{kind:'duration',normalized:'12 weeks',evidence:'12 weeks'},...baseline('design','3 projects','3 projects')},message),/goal_fact_area_mismatch/)
  assert.deepEqual(before,copy)
})

test('real handler rejects a wrong goal, then records the corrected relation and asks for a result',async()=>{
  const brief=base(['design','coding']);brief.objectives=[]
  const state=loadState({stage:5,agent_v2_context:{brief}}),snapshot=structuredClone(state)
  const message='For coding, I have completed 3 projects. My design progress stays the same.'
  let calls=0
  const result=await runAgentTurn(state,message,{today:'2026-09-16',now:'2026년 9월 16일',request:async body=>{
    assert.ok(++calls<=5,'unexpected retry')
    const route=!body.tools.some(tool=>tool.name==='record_goal_brief')
    const rejected=body.input.filter(item=>item.type==='function_call_output').some(item=>/goal_fact_area_mismatch/.test(JSON.parse(item.output).error??''))
    const name=route?'route_request':'record_goal_brief'
    const args=route?{module:'goal',evidence:message,reason:'Record the current state.'}:{period:null,areas:[],area_changes:[],baselines:[{area:rejected?'coding':'design',current:'3 projects',evidence:message,status:'known'}],objectives:[],priority:null,capacity:null,feasibility_acceptance:null,
      reply:{paragraphs:['코딩의 현재 실적을 기록했어요.'],bullets:[],question:'기간이 끝날 때 어떤 결과를 이루고 싶으세요?',choices:[]}}
    return {id:'mock-'+calls,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:'call-'+calls,arguments:JSON.stringify(args)}]}
  }})
  assert.ok(result.events.some(event=>/goal_fact_area_mismatch/.test(event.result?.error??'')))
  assert.equal(current(result.state.agent_v2_context.brief,'design').current,'1 project')
  assert.equal(current(result.state.agent_v2_context.brief,'coding').current,'3 projects')
  assert.equal(result.state.agent_v2_context.draft,null)
  assert.deepEqual(state,snapshot)
})

test('binding identifies source role without choosing the conversation script',()=>{
  const source='For coding, I have completed 2 projects.'
  const fact=bindGoalFact('baseline',source,source,'2 projects','coding',['design','coding'])
  assert.equal(fact.progress,'completed');assert.equal(fact.subject,'self_or_unspecified')
  assert.equal(fact.temporal,'current_or_unspecified');assert.equal('question' in fact,false)
})
test('decision view includes all limits but omits duplicated provenance without mutation',()=>{
  const source='I can spend two 10-minute sessions each weekday.'
  let brief=updateGoalBrief(base(),cap('100 minutes per week',source),source)
  brief=updateGoalBrief(brief,baseline('writing','2 projects','I completed 2 projects.'),'I completed 2 projects.')
  const before=structuredClone(brief),view=goalBriefDecisionView(brief)
  assert.equal(view.capacity.constraints.weeklyMinutes.max,100)
  assert.equal(view.capacity.constraints.perSessionMinutes.max,10)
  assert.deepEqual(view.capacity.constraints.dailySessions,[2,2,2,2,2,0,0])
  assert.equal(JSON.stringify(view).includes('binding'),false)
  assert.equal(JSON.stringify(view).includes('contract'),false)
  assert.ok(JSON.stringify(view).length<JSON.stringify(brief).length*0.8)
  assert.deepEqual(brief,before)
})

test('a distinct baseline cadence cannot contaminate a bounded capacity quote',()=>{
  const source='독서 현재 수준은 한 달에 한 권이고 주 3회 20분 가능'
  const brief=updateGoalBrief(base(),cap('주 3회 20분 가능','주 3회 20분 가능'),source)
  for(const value of [brief,loadGoalBrief(JSON.parse(JSON.stringify(brief)))]){
    assert.equal(capacityContractLimits(value.capacity).weeklySessions.max,3)
    assert.equal(capacityContractLimits(value.capacity).perSessionMinutes.max,20)
  }
})
test('narrow quote never discards an additional capacity constraint',()=>{
  const source='현재 책 1권이고 주 3회 20분 가능하지만 수요일은 0분이야.'
  const brief=updateGoalBrief(base(),cap('주 3회 20분 가능',source),source)
  assert.equal(capacityContractLimits(brief.capacity).status,'unresolved')
})
test('unambiguous family aliases bind results without confusing two named goals',()=>{
  const source='포트폴리오 2개 완성과 책 1권 완독이 목표야.'
  const before=base(['포트폴리오','독서'])
  const saved=updateGoalBrief(before,{objectives:[
    {area:'포트폴리오',result:'포트폴리오 2개 완성',evidence:'포트폴리오 2개 완성',result_kind:'deliverable'},
    {area:'독서',result:'책 1권 완독',evidence:'책 1권 완독',result_kind:'metric'},
  ]},source)
  assert.ok(saved.objectives.some(item=>item.area==='독서'&&item.result==='책 1권 완독'))
  assert.ok(saved.objectives.some(item=>item.area==='독서'&&item.result==='8 projects'),'adding another result must not erase the prior one')
  assert.throws(()=>updateGoalBrief(before,{objectives:[{area:'포트폴리오',result:'책 1권 완독',evidence:source,result_kind:'metric'}]},source),/goal_fact_area_mismatch/)
})

const proposal=minutes=>({category:'writing',outcome:'8 projects',identity:'',cue:'',environment:'',deadline:'',baselineMetric:'1 project',targetMetric:'8 projects',durationWeeks:8,measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,progressStrategy:strategy,
  actions:[{title:'Draft a project note',frequencyPerWeek:1,durationMinutes:minutes,preferredDays:[0],planningStyle:'repeat',completionCriterion:'Save one project note',minimumAction:'Open the draft',minimumMinutes:1,goalResult:'8 projects',steps:['Open the draft','Write and save one note']}]})
const mock=(name,args,count)=>({id:'mock-'+count,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:'call-'+count,arguments:JSON.stringify(args)}]})
test('full handler rejects oversized draft after lossy summary and reload, then completes within original limit',async()=>{
  const source='I can spend two 10-minute sessions each weekday.'
  const brief=updateGoalBrief(base(),cap('100 minutes per week',source),source)
  const state=loadState(JSON.parse(JSON.stringify({stage:5,agent_v2_context:{brief}}))),before=structuredClone(state)
  let calls=0
  const result=await runAgentTurn(state,'지금 말한 시간을 기준으로 초안을 만들어줘.',{today:'2026-09-16',now:'2026년 9월 16일',request:async body=>{
    assert.ok(++calls<=5,'unexpected retry')
    const route=!body.tools.some(tool=>tool.name==='respond')
    const rejected=body.input.filter(item=>item.type==='function_call_output').some(item=>/goal_capacity_conflict/.test(JSON.parse(item.output).error??''))
    return route?mock('route_request',{module:'goal',evidence:'지금 말한 시간을 기준으로 초안을 만들어줘.',reason:'Use recorded limits.'},calls)
      :mock('respond',{focus:'goals',goal_outcome:'8 projects',goal_draft:withCoachingDetails(proposal(rejected?10:30)),summary:'시작할 초안이에요.',details:[],question:'시작할까요?',choices:[]},calls)
  }})
  assert.ok(result.events.some(event=>/goal_capacity_conflict/.test(event.result?.error??'')))
  assert.equal(result.state.agent_v2_context.draft.card.weeklyActions[0].durationMinutes,10)
  assert.deepEqual(result.state.goal_card,before.goal_card)
  assert.deepEqual(state,before)
})

const revisionCard=minutes=>({...structuredClone(emptyGoal),category:'writing',outcome:'8 projects',targetMetric:'8 projects',durationWeeks:8,
  weeklyActions:[{title:'Draft a project note',frequencyPerWeek:1,durationMinutes:minutes,preferredDays:[0]}]})
const timeEdit=(minutes,evidence)=>({field:'durationMinutes',actionIndex:0,number:minutes,text:null,days:null,evidence})
for(const expanded of [false,true])test('revision honors original bounds and only accepts explicit new availability: '+expanded,async()=>{
  const source='I can spend two 10-minute sessions each weekday.'
  const brief=updateGoalBrief(base(),cap('100 minutes per week',source),source)
  const state=loadState({stage:5,goal_card:revisionCard(5),agent_v2_context:{brief}}),before=structuredClone(state)
  const message=expanded?'이제 주당 30분, 회당 30분 가능해. 행동 시간을 30분으로 바꿔줘.':'행동 시간을 30분으로 바꿔줘. 안 되면 10분으로 바꿔줘.'
  let calls=0
  const result=await runAgentTurn(state,message,{today:'2026-09-16',now:'2026년 9월 16일',request:async body=>{
    assert.ok(++calls<=5,'unexpected retry')
    if(!body.tools.some(tool=>tool.name==='revise_goal'))return mock('route_request',{module:'goal',evidence:message,reason:'Revise within bounds.'},calls)
    const rejected=body.input.filter(item=>item.type==='function_call_output').some(item=>/goal_capacity_conflict/.test(JSON.parse(item.output).error??''))
    return mock('revise_goal',{edits:[timeEdit(rejected?10:30,rejected?'10분으로 바꿔줘':'30분으로 바꿔줘')],capacity_update:expanded?cap('주당 30분, 회당 30분','이제 주당 30분, 회당 30분 가능해.').capacity:null},calls)
  }})
  assert.equal(result.events.some(event=>/goal_capacity_conflict/.test(event.result?.error??'')),!expanded)
  assert.equal(result.state.agent_v2_context.draft.card.weeklyActions[0].durationMinutes,expanded?30:10)
  assert.equal(capacityContractLimits(result.state.agent_v2_context.brief.capacity).perSessionMinutes.max,expanded?30:10)
  assert.deepEqual(result.state.goal_card,before.goal_card)
  assert.deepEqual(state,before)
})
test('invalid persisted draft cannot be activated by approval and its conflict is visible to the agent',async()=>{
  const source='I can spend two 10-minute sessions each weekday.'
  const brief=updateGoalBrief(base(),cap('100 minutes per week',source),source)
  const state=loadState({stage:5,agent_v2_context:{brief,draft:{id:'old',presentedMessageId:'old-msg',card:revisionCard(30),changes:[]}},messages:[{id:'old-msg',role:'assistant',text:'이 초안으로 시작할까요?'}]})
  let calls=0
  const result=await runAgentTurn(state,'이 초안으로 시작할게요',{today:'2026-09-16',now:'2026년 9월 16일',request:async body=>{
    assert.ok(++calls<=4,'unexpected retry')
    if(!body.tools.some(tool=>tool.name==='respond'))return mock('route_request',{module:'goal',evidence:'이 초안으로 시작할게요',reason:'Check pending limits.'},calls)
    assert.match(JSON.stringify(body),/pendingDraftCapacityIssue.*goal_capacity_conflict/)
    return mock('respond',{focus:'goals',goal_outcome:'',goal_draft:null,summary:'이전 초안은 회당 가능한 시간을 넘어서 아직 확정하지 않았어요.',details:[],question:'회당 한도 안으로 줄여볼까요?',choices:[]},calls)
  }})
  assert.ok(calls>0)
  assert.equal(result.state.goal_card.weeklyActions.length,0)
  assert.equal(result.state.agent_v2_context.draft.id,'old')
  assert.equal(result.events.some(event=>event.tool==='confirm_goal'&&event.result?.ok),false)
})
