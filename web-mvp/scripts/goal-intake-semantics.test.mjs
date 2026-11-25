import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyBrief, updateGoalBrief, loadGoalBrief } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { explicitlyUnknownGoalEvidence, capacityEvidenceMatches, explicitAreaChange, periodUpdateIsExplicit } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalIntakeEvidence.ts'
import { goalEvidenceContext, goalFactCanReplace, goalResultIsDecided } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalEvidenceScope.ts'
import { parseGoalQuantity } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalQuantity.ts'
import { loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'

const seed=()=>({...emptyBrief(),period:{label:'8 weeks',weeks:8},areas:['reading','coding'],
  baselines:[{area:'reading',current:'1 book',status:'known',evidence:'1 book'},{area:'coding',current:'1 project',status:'known',evidence:'1 project'}],
  objectives:[{area:'reading',result:'3 books',evidence:'3 books',resultKind:'metric'},{area:'coding',result:'2 projects',evidence:'2 projects',resultKind:'metric'}],
  capacity:{summary:'1 hour per week',evidence:'1 hour per week',status:'known'},
  priority:{mode:'ranked',primaryArea:'coding',flexibleAreas:['reading'],evidence:'coding first'}})
const cases=[
  ['baseline',{baselines:[{area:'reading',current:'0 books',evidence:'0 books',status:'known'}]},'0 books',/baseline_change_requires/],
  ['result',{objectives:[{area:'reading',result:'6 books',evidence:'6 books',result_kind:'metric'}]},'6 books',/result_change_requires/],
  ['capacity',{capacity:{summary:'2 hours per week',evidence:'2 hours per week',status:'known'}},'2 hours per week',/capacity_change_requires/],
  ['priority',{priority:{mode:'ranked',primary_area:'reading',flexible_areas:['coding'],evidence:'reading first'}},'reading first',/priority_change_requires/],
]
for(const [name,candidate,evidence,error] of cases) {
  test('old '+name+' cannot overwrite a stored current fact',()=> {
    const before=seed(), copy=structuredClone(before)
    assert.throws(()=>updateGoalBrief(before,candidate,'Keep the current plan.',[evidence]),error)
    assert.deepEqual(before,copy)
  })
  test('explicit current '+name+' correction remains allowed',()=> {
    const result=updateGoalBrief(seed(),candidate,'Use '+evidence+' now.')
    assert.deepEqual(loadGoalBrief(JSON.parse(JSON.stringify(result))),result)
  })
}
test('old evidence can fill an empty fact, but need not be restated to replay an unchanged fact',()=> {
  const blank={...seed(),baselines:[]}
  const old={area:'reading',current:'1 book',evidence:'1 book',status:'known'}
  assert.equal(updateGoalBrief(blank,{baselines:[old]},'Continue.',['1 book']).baselines[0].current,'1 book')
  assert.deepEqual(updateGoalBrief(seed(),{baselines:[old]},'Continue.',['1 book']),seed())
})
test('quoting the old number beside the present does not make it new evidence',()=> {
  assert.equal(goalFactCanReplace(true,false,'0 books','Previously I had 0 books. Now I have 1 book.'),false)
  assert.equal(goalFactCanReplace(true,false,'1 book','Previously I had 0 books. Now I have 1 book.'),true)
})
for(const [text,evidence] of [
  ['목표는 책 4권 완독으로 줄일게. 주말은 쉬어도 될까?','책 4권 완독'],
  ['I will finish 4 books. Can I rest on weekends?','4 books'],
  ['I will finish 4 books, and can I rest on weekends?','4 books'],
])test('a separate question does not unconfirm the goal: '+text,()=>assert.equal(goalResultIsDecided(text,evidence),true))
for(const text of ['책 4권 완독이면 좋을까?','Would 4 books be enough?','Maybe 4 books.','I do not want 4 books.']) {
  test('candidate/negative result is not a decision: '+text,()=>assert.equal(goalResultIsDecided(text,text.includes('책')?'책 4권 완독':'4 books'),false))
}
test('decimal quantities stay inside the same evidence clause',()=> {
  assert.equal(goalEvidenceContext('I want 1.5 hours. Can you help?','1.5 hours'),'I want 1.5 hours.')
})
for(const text of ['작년에 측정한 점수는 65점이었고, 지금 수준은 모르겠어.','작년에 측정한 점수는 65점이었고지금 수준은 모르겠어.','Previously my score is 65. Now I do not know my level.']) {
  test('historical measurement does not negate present uncertainty: '+text,()=>assert.equal(explicitlyUnknownGoalEvidence(text),true))
}
for(const text of ['측정한 점수는 65점이야. 목표는 모르겠어.','My score is 65. I do not know the target.','I am not a beginner.']) {
  test('current known measurement/negated novice remain protected: '+text,()=>assert.equal(explicitlyUnknownGoalEvidence(text),false))
}
for(const text of ['내 주간 운동 기록은 하루 몇 번 했는지 아직 모르겠어.','I have never tracked how many times I exercise per week.','I currently read 1 book per week.']) {
  test('execution history is not available time: '+text,()=>assert.equal(capacityEvidenceMatches(text,true),false))
}
for(const text of ['현재 점수는 60점이야. 주당 1시간 가능해.','I have completed 1 project. I can spend 30 minutes per week.','Some weeks I have two 15-minute windows.']) {
  test('independent availability is still accepted: '+text,()=>assert.equal(capacityEvidenceMatches(text,false),true))
}
for(const [text,target,expected,areas] of [
  ['영어와 독서를 제외해줘.','영어','remove',['영어','독서','일']],
  ['영어와 독서를 제외해줘.','독서','remove',['영어','독서','일']],
  ['독서는 남기고 영어는 제외해줘.','영어','remove',['영어','독서']],
  ['독서는 남기고 영어는 제외해줘.','독서',null,['영어','독서']],
  ['Keep reading and remove coding.','coding','remove',['reading','coding']],
  ['Keep reading and remove coding.','reading',null,['reading','coding']],
  ['Remove reading and coding.','coding','remove',['reading','coding']],
  ["Keep reading and don't remove coding.",'coding',null,['reading','coding']],
  ['Keep reading and remove reading.','reading',null,['reading']],
  ["Don't restore reading.",'reading',null,['reading']],
  ['독서는 복원하지 마.','독서',null,['독서']],
  ['Restore reading and coding.','reading','restore',['reading','coding']],
  ['My friend said remove reading.','reading',null,['reading']],
]) test('action-target scope: '+text+' / '+target,()=>assert.equal(explicitAreaChange(target,text,areas),expected))
for(const [text,evidence] of [['그러면 6주로 늘릴게.','6주'],['Move the deadline to November 30, 2026.','November 30, 2026'],['Postpone the deadline to November 30, 2026.','November 30, 2026']]) {
  test('period mutation intent: '+text,()=>assert.equal(periodUpdateIsExplicit(text,evidence),true))
}
for(const [text,evidence] of [["Don't move the deadline to November 30, 2026.",'November 30, 2026'],['6주로 늘리지 마.','6주'],['Maybe move the deadline to November 30, 2026.','November 30, 2026'],['Keep 8 weeks. Change the project title.','8 weeks']]) {
  test('non-decisions cannot change the period: '+text,()=>assert.equal(periodUpdateIsExplicit(text,evidence),false))
}
for(const [text,value,unit,perWeek] of [
  ['2 articles every 2 weeks',2,'편',1],['two articles every two weeks',2,'편',1],['2주마다 2편',2,'편',1],
  ['격주 2편',2,'편',1],['2 articles every other week',2,'편',1],['한 달에 1편',1,'편',1/(52/12)],
  ['4 articles per 2 months',4,'편',4/(2*52/12)],['2 pages every 2 days',2,'쪽',7],
])test('numeric frequency interval: '+text,()=>assert.deepEqual(parseGoalQuantity(text),{value,unit,perWeek}))
for(const text of ['2 articles every 0 weeks','2 articles every 2 weeks or every 3 weeks','2 articles every 2-3 weeks','2 articles every -2 weeks','−2주마다 2편','0주마다 2편']) {
  test('invalid/ambiguous interval does not become a cumulative quantity: '+text,()=>assert.equal(parseGoalQuantity(text),null))
}
test('agent discards stale baseline but accepts current capacity in the same turn',async()=> {
  const brief={...seed(),areas:['reading'],objectives:seed().objectives.filter(x=>x.area==='reading'),baselines:seed().baselines.filter(x=>x.area==='reading'),capacity:null,priority:null}
  // Keep objective missing so this fixture tests capture rather than inventing a full plan.
  brief.objectives=[]
  const text='I have 1 book done now. I can spend 30 minutes per week.'
  const state=loadState({stage:5,messages:[{role:'user',text:'0 books'},{role:'user',text:'1 book'}],agent_v2_context:{brief}})
  let captured=false,requests=0
  const result=await runAgentTurn(state,text,{now:'September 16, 2026',today:'2026-09-16',regionalContext:{locale:'en-US',countryCode:'US',timeZone:'America/New_York',currencyCode:'USD',weekStartsOn:0},request:async body=> {
    assert.ok(++requests<=2)
    const route=!body.tools.some(tool=>tool.name==='record_goal_brief'), name=route?'route_request':'record_goal_brief'
    if(!route){assert.equal(captured,false);captured=true}
    const args=route?{module:'goal',evidence:text}:{period:null,areas:[],area_changes:[],baselines:[{area:'reading',current:'0 books',evidence:'0 books',status:'known'}],objectives:[],priority:null,
      capacity:{summary:'30 minutes per week',evidence:'I can spend 30 minutes per week.',status:'known'},feasibility_acceptance:null,
      reply:{paragraphs:['We can use the time you mentioned.'],bullets:[],question:'What outcome would count as success?',choices:[]}}
    return {id:'fixture-'+requests,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:'fixture-'+requests,arguments:JSON.stringify(args)}]}
  }})
  assert.equal(result.state.agent_v2_context.brief.baselines[0].current,'1 book')
  assert.equal(result.state.agent_v2_context.brief.capacity.summary,'30 minutes per week')
})
