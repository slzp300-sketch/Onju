import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emptyBrief } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { goalTimeBudget, groundGoalReplyArithmetic } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalReplyArithmetic.ts'
import { formatReply } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/state.ts'
import { loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
const fixture=JSON.parse(readFileSync(new URL('./fixtures/claude-reply-regressions.json',import.meta.url),'utf8'))
const brief=fixture.reading.brief

test('recorded 400-minute reply uses grounded 30 × 8 = 240 minutes and 4 hours everywhere',()=>{
 const before=structuredClone(brief)
 const result=groundGoalReplyArithmetic(fixture.reading.text,brief)
 assert.equal(result.repairs,2)
 assert.doesNotMatch(result.text,/400분|6시간 40분/)
 assert.equal(result.text.match(/240분\(4시간\)/g).length,2)
 assert.match(result.text,/30분\(화 10분 \+ 목 20분\)/)
 assert.match(result.text,/16세션/)
 assert.deepEqual(brief,before)
 assert.deepEqual(groundGoalReplyArithmetic(result.text,brief),{text:result.text,repairs:0})
})

test('totals come from reparsed source, not cached numeric limits; other periods and units work',()=>{
 const forged=structuredClone(brief);forged.capacity.contract.limits.weeklyMinutes={min:500,max:500}
 assert.equal(goalTimeBudget(forged).totalMinutes,240)
 const other=structuredClone(brief);other.period={label:'6주',weeks:6}
 assert.match(groundGoalReplyArithmetic('6주 동안 총 독서 시간은 8시간이에요.',other).text,/180분\(3시간\)/)
 assert.match(groundGoalReplyArithmetic('8주 총 독서 시간은 240분(6시간 40분)이에요.',brief).text,/240분\(4시간\)/)
})

test('weekly/session budgets, history, user quotes, questions and alternative periods survive unchanged',()=>{
 for(const text of [
  '8주 동안 주간 총 실행 시간은 30분이에요.',
  '8주 동안 주 총 독서 시간은 30분이에요.',
  '8주 동안 목요일 총 독서 시간은 20분이에요.',
  '8주 동안 총 독서 시간은 30분 / 주예요.',
  '8주 동안 총 독서 시간은 10분씩 나눠요.',
  '8주 동안 일주일 총 실행 시간은 30분이에요.',
  '8주 동안 한 회 총 실행 시간은 10분이에요.',
  '지난 8주 총 독서 시간은 400분이었어요.',
  '8주 총 독서 시간은 400분 읽었어요.',
  '8주 동안 기존 총 독서 시간 320분 → 수정 총 독서 시간 240분이에요.',
  '8주 계획과 별개로 10주 총 독서 시간은 400분이에요.',
  '8주 총 독서 시간을 400분으로 늘릴까요?',
  '8주 계획에서 사용자가 “총 독서 시간은 400분”이라고 말했어요.',
 ])assert.equal(groundGoalReplyArithmetic(text,brief).text,text,text)
})

test('unknown, ranged, multi-goal and collective capacity never becomes an exact total',()=>{
 for(const mutated of [emptyBrief(),{...brief,capacity:{...brief.capacity,status:'estimate'}},{...brief,areas:['독서','운동']},{...brief,areaCount:2},{...brief,period:null},{...brief,period:{...brief.period,deadline:'2026-12-01'}},
 {...brief,capacity:{summary:'주 20~40분',evidence:'주 20~40분 가능해',status:'known'}},
 {...brief,capacity:{summary:'우리 팀 주 40분',evidence:'우리 팀 주 40분 가능해',status:'known'}}]) {
  assert.equal(goalTimeBudget(mutated),null)
  assert.equal(groundGoalReplyArithmetic(fixture.reading.text,mutated).repairs,0)
 }
})

test('recorded oversized learning paragraphs render losslessly without another model call',()=>{
 const reply=fixture.learning.reply,before=structuredClone(reply)
 assert.ok(reply.paragraphs.some(p=>p.length>900))
 const rendered=formatReply(reply)
 assert.equal(rendered.text,reply.paragraphs.join('\n\n'))
 assert.deepEqual(reply,before)
 assert.throws(()=>formatReply({...reply,paragraphs:['x'.repeat(901)]}),/maximum 900/)
 assert.throws(()=>formatReply({...reply,paragraphs:['x'.repeat(700)+'\n\n'+'y'.repeat(700),...Array(7).fill('other')]}),/reply_needs/)
})

test('agent applies arithmetic before persistence and exposes server totals with zero network calls',async()=>{
 let calls=0
 const state=loadState(null)
 state.stage=5;state.agent_v2_context.brief=structuredClone(brief)
 const reply={decision:'continue',focus:'goals',intent:'request_plan',move:'suggest',confidence:'high',expects_reply:false,open_threads:[],remember:[],forget:[],goal_outcome:null,goal_draft:null,question_updates:[],paragraphs:[fixture.reading.text.replace(/\?/g,'')],bullets:[],question:'',choices:[]}
 // Use a short recorded excerpt so this test isolates arithmetic, not length.
 reply.paragraphs=['8주 동안 실제 독서 시간은 약 400분(6시간 40분)이 돼요.']
 const result=await runAgentTurn(state,'수정안을 보여줘',{model:'claude-sonnet-4-6',now:'2026-10-26T09:00:00+09:00',request:async request=>{
  calls++;const dynamic=JSON.stringify(request.input)
  assert.match(dynamic,/goalTimeBudget/)
  return {id:'msg_offline_arithmetic',model:'claude-sonnet-4-6',output:[{type:'function_call',name:'respond',call_id:'offline',arguments:JSON.stringify(reply)}]}
 }})
 assert.equal(calls,1)
 assert.match(result.assistant_message,/240분\(4시간\)/)
 assert.match(result.state.messages.at(-1).text,/240분\(4시간\)/)
 assert.ok(result.events.some(e=>e.tool==='reply_arithmetic_grounding'))
 assert.equal(result.state.goal_card.weeklyActions.length,0)
})

test('server-applied correction stops repeated rejected capacity writes and keeps other facts',async()=>{
 const {createAnthropicMessagesAdapter}=await import('../../supabase/functions/_shared/anthropicMessagesAdapter.ts')
 const state=loadState(null),observed=[]
 state.stage=5;state.agent_v2_context.brief=structuredClone(fixture.learningCorrection.brief)
 state.agent_v2_context.dialogue.focus='goals';state.messages=structuredClone(fixture.learningCorrection.messages)
 const adapter=createAnthropicMessagesAdapter({apiKey:'offline-fixture',fetcher:async()=>new Response(JSON.stringify(fixture.learningCorrection.responses[observed.length-1]))})
 const result=await runAgentTurn(state,fixture.learningCorrection.user,{model:'claude-sonnet-4-6',now:'2026-10-26T09:00:00+09:00',request:async request=>{
  observed.push(request.tools.map(t=>t.name));assert.ok(observed.length<=2)
  return (await adapter.generate(request)).data
 }})
 assert.ok(observed[0].includes('record_goal_brief'))
 assert.deepEqual(observed[1],['respond'])
 const {capacityContractLimits}=await import('../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacityContract.ts')
 assert.equal(capacityContractLimits(result.state.agent_v2_context.brief.capacity).weeklyMinutes.max,60)
 assert.equal(result.state.agent_v2_context.brief.period.weeks,6)
 assert.ok(result.events.some(e=>e.tool==='capacity_correction_reply_only'))
 assert.equal(result.state.goal_card.weeklyActions.length,0)
 assert.equal(result.state.blocks.length,0)
})


test('compound and decimal hours are replaced as whole durations, never leaving stale minutes',()=>{
 for(const duration of ['9시간 30분','9시간30분(9.5시간)','6.5시간','400분(6시간40분)']) {
  const result=groundGoalReplyArithmetic(`8주 총 독서 시간은 ${duration}이에요.`,brief)
  assert.equal(result.text,'8주 총 독서 시간은 240분(4시간)이에요.')
 }
 const exact=groundGoalReplyArithmetic('8주 총 독서 시간은 4시간 0분이에요.',brief)
 assert.equal(exact.repairs,0)
})
