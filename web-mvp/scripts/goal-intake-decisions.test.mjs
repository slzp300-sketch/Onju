import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'
import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyBrief,updateGoalBrief,loadGoalBrief} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import {goalBaselineIsCurrent,goalResultIsDecided,goalFactIsAsserted} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalEvidenceScope.ts'
import {parseGoalCapacity} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import {parseGoalQuantity,goalFeasibilityIssue} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import {loadState,runAgentTurn} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'

const seed=(time='1 hour per week')=>({...emptyBrief(),period:{label:'8 weeks',weeks:8},areas:['writing'],
  baselines:[{area:'writing',current:'1 article per week',evidence:'1 article per week',status:'known'}],
  objectives:[{area:'writing',result:'8 articles',evidence:'8 articles',resultKind:'metric'}],capacity:{summary:time,evidence:time,status:'known'}})
const payload=(field,value,evidence)=>field==='baseline'?{baselines:[{area:'writing',current:value,evidence,status:'known'}]}
  :field==='capacity'?{capacity:{summary:value,evidence,status:'known'}}
    :{objectives:[{area:'writing',result:value,evidence,result_kind:'metric'}]}

for(const [field,text,value,expected] of [
  ['objective','책 6권까지 하고 싶지 않아.','책 6권',false],
  ['objective','책 6권으로 정할게.','책 6권',true],
  ['objective','I doubt I can finish 6 books.','6 books',false],
  ['objective',"I don't doubt I can finish 6 books.",'6 books',true],
  ['capacity','I am unable to spare 2 hours per week.','2 hours per week',false],
  ['capacity','I am not able to spare 2 hours per week.','2 hours per week',false],
  ['capacity','I am able to spare 2 hours per week.','2 hours per week',true],
  ['capacity','휴가를 받으면 주당 2시간 가능해.','주당 2시간',false],
  ['capacity','주당 2시간은 휴가를 받으면 가능해.','주당 2시간',false],
  ['capacity','휴가를 받았어. 현재 주당 2시간 가능해.','주당 2시간',true],
  ['capacity','Once childcare starts, I can spend 2 hours per week.','2 hours per week',false],
  ['capacity','I can spend 2 hours per week once childcare starts.','2 hours per week',false],
  ['capacity','Childcare has started. I can spend 2 hours per week now.','2 hours per week',true],
  ['capacity','I can spend 20 or 40 minutes per week, but I have not decided yet.','40 minutes per week',false],
  ['capacity','I can spend 40 minutes per week. Cancel that request.','40 minutes per week',false],
  ['capacity','I can spend 40 minutes per week. Cancel the meeting.','40 minutes per week',true],
  ['capacity','I can spend 40 minutes per week. Please do not cancel that request.','40 minutes per week',true],
  ['objective','책 6권으로 정할게. 방금 한 말 취소할게.','책 6권',false],
  ['objective','책 6권으로 정할게. 모임은 취소할게.','책 6권',true],
  ['objective','I want 6 books. Retract that decision.','6 books',false],
  ['baseline','우리 팀은 프로젝트 8개를 완성했어. 나는 프로젝트 2개야.','프로젝트 8개',false],
  ['baseline','우리 팀은 프로젝트 8개를 완성했어. 나는 프로젝트 2개야.','프로젝트 2개',true],
  ['baseline','나는 프로젝트 2개야. 우리 팀은 프로젝트 8개를 완성했어.','프로젝트 2개',true],
  ['baseline','The workshop participants completed 6 projects. I finished 2 projects.','6 projects',false],
  ['baseline','The workshop participants completed 6 projects. I finished 2 projects.','2 projects',true],
  ['baseline','I finished 2 projects. Our team completed 6 projects.','2 projects',true],
  ['baseline','다음 달 말에는 프로젝트 4개가 완성될 예정이야. 지금은 프로젝트 2개야.','프로젝트 4개',false],
  ['baseline','다음 달 말에는 프로젝트 4개가 완성될 예정이야. 지금은 프로젝트 2개야.','프로젝트 2개',true],
  ['baseline','I will have finished 4 projects by next month. Right now I have 2 projects.','4 projects',false],
  ['baseline','I will have finished 4 projects by next month. Right now I have 2 projects.','2 projects',true],
  ['baseline','I am going to complete 4 projects by next month.','4 projects',false],
  ['baseline','I have completed 4 projects this month.','4 projects',true],
]) for(const evidence of [...new Set([value,text])]) test(`${field} authority: ${text} / ${evidence}`,()=> {
  const before=seed(),snapshot=structuredClone(before),input=payload(field,value,evidence)
  if(expected) {
    const after=updateGoalBrief(before,input,text)
    if(field==='objective') {
      assert.ok(after.objectives.some(item=>item.result===value),'asserted result is captured')
      assert.ok(after.objectives.some(item=>item.result===before.objectives[0].result),'an unrelated result in the same area is not overwritten')
    } else assert.equal(field==='baseline'?after.baselines[0].current:after.capacity.summary,value)
    assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(after))),after)
  } else assert.throws(()=>updateGoalBrief(before,input,text),/not_decided/)
  assert.deepEqual(before,snapshot)
})

for(const text of ['I will have finished 4 projects by next month.','프로젝트 4개가 완성될 예정이야.']) test('a future result is not a current baseline: '+text,()=> {
  const value=text.includes('프로젝트')?'프로젝트 4개':'4 projects'
  assert.equal(goalBaselineIsCurrent(text,value,value),false)
  assert.equal(goalResultIsDecided(text,value,value),true)
})
for(const text of ['I can spend 1 hour once a week.','Once a week I can spend 1 hour.','I can spend 20 minutes per day after work.']) {
  test('habitual timing is not an unmet future condition: '+text,()=>assert.equal(goalFactIsAsserted(text,text),true))
}
for(const [text,expected] of [
  ['Change the period to 12 weeks. Actually, disregard that request. Keep 8 weeks.',false],
  ['기간을 12주로 늘릴게. 아니, 방금 말 취소할게. 8주 그대로 해줘.',false],
  ['Change the period to 12 weeks. Cancel the meeting.',true],
  ['Change the period to 12 weeks. Do not withdraw that decision.',true],
]) test('period withdrawal is decision-scoped: '+text,()=> {
  const original=seed(),evidence=text.includes('12주')?'12주':'12 weeks',input={period:{kind:'duration',normalized:evidence,evidence}}
  if(expected) assert.equal(updateGoalBrief(original,input,text).period.weeks,12)
  else assert.throws(()=>updateGoalBrief(original,input,text),/period_not_decided/)
  assert.equal(original.period.weeks,8)
})
for(const [text,expected] of [
  ['writing을 우선할지 고민 중이야. 아직 선택은 안 했어.',false],
  ['writing을 우선할게. 그 결정 철회할게.',false],
  ["I choose writing first, but I haven't decided yet.",false],
  ['I choose writing first. Cancel that decision.',false],
  ['I choose writing first. Cancel the meeting.',true],
  ['writing을 우선할게.',true],
]) test('priority uses the same deferral boundary: '+text,()=> {
  const original={...seed(),areas:['writing','reading'],priority:{mode:'equal',primaryArea:'',flexibleAreas:[],evidence:'Both goals have equal priority.'}}
  const input={priority:{mode:'ranked',primary_area:'writing',flexible_areas:['reading'],evidence:text}}
  if(expected) assert.equal(updateGoalBrief(original,input,text).priority.primaryArea,'writing')
  else assert.throws(()=>updateGoalBrief(original,input,text),/priority_not_decided/)
  assert.equal(original.priority.mode,'equal')
})
for(const [text,expected] of [
  ['I choose to keep this target. No, withdraw that consent.',false],
  ['I choose to keep this target. Do not withdraw that consent.',true],
  ['이대로 유지할게. 그 동의 취소할게.',false],
  ['이대로 유지할게. 모임은 취소할게.',true],
]) test('explicit consent can be withdrawn in the same turn: '+text,()=> {
  const original=seed(),input={feasibility_acceptance:{evidence:text}}
  if(expected) assert.equal(updateGoalBrief(original,input,text).feasibilityAcceptance.evidence,text)
  else assert.throws(()=>updateGoalBrief(original,input,text),/feasibility_acceptance_requires/)
  assert.equal(original.feasibilityAcceptance,null)
})
test('unknown capacity remains unknown, rather than forced into a numeric choice',()=> {
  const text='I do not know my available time yet.'
  const after=updateGoalBrief(seed(),{capacity:{summary:'Unknown available time',evidence:text,status:'unmeasured'}},text)
  assert.equal(after.capacity.status,'unmeasured')
})

for(const [text,minutes,count,perSession] of [
  ['1½ hours per week',90,null,null],['1 ½ hours per week',90,null,null],['１½ hours per week',90,null,null],
  ['¼ hour per week',15,null,null],['2¾ hours per week',165,null,null],['½ hour daily',210,null,null],
  ['주당 1½시간',90,null,null],['2 sessions of 1½ hours per week',180,2,90],
  ['이틀마다 20분 가능해.',70,null,null],['격일 20분 가능해.',70,null,null],
  ['20 minutes every other day',70,null,null],['20 minutes every 2 days',70,null,null],
  ['주 3회, 한 번에 20분 가능해.',60,3,20],['한 번에 20분, 주 3회 가능해.',60,3,20],
  ['three times weekly, 20 minutes at a time',60,3,20],['20 minutes at a time, three times weekly',60,3,20],
  ['평일 하루 10분, 주말 하루 20분 가능해.',90,null,null],['주말 하루 20분; 평일 하루 10분',90,null,null],
  ['weekdays 10 minutes per day, weekends 20 minutes per day',90,null,null],
  ['평일 매일 10분 및 주말 매일 20분',90,null,null],
  ['20 minutes every Monday, Wednesday and Friday',60,null,null],
  ['every Monday, Wednesday, and Friday 20 minutes',60,null,null],
  ['20 minutes every Monday and Monday',20,null,null],
  ['월요일부터 금요일까지 하루 10분',50,null,null],
  ['오늘부터 매일 10분',70,null,null],
]) test('resolved capacity: '+text,()=> {
  const limits=parseGoalCapacity(text)
  assert.deepEqual(limits,{status:'bounded',weeklyMinutes:{min:minutes,max:minutes},weeklySessions:count===null?null:{min:count,max:count},perSessionMinutes:perSession===null?null:{min:perSession,max:perSession}})
  const brief=seed(text),card={weeklyActions:[{frequencyPerWeek:1,durationMinutes:minutes+1}],execution:{progressStrategy:'첫 주 시간을 기록하고 다음 주 다시 제안합니다.'}}
  assert.match(goalFeasibilityIssue(card,brief),/goal_capacity_conflict/)
})
for(const text of [
  '1.5½ hours per week','1½2 hours per week','1,½ hours per week','1 1/2 hours per week','11⁄2 hours per week',
  '-1½ hours per week','− 1½ hours per week','1½ hours or 30 minutes per week',
  '평일 하루 10분, 평일 하루 20분','평일 하루 10분, 월요일 하루 20분',
  '20 minutes every Monday through Friday','20 minutes every Monday and holidays',
  '20 minutes every Monday except holidays','20 minutes daily on Monday-Friday',
  '금요일부터 월요일까지 매일 20분','월요일부터 매일 20분',
]) test('ambiguous or partial capacity never becomes a hard limit: '+text,()=> {
  assert.equal(parseGoalCapacity(text).status,'unresolved')
  assert.match(goalFeasibilityIssue({weeklyActions:[{frequencyPerWeek:1,durationMinutes:10}],execution:{progressStrategy:'첫 주 시간을 기록하고 다음 주 다시 제안합니다.'}},seed(text)),/goal_capacity_unresolved/)
})
for(const [text,rate] of [
  ['월요일부터 금요일까지 매일 1편',5],['화요일부터 목요일까지 매일 1편',3],
  ['토요일부터 일요일까지 매일 1편',2],['월요일부터 월요일까지 매일 1편',1],
  ['월요일부터 금요일까지 매일 1편, 수요일 제외',4],
  ['1 article every Monday, Wednesday and Friday',3],
  ['1 article every Monday and Wednesday except Wednesday',1],
  ['이틀마다 1편',3.5],['1 article every other day',3.5],
  ['오늘부터 매일 1편',7],['연말까지 매일 1편',7],
]) test('daily range/list quantities: '+text,()=>assert.equal(parseGoalQuantity(text).perWeek,rate))
for(const day of ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']) {
  test('named recurring day: '+day,()=>assert.deepEqual(parseGoalCapacity('20 minutes every '+day).weeklyMinutes,{min:20,max:20}))
}
for(const text of ['20 minutes every other day','20 minutes every 2 days','20 minutes every Monday, Wednesday and Friday']) {
  for(const wide of [false,true]) test('capacity capture and parser agree on evidence length: '+text+' / '+wide,()=> {
    const source='I can spend '+text+'.',evidence=wide?source:text
    const next=updateGoalBrief(seed(),{capacity:{summary:text,evidence,status:'known'}},source)
    assert.equal(next.capacity.summary,text)
    assert.equal(parseGoalCapacity(next.capacity.summary).status,'bounded')
  })
}
for(const source of ['I currently study 20 minutes every 2 days.','I completed 20 minutes every Monday.']) {
  test('execution history alone still does not establish available time: '+source,()=> {
    assert.throws(()=>updateGoalBrief(seed(),{capacity:{summary:source,evidence:source,status:'known'}},source),/capacity_requires/)
  })
}
for(const [source,evidence] of [
  ['I currently study 20 minutes every 2 days.','20 minutes every 2 days'],
  ['I completed 20 minutes every Monday.','20 minutes every Monday'],
  ['I currently read 20 minutes per week.','20 minutes per week'],
]) test('narrow evidence cannot hide execution history: '+source,()=> {
  assert.throws(()=>updateGoalBrief(seed(),{capacity:{summary:evidence,evidence,status:'known'}},source),/capacity_requires/)
})
for(const time of ['1½ hours per week','평일 하루 10분, 주말 하루 20분 가능해.']) test('real agent blocks over-budget draft and preserves committed state: '+time,async()=> {
  const brief=seed(time),state=loadState({stage:5,agent_v2_context:{brief},messages:[{role:'user',text:'writing: 8 weeks, 1 article per week, target 8 articles. '+time}]})
  const proposal=(f,minutes)=>({category:'writing',outcome:'8 articles',identity:'',cue:'',environment:'',deadline:'',baselineMetric:'1 article per week',targetMetric:'8 articles',durationWeeks:8,
    measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,progressStrategy:'첫 주 시간을 기록하고 다음 주 다시 제안합니다.',
    actions:[{title:'Draft an article',frequencyPerWeek:f,durationMinutes:minutes,preferredDays:[],planningStyle:'repeat',completionCriterion:'Save a draft and a revision note',minimumAction:'Open the draft',minimumMinutes:1,goalResult:'8 articles',steps:['Open the draft','Write and save a revision note']}]})
  let calls=0
  const result=await runAgentTurn(state,'지금 말한 시간을 기준으로 초안을 만들어줘.',{today:'2026-09-16',now:'2026년 9월 16일',request:async body=> {
    assert.ok(++calls<=4,JSON.stringify(body.input.filter(item=>item.type==='function_call_output').map(item=>JSON.parse(item.output).error)))
    const route=!body.tools.some(tool=>tool.name==='respond')
    const rejected=body.input.filter(item=>item.type==='function_call_output').some(item=>/goal_capacity_conflict/.test(JSON.parse(item.output).error??''))
    const name=route?'route_request':'respond',args=route?{module:'goal',evidence:'지금 말한 시간을 기준으로 초안을 만들어줘.',reason:'Use recorded capacity.'}
      :{focus:'goals',goal_outcome:'8 articles',goal_draft:withCoachingDetails(proposal(rejected?3:7,rejected?10:15)),summary:'시작할 초안이에요.',details:[],question:'시작할까요?',choices:[]}
    return {id:'mock-'+calls,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:'call-'+calls,arguments:JSON.stringify(args)}]}
  }})
  assert.ok(result.events.some(event=>/goal_capacity_conflict/.test(event.result?.error??'')))
  assert.equal(result.state.agent_v2_context.draft.card.weeklyActions[0].frequencyPerWeek,3)
  assert.equal(result.state.agent_v2_context.draft.card.weeklyActions[0].durationMinutes,10)
  assert.deepEqual(result.state.goal_card,state.goal_card)
  assert.deepEqual(result.state.agent_v2_context.brief,brief)
})
