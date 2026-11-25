import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { AGENT_TOOL_DEFINITIONS, loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import { emptyBrief, updateGoalBrief } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { formatReply } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/state.ts'
import { applyMemoryUpdate, selectRelevantMemory } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/memory.ts'
import { replyFields, replyLimits, requestedDetailedReply, assertQuestionPreference } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/coachingContract.ts'
import { conversationPrompt } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/prompt.ts'
import { publicWorkflow, advanceWorkflow, emptyWorkflow, loadWorkflow } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/workflowState.ts'

// Scripted provider outputs test the real orchestrator, NOT the quality of a live
// language model. No source transcript or personal health details are bundled.
const now = '2026-09-17T03:00:00.000Z'
const reply = (paragraphs, question = '', extra = {}) => ({ focus: 'goals', intent: 'explore', move: question ? 'ask' : 'answer', confidence: 'high', expects_reply: !!question,
  goal_draft: null, goal_outcome: '', open_threads: [], remember: [], forget: [], paragraphs, bullets: [], question, choices: [], ...extra })
const capture = extra => ({ period: null, areas: [], baselines: [], objectives: [], capacity: null, ...extra })
const scripted = sequence => {
  const bodies = []
  return { bodies, today: '2026-09-17', now, request: async body => {
    const turn = sequence[bodies.length]
    bodies.push(body)
    assert.ok(turn, 'unexpected model retry: '+JSON.stringify(body.input.filter(v=>v.type==='function_call_output').map(v=>v.output)))
    const [name, args] = turn
    return { id: `offline-${bodies.length}`, model: 'offline-script-not-a-model-eval', usage: { input_tokens: 0, output_tokens: 0 },
      output: [{ type: 'function_call', name, call_id: `call-${bodies.length}`, arguments: JSON.stringify(args) }] }
  } }
}
const areaState = (area = '운동') => loadState({ stage: 5, agent_v2_context: { brief: { ...emptyBrief(), areas: [area] } } })

test('missing period does not replace a meaningful equipment question or grouped intake', async () => {
  const question = '집에서 사용할 수 있는 운동 도구가 있나요?\n한 번에 어느 정도 시간을 쓸 수 있나요?'
  const deps = scripted([['respond', reply(['집에서 지속할 수 있는 방법부터 맞춰볼게요. 도구와 가능한 시간에 따라 구성이 달라져요.'], question)]])
  const result = await runAgentTurn(areaState(), '집에서 하는 방향으로 도와줘', deps)
  assert.ok(result.assistant_message.includes(question))
  assert.doesNotMatch(result.assistant_message,/\*\*집에서 사용할 수 있는 운동 도구가 있나요\?\*\*/)
  assert.doesNotMatch(result.assistant_message, /어느 기간 동안/)
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.equal(result.state.agent_v2_context.brief.period, null)
  assert.equal(deps.bodies.length, 1)
  assert.match(JSON.stringify(publicWorkflow(result.state.agent_v2_context.workflow).openItem), /운동 도구/)
})

test('an incomplete brief can receive an answer without another intake question', async () => {
  const result = await runAgentTurn(areaState(), '아직 설계 말고 방향만 설명해줘', scripted([
    ['respond', reply(['좋은 몸이라는 목표를 외형과 실제 체력으로 나누어 생각할 수 있어요.', '운동 환경과 현재 실력을 알면 무리 없이 이어갈 방법을 좁힐 수 있어요.'])],
  ]))
  assert.doesNotMatch(result.assistant_message, /[?？]/)
  assert.equal(result.needs_clarification, false)
  assert.equal(result.state.agent_v2_context.draft, null)
})

test('an offer to help explains direction without inventing a provisional plan', async () => {
  const result = await runAgentTurn(areaState('독서'), '기간과 진행 방법을 추천해줘', scripted([
    ['respond', reply(['원한다면 읽고 싶은 책과 현재 읽는 속도를 바탕으로 실천 방법과 기록 방식을 함께 정할 수 있어요. 기간과 가능한 시간을 알면 부담이 맞는 계획을 만들 수 있어요.'], '원하는 기간은 있나요?\n지금 어느 정도 읽고 계신가요?\n읽고 싶은 책과 쓸 수 있는 시간은 어떻게 되나요?')],
  ]))
  assert.match(result.assistant_message, /원한다면/)
  assert.doesNotMatch(result.assistant_message, /4주.*하루 5분/)
  assert.equal(result.state.agent_v2_context.brief.period, null)
  assert.equal(result.state.agent_v2_context.brief.capacity, null)
  assert.equal(result.state.goal_card.weeklyActions.length, 0)
})

test('capture and reply remember a grounded resource for the next turn in one call', async () => {
  const evidence = '집에서 운동하고 싶고 기구는 없어'
  const deps = scripted([['record_goal_brief', capture({ areas: [{ name: '운동', evidence: '운동하고 싶고' }], reply: reply(['집에서 할 수 있는 방법으로 방향을 잡을게요.'], '어떤 변화를 가장 원하시나요?', {
    remember: [{ kind: 'constraint', note: '사용 가능한 운동 기구 없음', evidence: '기구는 없어', scope: 'long_term', expires_in_days: null }],
  }) })]])
  const first = await runAgentTurn(loadState({ stage: 5 }), evidence, deps)
  assert.equal(deps.bodies.length, 1)
  assert.equal(first.state.agent_v2_context.memory.length, 1)
  const follow = scripted([['respond', reply(['기구가 없는 조건을 고려해 동작 선택부터 설명할게요.'])]])
  await runAgentTurn(first.state, '그 방향을 자세하게 설명해줘', follow)
  assert.match(JSON.stringify(follow.bodies[0]), /사용 가능한 운동 기구 없음/)
  assert.equal(follow.bodies[0].max_output_tokens, 4200)
})

test('a ready brief still allows a context-specific question without creating a forced draft', async () => {
  const brief = { ...emptyBrief(), period: {label:'8 weeks',weeks:8}, areas:['exercise'],
    baselines:[{area:'exercise',current:'No recent exercise',evidence:'No recent exercise',status:'known'}],
    objectives:[{area:'exercise',result:'Complete the introductory course',evidence:'Complete the introductory course',resultKind:'milestone'}],
    capacity:{summary:'60 minutes per week',evidence:'60 minutes per week',status:'known'} }
  const question = 'Are there movements you need to avoid before I suggest exercises?'
  const deps = scripted([['respond', reply(['The timeframe and available time are clear. I will keep the plan adaptable.'], question)]])
  const result = await runAgentTurn(loadState({ stage:5, agent_v2_context:{brief} }), '운동 초안을 함께 정리해줘', deps)
  assert.match(result.assistant_message, /movements you need to avoid/)
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.ok(deps.bodies[0].tools.find(t=>t.name==='respond').parameters.properties.goal_draft.anyOf)
})

test('missing information continues to block a model-provided persisted draft', async () => {
  const deps = scripted([
    ['respond', reply(['초안을 만들었어요.'], '', { goal_draft: { outcome: 'not grounded' } })],
    ['respond', reply(['실제 계획은 현재 여건을 확인한 뒤 맞출게요.'], '지금까지 해본 운동은 무엇인가요?')],
  ])
  const result = await runAgentTurn(areaState(), '계획을 짜줘', deps)
  assert.ok(result.events.some(e=>/goal_brief_incomplete/.test(e.result?.error ?? '')))
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.equal(result.state.goal_card.weeklyActions.length, 0)
})

test('suggested periods cannot be stored as user decisions', () => {
  assert.throws(()=>updateGoalBrief(emptyBrief(), {period:'12주'}, '적절한 기간을 추천해줘'), /not_decided|evidence/)
})

test('resources and motivation remain relevant without repeating goal keywords', () => {
  const message='I have no equipment. I want more confidence.'
  const facts=applyMemoryUpdate([], {remember:[
    {kind:'constraint',note:'No equipment',evidence:'no equipment',scope:'long_term'},
    {kind:'motivation',note:'More confidence',evidence:'more confidence',scope:'long_term'},
  ]}, message, {now}).memory
  assert.equal(selectRelevantMemory(facts,{primary:'goal',modules:['goal']},'Continue',now).length,2)
  assert.equal(applyMemoryUpdate([], {remember:[{kind:'constraint',note:'Has a gym',evidence:'has a gym',scope:'long_term'}]},message,{now}).memory.length,0)
})

test('English preference is not silently dropped by the handler', async () => {
  const result=await runAgentTurn(areaState(), 'I prefer home workouts.', scripted([['respond',reply(['We can plan around home workouts.'],'',{
    remember:[{kind:'preference',note:'Prefers home workouts',evidence:'I prefer home workouts.',scope:'long_term',expires_in_days:null}],
  })]]))
  assert.equal(result.state.agent_v2_context.memory.length,1)
})

test('detailed formatting preserves headings, bold emphasis, lists and grouped questions', () => {
  const result=formatReply(reply(['## 진행 방향\n\n**현재 조건**을 기준으로 조절해요.', '### 실행 방법\n\n1. 시작 상태를 확인해요.\n2. 정한 행동을 해요.\n3. 실제 결과를 짧게 남겨요.'], '어떤 도구가 있나요?\n피해야 할 동작이 있나요?'))
  assert.match(result.text,/## 진행 방향\n\n\*\*현재 조건\*\*/)
  assert.match(result.text,/1\. 시작.*\n2\. 정한/)
  assert.ok(result.text.includes('어떤 도구가 있나요?\n피해야 할 동작이 있나요?'))
  assert.doesNotMatch(result.text,/\*\*어떤 도구가 있나요\?\*\*/)
})

for(const count of [1,2,3,6,9]) test(`focused question group allows ${count} questions`,()=>{
  assert.doesNotThrow(()=>formatReply(reply(['필요한 조건만 확인할게요.'],Array.from({length:count},(_,i)=>`조건 ${i+1}은 무엇인가요?`).join('\n'))))
})
test('reply ceilings and individual question preference stay bounded',()=>{
  assert.throws(()=>formatReply(reply(['내용'], '질문?'.repeat(replyLimits.questions+1))),/reply_needs/)
  assert.throws(()=>formatReply(reply(Array.from({length:8},(_,i)=>String(i)+'가'.repeat(899)))),/readable_budget|reply_needs/)
  assert.throws(()=>formatReply(reply(['가'.repeat(901)])),/reply_needs/)
  assert.throws(()=>assertQuestionPreference('도구가 있나요?\n몇 분 가능한가요?', '질문은 하나씩 해줘',[]),/single_question/)
  assert.throws(()=>assertQuestionPreference('Tools?\nTime?', '',['Ask me one question at a time']),/single_question/)
  assert.doesNotThrow(()=>assertQuestionPreference('사용할 도구가 있나요?', '질문은 하나씩 해줘',[]))
  assert.equal(replyFields.paragraphs.maxItems,replyLimits.paragraphs)
  assert.equal(replyFields.question.maxLength,replyLimits.questionLength)
  assert.equal(requestedDetailedReply('좋아'),false)
  assert.equal(requestedDetailedReply('Give me a detailed plan'),true)
})

test('runtime instructions explicitly separate readiness from dialogue order',()=>{
  const prompt=conversationPrompt({now,today:'2026-09-17',phase:'goal',facts:{},openings:[],userText:'운동 계획을 만들어줘'})
  assert.match(prompt,/질문 순서가 아니다/)
  assert.match(prompt,/임시·예시·추천이라는 이름으로/)
  assert.match(prompt,/이번 답변에서 한 번에 모아/)
  assert.doesNotMatch(prompt,/최대 세 가지까지|기본은 하나/)
  assert.doesNotMatch(prompt,/현재 답변에서 확인할 유일한 누락 정보/)
})

test('grouped question is not truncated on workflow persistence and reload',()=>{
  const question='어떤 환경에서 진행하시나요? '+ '조건에 따라 계획을 조정하기 위해 필요한 내용만 확인합니다. '.repeat(6) + '피해야 할 상황은 무엇인가요?'
  assert.ok(question.length>180 && question.length<420)
  const workflow=advanceWorkflow(emptyWorkflow(),{selectedTaskIds:['T02'],previousQuestionStatus:'none',finalQuestion:question,userText:'조건을 함께 정리하자',now})
  const loaded=loadWorkflow(JSON.parse(JSON.stringify(workflow)),{now})
  assert.equal(publicWorkflow(loaded).openItem.text,question)
})

test('all necessary intake questions survive the real reply, state reload and follow-up budget',async()=>{
  const question=Array.from({length:7},(_,i)=>`${i+1}. 조건 ${i+1}을 알려주실 수 있나요? ${'계획이 실제 여건에 맞도록 확인하는 내용입니다. '.repeat(3)}`).join('\n')
  assert.ok(question.length>420 && question.length<replyLimits.questionLength)
  const deps=scripted([['respond',reply(['필요한 조건을 함께 확인한 다음 실행 방법과 관리 방식을 정리할게요.'],question)]])
  const first=await runAgentTurn(areaState(),'계획을 짜 주고 꾸준히 같이 챙겨 줘',deps)
  assert.equal(deps.bodies[0].max_output_tokens,4200)
  assert.ok(first.assistant_message.includes('7. 조건 7'))
  const loaded=loadState(JSON.parse(JSON.stringify(first.state)))
  assert.ok(publicWorkflow(loaded.agent_v2_context.workflow).openItem.text.includes('7. 조건 7'))
  const follow=scripted([['respond',reply(['집에서 한다는 조건을 고려할게요.'])]])
  await runAgentTurn(loaded,'집에서 운동하고 싶어',follow)
  assert.equal(follow.bodies[0].max_output_tokens,4200)
})

test('qualitative and multi-metric current level is preserved as supplied, not collapsed to beginner',()=>{
  const source='운동은 턱걸이 8개, 팔굽혀펴기 25개 가능하고 오래 달리기는 어려워.'
  const current='턱걸이 8개, 팔굽혀펴기 25개 가능하고 오래 달리기는 어려워'
  const brief=updateGoalBrief({...emptyBrief(),areas:['운동']},{baselines:[{area:'운동',current,evidence:current,status:'known'}]},source)
  assert.equal(brief.baselines[0].current,current)
})

test('capture tool and explicit-cache instructions do not reinstate a fixed interview', async()=>{
  const captureTool=AGENT_TOOL_DEFINITIONS.find(tool=>tool.name==='record_goal_brief')
  assert.doesNotMatch(captureTool.description,/다음으로 필요한 정보 한 가지만|서버가 다음 호출에서 초안을 만든다/)
  const deps=scripted([['respond',reply(['필요한 내용만 함께 정리할게요.'])]])
  deps.promptCacheMode='explicit_static_prefix'
  await runAgentTurn(areaState(),'방법을 설명해줘',deps)
  assert.doesNotMatch(deps.bodies[0].instructions,/필요한 다음 질문은 하나만|설명 요청에는.*1~2개 문단/)
})

test('current grouped-question request overrides an older one-at-a-time preference',()=>{
  assert.doesNotThrow(()=>assertQuestionPreference('도구는 있나요?\n시간은 얼마나 가능한가요?',
    '이제 관련 질문은 한꺼번에 물어봐줘',['질문은 하나씩 해줘']))
  assert.doesNotThrow(()=>assertQuestionPreference('Equipment?\nAvailable time?',
    'You can ask related questions together now.',['Ask one question at a time']))
})

test('a grounded preference change retires only the conflicting question preference across reload',()=>{
  const first=applyMemoryUpdate([], {remember:[
    {kind:'preference',note:'질문은 하나씩 해줘',evidence:'질문은 하나씩 해줘',scope:'long_term'},
    {kind:'preference',note:'집에서 운동을 선호',evidence:'집에서 운동을 선호',scope:'long_term'},
  ]},'질문은 하나씩 해줘. 집에서 운동을 선호해.',{now}).memory
  const changed=applyMemoryUpdate(first,{remember:[{kind:'preference',note:'관련 질문은 한꺼번에 물어봐줘',evidence:'관련 질문은 한꺼번에 물어봐줘',scope:'long_term'}]},
    '이제 관련 질문은 한꺼번에 물어봐줘',{now})
  assert.equal(changed.memory.length,2)
  assert.ok(changed.memory.some(fact=>fact.note==='집에서 운동을 선호'))
  assert.equal(changed.removed[0].note,'질문은 하나씩 해줘')
  assert.equal(changed.remembered[0].supersedesId,changed.removed[0].id)
  const loaded=loadState({agent_v2_context:{memory:JSON.parse(JSON.stringify(changed.memory))}})
  assert.doesNotThrow(()=>assertQuestionPreference('Tools?\nTime?','계속하자',loaded.agent_v2_context.memory.map(f=>f.note)))
  const unsupported=applyMemoryUpdate(first,{remember:[{kind:'preference',note:'관련 질문은 한꺼번에 물어봐줘',evidence:'동의했어',scope:'long_term'}]},'아직은 아니야',{now})
  assert.equal(unsupported.removed.length,0)
  assert.equal(unsupported.memory.length,2)
})

test('direct text checks all question paragraphs against the one-at-a-time preference',async()=>{
  const deps={now,today:'2026-09-17',request:async()=>({id:'offline-direct',model:'offline',usage:{input_tokens:0,output_tokens:0},output:[{type:'message',content:[{type:'output_text',text:'사용할 도구가 있나요?\n\n한 번에 몇 분 가능한가요?'}]}]})}
  await assert.rejects(()=>runAgentTurn(areaState(),'질문은 하나씩 해줘',deps),/single_question_preference/)
})

test('management explanations are not removed as duplicate intake questions',async()=>{
  const explanation='조건을 확인한 뒤 목표와 주간 행동부터 설계하고, 실행할 때마다 알려주시면 실제 기록에 맞춰 다음 주 분량을 조정해요.'
  const result=await runAgentTurn(areaState(),'설계하고 같이 관리해줘',scripted([['respond',reply([explanation],'목표 기간과 현재 수준, 가능한 시간을 알려주세요.')]]))
  assert.ok(result.assistant_message.includes(explanation))
})

test('spare repetitions and recovery explanations are not mistaken for free calendar time',async()=>{
  const explanation='모든 세트는 여유 반복을 남겨 진행하는 원리예요. 전체 운동 시간을 늘리기 전에 회복 상태를 확인하는 이유도 있어요.'
  const result=await runAgentTurn(areaState(),'여유 반복이 뭔지 설명해줘',scripted([['respond',reply([explanation])]]))
  assert.ok(result.assistant_message.includes(explanation))
})

test('noncontiguous citations must be repaired, not silently lost from the goal brief',async()=>{
  const source='현재 책 2권을 읽었어. 출퇴근에는 음악을 들어. 읽는 속도는 느려.'
  const deps=scripted([
    ['record_goal_brief',capture({baselines:[{area:'독서',current:'책 2권, 느린 속도',evidence:'현재 책 2권을 읽었어. 읽는 속도는 느려.',status:'known'}]})],
    ['record_goal_brief',capture({baselines:[{area:'독서',current:'책 2권을 읽음',evidence:'현재 책 2권을 읽었어.',status:'known'}],reply:reply(['현재 읽은 양을 기준으로 이후 계획을 정할게요.'],'어떤 책을 언제까지 읽고 싶나요?')})],
  ])
  const result=await runAgentTurn(areaState('독서'),source,deps)
  assert.ok(result.events.some(e=>/goal_evidence_quote_required/.test(e.result?.error??'')))
  assert.equal(result.state.agent_v2_context.brief.baselines[0].current,'책 2권을 읽음')
})

test('mixed goal facts and explanation keep capture tools available without an empty required-tool request',async()=>{
  const state=areaState('독서')
  const text='기간은 12주로 하고 싶어. 주 3회 한 번에 30분씩 가능해. 이 조건으로 계획과 실행 방법, 이유, 기록하면서 조정하는 방법까지 설명해줘.'
  let inspected=false
  await assert.rejects(runAgentTurn(state,text,{now,today:'2026-09-17',request:async body=>{
    inspected=true
    assert.ok(body.tools.length>0)
    assert.ok(body.tools.some(t=>t.name==='record_goal_brief'))
    assert.match(body.instructions,/T02 목표 탐색/)
    throw Error('inspection_complete')
  }}),/inspection_complete/)
  assert.equal(inspected,true)
})

test('real respond path preserves a grouped-question correction for the following turn',async()=>{
  const initial=areaState()
  initial.agent_v2_context.memory=applyMemoryUpdate([],{remember:[{kind:'preference',note:'질문은 하나씩 해줘',evidence:'질문은 하나씩 해줘',scope:'long_term'}]},'질문은 하나씩 해줘',{now}).memory
  const first=await runAgentTurn(initial,'이제 관련 질문은 한꺼번에 물어봐줘',scripted([['respond',reply(['관련 조건을 함께 확인할게요.'],'도구는 있나요?\n한 번에 몇 분 가능한가요?',{
    remember:[{kind:'preference',note:'관련 질문은 한꺼번에 물어봐줘',evidence:'관련 질문은 한꺼번에 물어봐줘',scope:'long_term',expires_in_days:null}],
  })]]))
  assert.equal(first.state.agent_v2_context.memory.length,1)
  assert.match(first.state.agent_v2_context.memory[0].note,/한꺼번에/)
  const loaded=loadState(JSON.parse(JSON.stringify(first.state)))
  const next=await runAgentTurn(loaded,'다른 질문을 해줘',scripted([['respond',reply(['목표에 맞춰 확인할게요.'],'어떤 변화를 원하시나요?\n피해야 할 동작은 있나요?')]]))
  assert.match(next.assistant_message,/어떤 변화를/)
})
