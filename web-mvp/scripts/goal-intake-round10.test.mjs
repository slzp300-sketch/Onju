import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'
import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {analyzeGoalCapacity,parseGoalCapacity} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import {emptyBrief,updateGoalBrief,loadGoalBrief} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import {capacityContractLimits} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacityContract.ts'
import {goalFeasibilityIssue,parseGoalQuantity} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import {loadState,runAgentTurn} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'

const strategy='첫 주 실제 시간을 기록하고 다음 주 실행량을 다시 제안합니다.'
const seed=(text='1 hour per week')=>({...emptyBrief(),period:{label:'8 weeks',weeks:8},areas:['writing'],
  baselines:[{area:'writing',current:'1 project',evidence:'1 project',status:'known'}],
  objectives:[{area:'writing',result:'4 projects',evidence:'4 projects',resultKind:'metric'}],
  capacity:{summary:text,evidence:text,status:'known'}})
const card=(minutes=1,days=[0])=>({weeklyActions:[{durationMinutes:minutes,frequencyPerWeek:days.length,preferredDays:days}],execution:{progressStrategy:strategy}})
const capture=(summary,evidence=summary,source=evidence)=>updateGoalBrief(seed(),{capacity:{summary,evidence,status:'known'}},source)
const reload=value=>loadGoalBrief(JSON.parse(JSON.stringify(value)))

// Support new notations through capture, serialization and execution, not just
// a parser match. Numeric display summaries cannot replace original constraints.
for(const [word,n] of [['thirteen',13],['nineteen',19],['twenty',20],['twenty-five',25],['twenty‑five',25],['twenty‐five',25],['twenty five',25],['THIRTY',30],['forty-two',42],['ninety-nine',99],
  ['스무',20],['스물한',21],['스물 세',23],['서른',30],['마흔두',42],['쉰',50],['예순',60],['일흔',70],['여든',80],['아흔아홉',99]]) {
  const text=/[가-힣]/.test(word)?`일주일에 ${word} 분`:`${word} minutes per week`
  test('whole written capacity is grounded and preserved: '+text,()=>{
    const parsed=parseGoalCapacity(text)
    assert.equal(parsed.status,'bounded')
    assert.deepEqual(parsed.weeklyMinutes,{min:n,max:n})
    const state=capture(`${n} minutes per week`,text)
    for(const saved of [state,reload(state)]) {
      assert.equal(saved.capacity.evidence,text)
      assert.ok(saved.capacity.contract.source.includes(word))
      assert.equal(capacityContractLimits(saved.capacity).weeklyMinutes.max,n)
      assert.equal(goalFeasibilityIssue(card(n),saved),null)
      assert.match(goalFeasibilityIssue(card(n+1),saved),/goal_capacity_conflict/)
    }
  })
}
for(const text of ['one hundred minutes per week','twenty twenty-five minutes per week','negative thirty minutes per week',
  'minus forty-two minutes per week','twenty and five minutes per week','twenty one and a quarter of an hour per week',
  '1 hour and thirty min per week','주당 스무한 분','주당 백 서른 분','주당 마이너스 서른 분','주당 서른 서른 분',
  'thirty minutes','서른 분','1/3 hour per week','negative 30 minutes per week','negative ½ hour per week',
  'twenty–five minutes per week','twenty—five minutes per week','twenty through thirty minutes per week',
  'twenty to 30 minutes per week','주당 스무~서른 분'])test('unsupported compound is not partially consumed: '+text,()=>{
  assert.equal(parseGoalCapacity(text).status,'unresolved')
  assert.match(goalFeasibilityIssue(card(),seed(text)),/goal_capacity_unresolved/)
})
for(const text of ['twenty to thirty minutes per week','twenty–thirty minutes per week','twenty minutes to thirty minutes per week'])test('complete written range retains both endpoints: '+text,()=>{
  assert.deepEqual(parseGoalCapacity(text).weeklyMinutes,{min:20,max:30})
  const state=capture('20 to 30 minutes per week',text)
  assert.deepEqual(capacityContractLimits(reload(state).capacity).weeklyMinutes,{min:20,max:30})
  assert.equal(goalFeasibilityIssue(card(30),state),null)
  assert.match(goalFeasibilityIssue(card(31),state),/goal_capacity_conflict/)
})
test('capacity normalization does not reinterpret outcome units',()=>assert.equal(parseGoalQuantity('twenty one books'),null))
for(const source of ['My friend has thirty minutes per week.','In two weeks, I can spend thirty minutes per week.',
  'I cannot spend thirty minutes per week.','우리 가족 전체는 일주일에 서른 분 가능해.'])test('new words retain ownership/time authority: '+source,()=>{
  const before=seed(),snapshot=structuredClone(before)
  assert.throws(()=>updateGoalBrief(before,{capacity:{summary:'30 minutes per week',evidence:source,status:'known'}},source),/capacity_|no_grounded/)
  assert.deepEqual(before,snapshot)
})

for(const ko of [true,false])for(const weekday of [1,2,3])for(const weekend of [1,2])for(const reversed of [false,true]) {
  const fragments=ko?[`평일 하루 ${weekday}회`,`주말 하루 ${weekend}회`]:[`${weekday} sessions each weekday`,`${weekend} sessions each weekend day`]
  const source=(reversed?fragments.reverse():fragments).join('; '),total=weekday*5+weekend*2
  test('disjoint counts preserve per-day bounds without inventing minutes: '+source,()=>{
    const state=capture(`${total} sessions per week`,source)
    for(const saved of [state,reload(state)]) {
      const limits=capacityContractLimits(saved.capacity)
      assert.deepEqual(limits.dailySessions,[weekday,weekday,weekday,weekday,weekday,weekend,weekend])
      assert.deepEqual(limits.weeklySessions,{min:total,max:total})
      assert.equal(limits.weeklyMinutes,null)
      assert.equal(limits.dailyMinutes,undefined)
      assert.equal(limits.perSessionMinutes,null)
      // A count-only limit says nothing about session length.
      assert.equal(goalFeasibilityIssue(card(30,[0]),saved),null)
      const excess=card();excess.weeklyActions=Array.from({length:weekday+1},()=>card(1,[0]).weeklyActions[0])
      assert.match(goalFeasibilityIssue(excess,saved),/goal_capacity_conflict/)
    }
  })
}
for(const text of ['평일 하루 한 번; 주말 하루 두 번','one session each weekday; two sessions each weekend day'])test('written daily counts: '+text,()=>{
  assert.deepEqual(analyzeGoalCapacity(text).dailySessions,[1,1,1,1,1,2,2])
})
for(const text of ['평일 매일 10분; 평일 매일 20분','평일 하루 1회; 주말 하루 20분',
  'one session each weekday or two sessions each weekend day',
  '평일 하루 1회 각 10분; 주말 하루 1회 각 20분'])test('overlapping/alternative or incompatible budgets remain unresolved: '+text,()=>{
  assert.equal(parseGoalCapacity(text).status,'unresolved')
})

const en=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],ko=['월','화','수','목','금','토','일']
for(let day=0;day<7;day++)for(const language of ['ko','en'])for(const reversed of [false,true]) {
  const fragments=language==='ko'?['매일 15분',`${ko[day]}요일은 0분`]:['15 minutes daily',`${en[day]}s 0 minutes`]
  const source=(reversed?fragments.reverse():fragments).join('; ')
  test('zero exception survives order and reload: '+source,()=>{
    const expected=Array.from({length:7},(_,index)=>index===day?0:15)
    const state=capture('90 minutes per week',source)
    for(const saved of [state,reload(state)]) {
      const limits=capacityContractLimits(saved.capacity)
      assert.deepEqual(limits.dailyMinutes,expected)
      assert.deepEqual(limits.weeklyMinutes,{min:90,max:90})
      assert.match(goalFeasibilityIssue(card(1,[day]),saved),/goal_capacity_conflict/)
      assert.equal(goalFeasibilityIssue(card(15,[(day+1)%7]),saved),null)
    }
  })
}
for(let day=0;day<7;day++)for(const relation of ['except','excluding','but not'])test('plural named exception: '+relation+' '+en[day],()=>{
  const source=`15 minutes daily ${relation} ${en[day]}s`
  const limits=analyzeGoalCapacity(source)
  assert.deepEqual(limits.dailyMinutes,Array.from({length:7},(_,i)=>i===day?0:15))
  assert.equal(limits.weeklyMinutes.max,90)
})
for(const mode of ['every','each'])for(let day=0;day<7;day++)test('plural named inclusion: '+mode+' '+en[day],()=>{
  const limits=analyzeGoalCapacity(`15 minutes ${mode} ${en[day]}s`)
  assert.equal(limits.weeklyMinutes?.max,15)
  assert.deepEqual(limits.dailyMinutes,Array.from({length:7},(_,i)=>i===day?15:0))
})
for(const text of ['15 minutes daily; Wednesdays zero minutes','매일 15분; 수요일과 금요일은 0분',
  '15 minutes daily; Wednesday and Friday are 0 minutes','매일 1회; 수요일은 0회',
  '매일 2회 각 15분; 수요일은 0분'])test('zero exceptions across units and multiple days: '+text,()=>{
  const limits=analyzeGoalCapacity(text)
  assert.equal(limits.status,'bounded')
  assert.equal((limits.dailyMinutes??limits.dailySessions)[2],0)
  if(/금요일|Friday/.test(text))assert.equal(limits.dailyMinutes[4],0)
  if(/각/.test(text)) {
    assert.equal(limits.weeklySessions.max,12)
    assert.equal(limits.weeklyMinutes.max,180)
  }
})
test('all days explicitly unavailable is zero, not unlimited',()=>{
  const limits=analyzeGoalCapacity('매일 15분; 평일은 0분; 주말은 0분')
  assert.equal(limits.weeklyMinutes?.max,0)
  assert.deepEqual(limits.dailyMinutes,Array(7).fill(0))
})
for(const text of ['15 minutes daily; Wednesdays 0 minutes IF work is busy',
  '15 minutes daily; MAYBE Wednesdays 0 minutes','15 minutes daily; NOT Wednesdays 0 minutes',
  '매일 15분; 수요일은 0분이 아니야','15 minutes daily except holidays','15 minutes daily except Wednesdays and holidays',
  '매일 15분; 수요일은 10분','15 to 20 minutes daily; Wednesdays 0 minutes',
  '100 minutes per week; Wednesdays 0 minutes','Wednesdays 0 minutes'])test('ambiguous/unsupported exception never silently disappears: '+text,()=>{
  assert.equal(parseGoalCapacity(text).status,'unresolved')
  assert.match(goalFeasibilityIssue(card(1,[2]),seed(text)),/goal_capacity_unresolved/)
})
test('legacy summary cannot conceal an unsupported exception',()=>{
  const state=seed('105 minutes per week');state.capacity.evidence='15 minutes daily except holidays'
  assert.match(goalFeasibilityIssue(card(),reload(state)),/goal_capacity_unresolved/)
})

// Real handler with zero-token deterministic provider fixture: wrong-day draft
// must be rejected at the same boundary used by actual provider responses.
for(const source of ['매일 20분; 수요일은 0분','20 minutes daily except Wednesdays'])test('agent enforces original day restriction before surfacing draft: '+source,async()=>{
  const brief=capture('120 minutes per week',source)
  const state=loadState({stage:5,agent_v2_context:{brief},messages:[{role:'user',text:source}]}),before=structuredClone(state)
  let calls=0
  const proposal=day=>({category:'writing',outcome:'4 projects',identity:'',cue:'',environment:'',deadline:'',baselineMetric:'1 project',targetMetric:'4 projects',durationWeeks:8,
    measurement:'custom_outcome',completionPercent:null,reviewEveryWeeks:1,progressStrategy:strategy,
    actions:[{title:'Draft a project',frequencyPerWeek:1,durationMinutes:10,preferredDays:[day],planningStyle:'repeat',completionCriterion:'Save a draft and one revision note',minimumAction:'Open the draft',minimumMinutes:1,goalResult:'4 projects',steps:['Open the draft','Write and save one revision note']}]})
  const message='지금 말한 시간을 기준으로 초안을 만들어줘.'
  const result=await runAgentTurn(state,message,{today:'2026-09-16',now:'2026년 9월 16일',request:async body=>{
    assert.ok(++calls<=4)
    const route=!body.tools.some(tool=>tool.name==='respond')
    const rejected=body.input.filter(item=>item.type==='function_call_output').some(item=>/goal_capacity_conflict/.test(JSON.parse(item.output).error??''))
    const name=route?'route_request':'respond',args=route?{module:'goal',evidence:message,reason:'Use recorded capacity.'}
      :{focus:'goals',goal_outcome:'4 projects',goal_draft:withCoachingDetails(proposal(rejected?0:2)),summary:'초안이에요.',details:[],question:'시작할까요?',choices:[]}
    return {id:'mock-'+calls,model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name,call_id:'call-'+calls,arguments:JSON.stringify(args)}]}
  }})
  assert.ok(result.events.some(event=>/goal_capacity_conflict/.test(event.result?.error??'')))
  assert.deepEqual(result.state.agent_v2_context.draft.card.weeklyActions[0].preferredDays,[0])
  assert.deepEqual(result.state.goal_card,before.goal_card)
  assert.deepEqual(result.state.agent_v2_context.brief,before.agent_v2_context.brief)
  assert.deepEqual(state,before)
})
