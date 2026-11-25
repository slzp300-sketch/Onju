import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyBrief,updateGoalBrief,loadGoalBrief,goalBriefDecisionView} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import {analyzeGoalCapacity} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import {capacityContractLimits} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacityContract.ts'
import {goalBudgetScope} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBudgetScope.ts'
import {assessGoalFeasibility,goalFeasibilityIssue} from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'

const base=(areas=['writing'])=>({...emptyBrief(),period:{label:'8 weeks',weeks:8},areas,
  baselines:areas.map(area=>({area,current:'1 project',evidence:'1 project',status:'known'})),
  objectives:areas.map(area=>({area,result:'8 projects',evidence:'8 projects',resultKind:'metric'})),
  priority:areas.length>1?{mode:'equal',primaryArea:'',flexibleAreas:[],evidence:'Both goals have equal priority.'}:null,
  capacity:{summary:'1 hour per week',evidence:'1 hour per week',status:'known'}})
const card=(minutes,days=[0])=>({weeklyActions:[{title:'Practice',durationMinutes:minutes,frequencyPerWeek:days.length,preferredDays:days}],execution:{progressStrategy:'첫 주 실제 완료량과 시간을 기록해 다음 주 실행량을 다시 제안합니다.'}})
const cap=(summary,evidence=summary)=>({capacity:{summary,evidence,status:'known'}})
const baseline=(area,current,evidence)=>({baselines:[{area,current,evidence,status:'known'}]})
const reload=x=>loadGoalBrief(JSON.parse(JSON.stringify(x)))
const permutations=items=>items.length?items.flatMap((item,index)=>permutations(items.filter((_,i)=>i!==index)).map(rest=>[item,...rest])):[[]]

// New metamorphic tests, independent of the frozen round-11 diagnosis inputs.
for(const n of [7,25])for(const abbreviation of ['Mon','Tue','Tues.','Wed','Thu','Thur.','Thurs','Fri','Sat','Sun']) {
  const index={Mon:0,Tue:1,'Tues.':1,Wed:2,Thu:3,'Thur.':3,Thurs:3,Fri:4,Sat:5,Sun:6}[abbreviation]
  const source=`${n} minutes every ${abbreviation}`
  test('short day remains a calendar constraint after capture: '+source,()=>{
    const saved=updateGoalBrief(base(),cap(`${n} minutes per week`,source),source)
    for(const brief of [saved,reload(saved)]) {
      assert.deepEqual(capacityContractLimits(brief.capacity).dailyMinutes,Array.from({length:7},(_,i)=>i===index?n:0))
      assert.equal(goalFeasibilityIssue(card(n,[index]),brief),null)
      assert.match(goalFeasibilityIssue(card(1,[(index+1)%7]),brief),/goal_capacity_conflict/)
      assert.ok(brief.capacity.contract.source.includes(abbreviation))
    }
  })
}
for(const source of ['13 minutes every Tue, Thu, and Sat','매주 화·목·토에 13분씩 가능해.','매주 화/목/토에 13분씩 가능해.']) {
  test('day list, not aggregate-only weekly time: '+source,()=>{
    const before=base(),snapshot=structuredClone(before)
    const saved=updateGoalBrief(before,cap('39 minutes per week',source),source)
    assert.deepEqual(capacityContractLimits(reload(saved).capacity).dailyMinutes,[0,13,0,13,0,13,0])
    assert.equal(goalFeasibilityIssue(card(13,[1,3,5]),saved),null)
    assert.match(goalFeasibilityIssue(card(13,[0]),saved),/goal_capacity_conflict/)
    assert.deepEqual(before,snapshot)
  })
}
for(const source of ['15 minutes every Mon-Fri','매주 월·수·공휴일에 15분','15 minutes every Mon, Wed, and holidays','15 minutes daily except Sun and holidays'])test('partial calendar never becomes unrestricted: '+source,()=>{
  assert.equal(analyzeGoalCapacity(source).status,'unresolved')
})
test('a narrative sun is not a Sunday restriction',()=>{
  assert.equal(analyzeGoalCapacity('15 minutes per week in the sun').weeklyMinutes.max,15)
  assert.equal(analyzeGoalCapacity('15 minutes per week in the sun').dailyMinutes,undefined)
})

for(const ko of [false,true])for(const done of [2,4])for(const rest of [1,3])for(const reverse of [false,true]) {
  const phrases=ko?[`프로젝트 ${done}개를 완료했어.`,`프로젝트 ${rest}개는 남았어.`]:[`I completed ${done} projects.`,`I have ${rest} projects left to do.`]
  const source=(reverse?phrases.reverse():phrases).join(' '),value=n=>ko?`${n}개`:`${n} projects`
  test('completed and remaining are distinct roles: '+source,()=>{
    const before=base(),snapshot=structuredClone(before)
    assert.throws(()=>updateGoalBrief(before,baseline('writing',value(rest),source),source),/baseline_not_decided/)
    const saved=updateGoalBrief(before,baseline('writing',value(done),source),source)
    assert.equal(saved.baselines[0].binding.progress,'completed')
    assert.equal(assessGoalFeasibility(reload(saved)).gaps[0].remaining,8-done)
    const pending=ko?`${rest}개 남았어`:`${rest} projects left to do`
    const remaining=updateGoalBrief(before,baseline('writing',pending,source),source)
    assert.equal(remaining.baselines[0].binding.progress,'remaining')
    assert.deepEqual(assessGoalFeasibility(reload(remaining)).gaps,[])
    const tampered=structuredClone(remaining);tampered.baselines[0].binding.progress='completed'
    assert.deepEqual(assessGoalFeasibility(reload(tampered)).gaps,[])
    const legacy=base();legacy.baselines[0]={area:'writing',current:value(rest),evidence:source,status:'known'}
    assert.deepEqual(assessGoalFeasibility(reload(legacy)).gaps,[])
    assert.deepEqual(before,snapshot)
  })
}
test('same number in another goal cannot invalidate grounded completed progress',()=>{
  const source='writing: I completed 3 projects. coding: I have 3 projects remaining.'
  const saved=updateGoalBrief(base(['writing','coding']),baseline('writing','3 projects',source),source)
  assert.equal(saved.baselines.find(item=>item.area==='writing').binding.progress,'completed')
  assert.equal(assessGoalFeasibility(reload(saved)).gaps.find(gap=>gap.area==='writing').remaining,5)
})

for(const areas of [['design','coding'],['piano','guitar'],['그림','공예']])for(const n of [35,75])for(const shortQuote of [false,true]) {
  const source=`${areas[0]}: ${n} minutes per week only. ${areas[1]}: 10 minutes per week separately.`
  test('goal-scoped time cannot become personal overall time: '+JSON.stringify({areas,n,shortQuote}),()=>{
    const before=base(areas),snapshot=structuredClone(before),summary=`${n} minutes per week`
    assert.throws(()=>updateGoalBrief(before,cap(summary,shortQuote?summary:source),source),/capacity_scope_mismatch/)
    const legacy=base(areas);legacy.capacity={summary,evidence:source,status:'known'}
    assert.equal(capacityContractLimits(reload(legacy).capacity,areas).status,'unresolved')
    assert.match(goalFeasibilityIssue(card(1),reload(legacy)),/goal_capacity_unresolved/)
    assert.deepEqual(before,snapshot)
  })
}
for(const source of ['Across both goals combined, I have 45 minutes per week.','For all goals, my available time is 45 minutes per week.','두 목표 전체에 쓸 시간은 합쳐서 주당 45분이야.'])test('goal aggregation does not imply collective people: '+source,()=>{
  const saved=updateGoalBrief(base(['design','coding']),cap('45 minutes per week',source),source)
  assert.equal(saved.capacity.binding.budgetScope.owner,'personal_or_unspecified')
  assert.equal(saved.capacity.binding.budgetScope.allocation,'overall')
  assert.equal(capacityContractLimits(reload(saved).capacity,saved.areas).weeklyMinutes.max,45)
})
for(const source of ['Between the two of us, we have 45 minutes per week.','Our combined time is 45 minutes per week.','부부 합쳐서 주당 45분 가능해.'])test('people aggregation remains nonpersonal: '+source,()=>{
  assert.equal(goalBudgetScope(source,['design','coding']).owner,'collective')
  assert.throws(()=>updateGoalBrief(base(),cap('45 minutes per week',source),source),/capacity_not_decided/)
})
test('goal scope is revalidated when a formerly single-goal plan gains another goal',()=>{
  const source='For design only, I have 45 minutes per week.'
  const saved=updateGoalBrief(base(['design']),cap('45 minutes per week',source),source)
  saved.areas.push('coding')
  const loaded=reload(saved)
  assert.equal(loaded.capacity.binding,undefined)
  assert.equal(capacityContractLimits(loaded.capacity,loaded.areas).status,'unresolved')
  assert.equal(goalBriefDecisionView(loaded).capacity.constraints.status,'unresolved')
})

for(const ko of [false,true])for(const week of [40,70])for(const day of [10,20])for(const reverse of [false,true])for(const shortQuote of [false,true]) {
  const phrases=ko?[`주당 총 ${week}분`,`하루 최대 ${day}분`]:[`${week} minutes total per week`,`${day} minutes per day`]
  const source=(reverse?[...phrases].reverse():phrases).join('; '),summary=`${week} minutes per week`
  test('independent day/week bounds survive order and evidence shortening: '+JSON.stringify({ko,week,day,reverse,shortQuote}),()=>{
    const saved=updateGoalBrief(base(),cap(summary,shortQuote?phrases[0]:source),source)
    for(const brief of [saved,reload(saved)]) {
      const limits=capacityContractLimits(brief.capacity)
      assert.deepEqual(limits.dailyMinutes,Array(7).fill(day))
      assert.equal(limits.weeklyMinutes.max,week)
      assert.equal(goalFeasibilityIssue(card(day,[0]),brief),null)
      assert.match(goalFeasibilityIssue(card(day+1,[0]),brief),/goal_capacity_conflict/)
      if(week<day*7)assert.match(goalFeasibilityIssue(card(day,[0,1,2,3,4,5,6]),brief),/goal_capacity_conflict/)
    }
  })
}
for(const parts of permutations(['90 minutes total per week','2 sessions per week','20 minutes per session']))test('weekly/day/session conjunction is order invariant: '+parts.join('; '),()=>{
  const source=parts.join('; '),saved=updateGoalBrief(base(),cap(source),source)
  const limits=capacityContractLimits(reload(saved).capacity)
  assert.equal(limits.weeklyMinutes.max,90)
  assert.equal(limits.weeklySessions.max,2)
  assert.equal(limits.perSessionMinutes.max,20)
  assert.equal(goalFeasibilityIssue(card(20,[0,1]),saved),null)
  assert.match(goalFeasibilityIssue(card(21,[0]),saved),/goal_capacity_conflict/)
  assert.match(goalFeasibilityIssue(card(10,[0,1,2]),saved),/goal_capacity_conflict/)
})
for(const source of ['40 minutes per week; 15 minutes daily; Wednesday 0 minutes','주당 40분; 매일 15분; 수요일은 0분'])test('zero exception cannot relax independent weekly cap: '+source,()=>{
  const saved=updateGoalBrief(base(),cap(source),source),limits=capacityContractLimits(reload(saved).capacity)
  assert.equal(limits.weeklyMinutes.max,40)
  assert.equal(limits.dailyMinutes[2],0)
  assert.equal(goalFeasibilityIssue(card(15,[0,1]),saved),null)
  assert.match(goalFeasibilityIssue(card(15,[0,1,3]),saved),/goal_capacity_conflict/)
  assert.match(goalFeasibilityIssue(card(1,[2]),saved),/goal_capacity_conflict/)
})
for(const source of ['3 sessions per week; 1 session each day','주당 3회; 하루 1회'])test('count conjunction never fabricates time: '+source,()=>{
  const limits=analyzeGoalCapacity(source)
  assert.equal(limits.status,'bounded')
  assert.equal(limits.weeklySessions.max,3)
  assert.deepEqual(limits.dailySessions,Array(7).fill(1))
  assert.equal(limits.weeklyMinutes,null)
  assert.equal(limits.dailyMinutes,undefined)
})
for(const source of ['40 minutes per week or 20 minutes daily','40 minutes per week; 20 minutes daily if work allows',
  '40 minutes per week; 60 minutes per week','주당 40분 또는 하루 20분','1 hour and thirty min per week'])test('alternatives, overlapping replacements, unsupported fragments remain unresolved: '+source,()=>{
  assert.equal(analyzeGoalCapacity(source).status,'unresolved')
})

for(const n of [7,25,55])for(const text of [`My own available time is ${n} minutes per week.`,`My spare time is ${n} minutes per week.`,`내가 쓸 수 있는 시간은 주당 ${n}분이야.`,`가용 시간은 주당 ${n}분이야.`])test('narrative time noun is not a second quantity: '+text,()=>{
  const saved=updateGoalBrief(base(),cap(`${n} minutes per week`,text),text)
  assert.equal(capacityContractLimits(reload(saved).capacity).weeklyMinutes.max,n)
  assert.match(goalFeasibilityIssue(card(n+1),saved),/goal_capacity_conflict/)
})
for(const source of [null,12,{},[]])test('malformed persisted source fails closed without crashing: '+JSON.stringify(source),()=>{
  const brief=base();brief.capacity.contract={version:1,summary:brief.capacity.summary,evidence:brief.capacity.evidence,source,limits:{status:'bounded'}}
  assert.equal(capacityContractLimits(brief.capacity,brief.areas).status,'unresolved')
})

for(const source of ['부부 합쳐서 주당 3시간 가능해. 내 몫은 주당 25분이야.',
  'Between the two of us, we have 3 hours per week. I personally have 25 minutes per week.'])test('retain personal share without attaching a different collective budget: '+source,()=>{
  const saved=updateGoalBrief(base(),cap('25 minutes per week',source),source)
  assert.equal(capacityContractLimits(reload(saved).capacity).weeklyMinutes.max,25)
  assert.match(goalFeasibilityIssue(card(26),saved),/goal_capacity_conflict/)
})
for(const source of ['일 현재 수준은 한 달에 한 권, 건강 현재 수준은 한 달에 한 권, 주 3회 20분 가능',
  'design: 1 project completed, coding: 2 projects completed, I have 45 minutes per week.'])test('other measured facts in the sentence do not own the overall availability: '+source,()=>{
  const ko=source.startsWith('일'),areas=ko?['일','건강']:['design','coding']
  const summary=ko?'주 3회 20분 가능':'45 minutes per week'
  const saved=updateGoalBrief(base(areas),cap(summary),source)
  assert.equal(saved.capacity.binding.budgetScope.allocation,'overall')
  assert.equal(capacityContractLimits(reload(saved).capacity,areas).weeklyMinutes.max,ko?60:45)
})
