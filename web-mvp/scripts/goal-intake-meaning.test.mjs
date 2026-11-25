import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'
import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyBrief, updateGoalBrief, loadGoalBrief } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { goalFactIsAsserted, goalResultIsDecided } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalEvidenceScope.ts'
import { goalFeasibilityIsAccepted, periodUpdateIsExplicit, explicitAreaChange } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalIntakeEvidence.ts'
import { parseGoalCapacity } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import { parseGoalQuantity, assessGoalFeasibility, nextGoalIntakeStep, goalFeasibilityIssue } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import { loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'

const seed = (summary='1 hour per week',result='32 articles')=>({...emptyBrief(),period:{label:'8 weeks',weeks:8},areas:['writing'],
  baselines:[{area:'writing',current:'1 article per week',evidence:'1 article per week',status:'known'}],
  objectives:[{area:'writing',result,evidence:result,resultKind:'metric'}],capacity:{summary,evidence:summary,status:'known'}})
const card=minutes=>({weeklyActions:[{frequencyPerWeek:1,durationMinutes:minutes}],execution:{progressStrategy:'첫 주 실제 시간을 기록하고 다음 주 다시 제안합니다.'}})

for(const [text,value,expected] of [
  ['책 6권까지 읽겠다는 뜻은 아니었어. 기존 목표를 유지해줘.','책 6권',false],
  ['책 6권을 읽겠다는 의미는 아니에요.','책 6권',false],
  ['책 6권을 읽겠다는 뜻이야.','책 6권',true],
  ['책 6권은 아니고 책 3권으로 할게.','책 6권',false],
  ['책 6권은 아니고 책 3권으로 할게.','책 3권',true],
  ['I am not committing to 6 books.','6 books',false],
  ['I am committing to 6 books.','6 books',true],
  ['I am not choosing 6 books.','6 books',false],
  ['I am choosing 6 books.','6 books',true],
  ['I only have 30 minutes per week, not 2 hours per week.','2 hours per week',false],
  ['I only have 30 minutes per week, not 2 hours per week.','30 minutes per week',true],
  ['Not 2 hours per week, but 30 minutes per week.','2 hours per week',false],
  ['Not 2 hours per week, but 30 minutes per week.','30 minutes per week',true],
  ['무리하지 않고 4편 완성으로 줄일게.','4편 완성',true],
  ['목표를 8주 동안 진행할게.','8주',true],
]) for(const evidence of [...new Set([value,text])]) test('candidate polarity: '+text+' / '+evidence,()=>assert.equal(goalFactIsAsserted(text,evidence,value),expected))

for(const role of ['남편','강사','멘토','선생님']) for(const reverse of [false,true]) {
  const text=reverse?`나는 책 2권이고 ${role}는 책 5권이야.`:`${role}는 책 5권이고 나는 책 2권이야.`
  for(const evidence of ['책 2권',text]) test('subject association: '+text+' / '+evidence,()=> {
    assert.equal(goalFactIsAsserted(text,evidence,'책 2권'),true)
    assert.equal(goalFactIsAsserted(text,text,'책 5권'),false)
  })
}
for(const role of ['mentor','instructor','partner','teacher']) for(const reverse of [false,true]) {
  const text=reverse?`I have 2 books and my ${role} has 5 books.`:`My ${role} has 5 books while I have 2 books.`
  for(const evidence of ['2 books',text]) test('English subject association: '+text+' / '+evidence,()=> {
    assert.equal(goalFactIsAsserted(text,evidence,'2 books'),true)
    assert.equal(goalFactIsAsserted(text,text,'5 books'),false)
  })
}
for(const text of [
  '기간을 12주로 늘릴게, 야근이 끝나면.', '야근이 끝나면 기간을 12주로 늘릴게.',
  'Change the period to 12 weeks only after my shifts settle down.',
  'After my shifts settle down, change the period to 12 weeks.',
  'Extend the period to 12 weeks when my shifts settle down.',
]) test('condition placement: '+text,()=> {
  const evidence=text.includes('12주')?'12주':'12 weeks', brief=seed(), before=structuredClone(brief)
  assert.equal(periodUpdateIsExplicit(text,evidence),false)
  assert.throws(()=>updateGoalBrief(brief,{period:{kind:'duration',evidence,normalized:evidence}},text),/period_not_decided|period_change/)
  assert.deepEqual(brief,before)
})
for(const text of ['Remove writing only after my work finishes.','Once my work finishes, remove writing.']) {
  test('removal conditions share the boundary: '+text,()=>assert.equal(explicitAreaChange('writing',text,['writing']),null))
}
for(const [text,expected] of [
  ["5 books sounds good, but don't set it yet.",false],
  ['I want 5 books. Please do not confirm that yet.',false],
  ["I decided on 5 books, but don't set the schedule yet.",true],
  ['책 5권으로 하고 싶어. 그건 아직 확정하지 마.',false],
  ['책 5권으로 정할게. 시간은 아직 확정하지 마.',true],
  ["I would like 5 books, but I haven't decided yet.",false],
  ["I chose 5 books, but I haven't decided the schedule yet.",true],
]) for(const evidence of [text.includes('책')?'책 5권':'5 books',text]) {
  test('connected hold vs different field: '+text+' / '+evidence,()=>assert.equal(goalResultIsDecided(text,evidence,text.includes('책')?'책 5권':'5 books'),expected))
}

for(const [text,expected] of [
  ['I understand the extra effort and choose to keep this target for the first week.',true],
  ['Keep this target for the first week.',true],['I want to try this goal.',true],
  ['높은 강도인 건 알아. 그래도 이대로 도전해 볼게.',true],
  ['Should I keep this target?',false],["I don't want to keep this target.",false],
  ['I am not willing to keep this target.',false],['If work settles, keep this target.',false],
  ['Keep this target only after work settles.',false],
  ['My mentor said keep this target.',false],
  ["Keep this target, but don't set it yet.",false],
  ['이대로 유지할까?',false],['이대로 유지하지 마.',false],
]) test('explicit bilingual feasibility consent: '+text,()=> {
  assert.equal(goalFeasibilityIsAccepted(text,text),expected)
  const brief=seed(), before=structuredClone(brief)
  if(expected) {
    const after=updateGoalBrief(brief,{feasibility_acceptance:{evidence:text}},text)
    assert.equal(after.feasibilityAcceptance.evidence,text)
    assert.equal(nextGoalIntakeStep(after,null),null)
    assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(after))),after)
  } else assert.throws(()=>updateGoalBrief(brief,{feasibility_acceptance:{evidence:text}},text),/feasibility_acceptance_requires/)
  assert.deepEqual(brief,before)
})
test('consent does not bypass zero time or positive capacity limits',()=> {
  const text='I choose to keep this target for the first week.'
  const zero=updateGoalBrief(seed('0 minutes per week'),{feasibility_acceptance:{evidence:text}},text)
  assert.equal(nextGoalIntakeStep(zero,null),'feasibility')
  assert.match(goalFeasibilityIssue(card(10),zero),/goal_capacity_conflict/)
  const limited=updateGoalBrief(seed('20 minutes per week'),{feasibility_acceptance:{evidence:text}},text)
  assert.match(goalFeasibilityIssue(card(30),limited),/goal_capacity_conflict/)
})

for(const [text,rate] of [
  ['매일 1편, 주말은 제외',5],['주말을 제외하고 매일 1편',5],['평일 매일 1편',5],['주말 매일 1편',2],
  ['매일 1편, 월요일과 목요일은 제외',5],['평일 매일 1편, 월요일 제외',4],
  ['1 article per day except Saturday and Sunday',5],['1 article daily except weekends',5],
  ['1 article daily excluding weekdays',2],['1 article each weekday except Monday',4],
  ['1 article per day except on Sunday',6],['📚 1 article daily except weekends',5],
  ['주말 제외, 주당 5편',5],['5 articles per week except weekends',5],
]) test('inclusion minus exclusion: '+text,()=>assert.equal(parseGoalQuantity(text)?.perWeek,rate))
for(const text of ['1 article daily except holidays','1 article daily except Saturday and holidays',
  '1 article daily except Saturday, excluding holidays','매일 1편, 공휴일 제외',
  '평일 매일 1편, 평일 제외','1 article each weekday and weekend day','1 article daily on Monday-Friday']) {
  test('unresolved day set cannot become an exact daily rate: '+text,()=>assert.equal(parseGoalQuantity(text),null))
}

for(const [text,min,max,count,perSession] of [
  ['주당 1시간 30분 가능해.',90,90,null,null],['1 hour and 30 minutes per week',90,90,null,null],
  ['주당 30분~1시간',30,60,null,null],['30 minutes to 1 hour per week',30,60,null,null],
  ['30 minutes - 1 hour per week',30,60,null,null],
  ['three 20-minute sessions per week',60,60,3,20],['three sessions of 20 minutes per week',60,60,3,20],
  ['two 1-hour sessions per week',120,120,2,60],['two half-hour sessions per week',60,60,2,30],
  ['half an hour per day',210,210,null,null],['half an hour per day except weekends',150,150,null,null],
  ['0 hours and 30 minutes per week',30,30,null,null],
  ['1 hour and thirty minutes per week',90,90,null,null],
]) test('composed duration bounds: '+text,()=> {
  const limits=parseGoalCapacity(text)
  assert.equal(limits.status,'bounded')
  assert.deepEqual(limits.weeklyMinutes,{min,max})
  assert.equal(limits.weeklySessions?.max??null,count)
  assert.equal(limits.perSessionMinutes?.max??null,perSession)
  const brief=seed(text,'8 articles')
  const daily = text.startsWith('half an hour per day')
  const valid=card(daily ? 30 : perSession??max)
  valid.weeklyActions[0].frequencyPerWeek=daily ? max / 30 : perSession?count:1
  assert.equal(goalFeasibilityIssue(valid,brief),null)
  if(perSession&&perSession<max) assert.match(goalFeasibilityIssue(card(max),brief),/goal_capacity_conflict/)
  assert.match(goalFeasibilityIssue(card(max+1),brief),/goal_capacity_conflict/)
})
test('Korean per-session marker is not an unconsumed session amount',()=> {
  assert.deepEqual(parseGoalCapacity('평일 주 3회, 회당 20분 가능'),{
    status:'bounded',weeklyMinutes:{min:60,max:60},weeklySessions:{min:3,max:3},perSessionMinutes:{min:20,max:20},
  })
  assert.equal(parseGoalCapacity('주 2회, 회당 1시간 30분').weeklyMinutes.max,180)
})
for(const text of ['1 hour 30 min per week',
  '1 hour or 30 minutes per week','1 hour - 30 minutes per week','주당 1시간~30분',
  '- 1 hour 30 minutes per week','1 hour and -30 minutes per week',
  '20 minutes per session weekly','20 minutes daily except holidays']) {
  test('partial/ambiguous duration does not manufacture a hard limit: '+text,()=> {
    assert.equal(parseGoalCapacity(text).status,'unresolved')
    const brief=seed(text,'8 articles')
    assert.equal(assessGoalFeasibility(brief).status,'needs_measurement')
    assert.equal(nextGoalIntakeStep(brief,null),'capacity')
    assert.match(goalFeasibilityIssue(card(10),brief),/goal_capacity_unresolved/)
  })
}

test('real agent keeps confirmed state and surfaces only a within-budget replacement draft',async()=> {
  const brief=seed('주당 1시간 30분 가능해.','8 articles')
  const state=loadState({stage:5,agent_v2_context:{brief},messages:[{role:'user',text:'writing 목표는 8주 8 articles야. 현재 1 article per week이고 주당 1시간 30분 가능해.'}]})
  const proposal=f=>({category:'writing',outcome:'8 articles',identity:'',cue:'',environment:'',deadline:'',baselineMetric:'1 article per week',targetMetric:'8 articles',durationWeeks:8,
    measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,progressStrategy:'첫 주 시간을 기록하고 다음 주 다시 제안합니다.',
    actions:[{title:'Draft and review an article',frequencyPerWeek:f,durationMinutes:15,preferredDays:[],planningStyle:'repeat',completionCriterion:'Save a draft with one revision note',minimumAction:'Open the draft',minimumMinutes:1,goalResult:'8 articles',steps:['Open the draft','Draft and save a revision note']}]})
  let calls=0
  const result=await runAgentTurn(state,'지금 말한 시간을 기준으로 초안을 만들어줘.',{today:'2026-09-16',now:'2026년 9월 16일',request:async body=> {
    assert.ok(++calls<=4)
    const route=!body.tools.some(tool=>tool.name==='respond')
    const rejected=body.input.filter(item=>item.type==='function_call_output').some(item=>/goal_capacity_conflict/.test(JSON.parse(item.output).error??''))
    const name=route?'route_request':'respond'
    const args=route?{module:'goal',evidence:'지금 말한 시간을 기준으로 초안을 만들어줘.',reason:'Use recorded capacity.'}
      :{focus:'goals',goal_outcome:'8 articles',goal_draft:withCoachingDetails(proposal(rejected?3:7)),summary:'시작할 초안이에요.',details:[],question:'시작할까요?',choices:[]}
    return {id:'mock-'+calls,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:'call-'+calls,arguments:JSON.stringify(args)}]}
  }})
  assert.ok(result.events.some(event=>/goal_capacity_conflict/.test(event.result?.error??'')))
  assert.equal(result.state.agent_v2_context.draft.card.weeklyActions[0].frequencyPerWeek,3)
  assert.deepEqual(result.state.goal_card,state.goal_card)
  assert.deepEqual(result.state.agent_v2_context.brief,brief)
})
