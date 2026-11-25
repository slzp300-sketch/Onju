import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { analyzeGoalCapacity } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import { compileCapacityContract, capacityContractLimits } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacityContract.ts'
import { correctedCapacitySource } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacityCorrection.ts'
import { reconcileGoalCapacity } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacityReconciliation.ts'
import { emptyBrief, loadGoalBrief } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { applyMemoryUpdate, loadMemory, reconcileCapacityMemory } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/memory.ts'
import { loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import { claudeCoachingCases } from './claude-coaching-cases.mjs'

const now='2026-10-23T00:00:00.000Z'
const observed=JSON.parse(readFileSync(new URL('./fixtures/capacity-correction-observed.json',import.meta.url),'utf8'))
const seeds={reading:'지금은 한 달에 0권이고, 평일 화요일과 목요일 저녁에 20분씩 가능해.', learning:'월수금 퇴근 뒤 30분씩 가능해.', uncertainty:'일주일에 3번, 출근 전 10분 정도 가능해.'}
const names={reading:'독서',learning:'파이썬 업무 자동화',uncertainty:'영어 회화'}
const totals={reading:30,learning:60,uncertainty:20}
const briefFor=id=>({...emptyBrief(),areas:[names[id]],capacity:{summary:seeds[id],evidence:seeds[id],status:'known',contract:compileCapacityContract(seeds[id],seeds[id],seeds[id])}})
const memoryFor=(id,note=seeds[id])=>applyMemoryUpdate([],{remember:[{kind:'constraint',note,evidence:seeds[id],scope:'long_term'}]},seeds[id],{now,userMessageId:'original'}).memory

test('reading baseline month never divides the named-day time budget',()=>{
  const limit=analyzeGoalCapacity(seeds.reading)
  assert.equal(limit.weeklyMinutes.max,40)
  assert.deepEqual(limit.dailyMinutes,[0,20,0,20,0,0,0])
  assert.equal(capacityContractLimits(briefFor('reading').capacity).weeklyMinutes.max,40)
  assert.equal(analyzeGoalCapacity(seeds.learning).weeklyMinutes.max,90)
  assert.equal(analyzeGoalCapacity('매주 화요일 10분, 매주 목요일 20분').weeklyMinutes.max,30)
})

for(const id of Object.keys(seeds))test('observed '+id+' correction survives reload without provider memory output',()=>{
  const text=claudeCoachingCases.find(c=>c.id===id).turns[2],before=briefFor(id),snapshot=structuredClone(before)
  const corrected=reconcileGoalCapacity(before,memoryFor(id),text)
  assert.ok(corrected)
  assert.equal(capacityContractLimits(corrected.capacity).weeklyMinutes.max,totals[id])
  assert.equal(capacityContractLimits(loadGoalBrief(JSON.parse(JSON.stringify(corrected))).capacity).weeklyMinutes.max,totals[id])
  assert.deepEqual(before,snapshot)
  assert.deepEqual(corrected.objectives,before.objectives)
  assert.equal(corrected.period,before.period)
})

test('missing structured capacity recovers grounded availability from memory',()=>{
  for(const id of ['learning','uncertainty']) {
    const text=claudeCoachingCases.find(c=>c.id===id).turns[2]
    const updated=reconcileGoalCapacity({...emptyBrief(),areas:[names[id]]},memoryFor(id),text,seeds[id])
    assert.equal(capacityContractLimits(updated.capacity).weeklyMinutes.max,totals[id])
  }
})

for(const text of ['만약 시간이 생기면 화요일만 10분으로 줄여줘.','화요일만 10분으로 줄일까요?',
  '친구는 화요일만 10분으로 줄여달라고 했어.','화요일만 10분으로 줄여줘라고 말했어.',
  '다음 주부터 화요일만 10분으로 줄여줘.','화요일만 10분으로 줄여줘. 변경하지 마.',
  '이번 화요일은 10분 읽었어.','화요일만 10분으로 줄여줘. 목요일 30분은 유지해.',
  '화요일만 10분으로 줄여줘. 토요일 5분을 추가해.',
  '화요일만 10분으로 줄여줘. 목요일 15분으로 변경해.',
  '화요일만 10분으로 줄여볼까',
  '화요일만 10분으로 줄여줘. 방금 한 말은 취소할게.',
  '수요일은 앞으로 시간이 안 나면',
  '주 2번으로 정정할게. 15분은 유지해.'])test('non-authoritative or conflicting update preserves facts: '+text,()=>{
    assert.equal(correctedCapacitySource(seeds.reading,text),null)
  })

test('corrected contract replays evidence rather than trusting cached limits',()=>{
  const text=claudeCoachingCases[0].turns[2],b=reconcileGoalCapacity(briefFor('reading'),[],text)
  b.capacity.contract.limits.weeklyMinutes.max=999
  assert.equal(capacityContractLimits(b.capacity).weeklyMinutes.max,30)
  b.capacity.contract.source='매주 화요일 999분'
  assert.equal(capacityContractLimits(b.capacity).status,'unresolved')
})

for(const item of observed.cases)test('observed provider state corrects without a new API call: '+item.caseId+'/'+item.provider,()=>{
  const s=loadState(item.initial),before=structuredClone(s),ctx=s.agent_v2_context
  const changed=reconcileGoalCapacity(ctx.brief,ctx.memory,item.message,s.messages.filter(m=>m.role==='user').at(-1).text)
  assert.ok(changed)
  assert.equal(capacityContractLimits(changed.capacity).weeklyMinutes.max,item.expectedWeeklyMinutes)
  const corrected=reconcileCapacityMemory(ctx.memory,changed.capacity.summary,item.message,changed.areas,{now,userMessageId:'correction',previousSources:[changed.capacity.contract.correction.baseSource]})
  const active=corrected.memory.filter(f=>f.capacityArea===changed.areas.join(' · '))
  assert.equal(active.length,1)
  if(item.caseId==='learning')assert.ok(!corrected.memory.some(f=>/월수금|월·수·금/.test(f.note)))
  if(item.caseId==='uncertainty')assert.ok(!corrected.memory.some(f=>/주\s*3회/.test(f.note)))
  assert.deepEqual(s,before)
})

test('a named different goal cannot overwrite the current capacity',()=>{
  assert.equal(reconcileGoalCapacity(briefFor('uncertainty'),memoryFor('uncertainty'),'운동은 주 2번으로 정정할게. 10분은 유지해.'),null)
  assert.equal(reconcileGoalCapacity({...emptyBrief(),areas:[names.uncertainty]},memoryFor('uncertainty'),claudeCoachingCases[2].turns[2],'다른 주제로 이야기하자.'),null)
  const changed=reconcileGoalCapacity(briefFor('uncertainty'),[],claudeCoachingCases[2].turns[2])
  assert.match(changed.capacity.summary,/출근 전/)
})

test('memory replacement keeps unrelated composite facts, equipment, and other goals',()=>{
  const original=memoryFor('learning','노트북 보유, 프로그래밍 처음, 월수금 퇴근 후 30분 실행')
  original.push(...memoryFor('learning','운동 주 3회, 회당 30분 가능'))
  const result=reconcileCapacityMemory(original,'매주 월요일 30분, 매주 금요일 30분',claudeCoachingCases[1].turns[2],[names.learning],{now,userMessageId:'corrected'})
  assert.ok(result.memory.some(f=>f.note.includes('노트북 보유')&&f.note.includes('프로그래밍 처음')))
  assert.ok(result.memory.some(f=>f.note.includes('운동 주 3회')))
  assert.ok(!result.memory.some(f=>f.note.includes('월수금')))
  assert.equal(result.memory.filter(f=>f.capacityArea===names.learning).length,1)
  assert.equal(result.memory.find(f=>f.capacityArea===names.learning).supersedesId,original[0].id)
  assert.equal(loadMemory(JSON.parse(JSON.stringify(result.memory)),undefined,now).filter(f=>f.capacityArea===names.learning).length,1)
})

for(const id of Object.keys(seeds))test('agent updates before model request and rejects stale remember after response: '+id,async()=>{
  const text=claudeCoachingCases.find(c=>c.id===id).turns[2],initial=loadState({stage:5,agent_v2_context:{brief:briefFor(id),memory:memoryFor(id)},messages:[{id:'original',role:'user',text:seeds[id]}]})
  const before=structuredClone(initial);let calls=0
  const result=await runAgentTurn(initial,text,{now,today:'2026-10-23',request:async body=>{
    assert.ok(++calls<=3)
    assert.ok(JSON.stringify(body).includes('capacity'))
    assert.ok(JSON.stringify(body).includes(id==='uncertainty'?'주 2회, 회당 10분':id==='learning'?'매주 월요일 30분, 매주 금요일 30분':'매주 화요일 10분, 매주 목요일 20분'))
    return {id:'offline',model:'offline-fixture',usage:{input_tokens:0,output_tokens:0},output:[{type:'function_call',name:'respond',call_id:'call'+calls,arguments:JSON.stringify({
      decision:{user_meaning:'실행 시간을 정정하고 승인 전 수정안을 요청함',previous_question_status:'corrected',response_goal:'정정된 시간으로 안내',next_question_reason:''},
      focus:'goals',intent:'seek_advice',move:'answer',confidence:'high',expects_reply:false,open_threads:[],remember:[{kind:'constraint',note:seeds[id],evidence:text.slice(0,20),scope:'long_term'}],forget:[],goal_outcome:'',goal_draft:null,question_updates:[],paragraphs:['정정한 시간을 기준으로 안내할게요. 아직 목표와 일정은 확정하지 않았어요.'],bullets:[],question:'',choices:[]})}]}
  }})
  assert.equal(capacityContractLimits(result.state.agent_v2_context.brief.capacity).weeklyMinutes.max,totals[id])
  assert.equal(result.state.agent_v2_context.memory.filter(f=>f.capacityArea===names[id]).length,1)
  assert.ok(!result.state.agent_v2_context.memory.some(f=>f.note===seeds[id]))
  assert.ok(result.events.some(e=>e.tool==='capacity_correction'))
  assert.deepEqual(result.state.goal_card,before.goal_card)
  assert.deepEqual(result.state.blocks,before.blocks)
  assert.deepEqual(initial,before)
})
