import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emptyBrief, parseGoalPeriod, updateGoalBrief, missingGoalBrief, goalBriefIssue } from '../../supabase/functions/onju-agent-v2/goalBrief.ts'
import { loadState, runAgentTurn } from '../../supabase/functions/onju-agent-v2/agent.ts'
import { emptyGoal, materializeGoalDraft } from '../../supabase/functions/onju-agent-v2/goal.ts'

const capture = extra => ['record_goal_brief', { period: null, areas: [], objectives: [], ...extra }]
const respond = draft => ['respond', { focus: 'goals', goal_outcome: '', goal_draft: draft, summary: '초안이에요.', details: [], question: '', choices: [] }]
const dialogue = (summary, question, extra = {}) => ['respond', { ...respond(null)[1], summary, question, ...extra }]
const provider = sequence => {
  let count = 0
  return { now: '2026년 9월 4일', request: async body => {
    assert.ok(count < sequence.length, 'unexpected extra model call')
    const [name, args] = sequence[count++]
    if (name === 'record_goal_brief' && !args.objectives.length) assert.deepEqual(body.tools.find(t => t.name === 'respond').parameters.properties.goal_draft, { type: 'null' })
    return { id: `r${count}`, model: 'gpt-4.1', usage: { input_tokens: 1, output_tokens: 1 }, output: [{ type: 'function_call', name, arguments: JSON.stringify(args), call_id: `c${count}` }] }
  } }
}
const readyBrief = () => updateGoalBrief(emptyBrief(), { period: '3개월', areas: ['독서'], objectives: [{ area: '독서', result: '책 3권 완독' }] }, '독서 목표로 3개월 동안 책 3권 완독')
const proposal = () => ({ category: '자기계발·공부', outcome: '책을 끝까지 읽기', identity: '', cue: '', environment: '', deadline: '', baselineMetric: '', targetMetric: '책 3권 완독', durationWeeks: 13, measurement: 'custom_outcome', completionPercent: null, reviewEveryWeeks: 1, actions: [{ title: '독서', frequencyPerWeek: 3, durationMinutes: 10, preferredDays: [], completionCriterion: '읽은 쪽수와 핵심 문장 기록', minimumAction: '책 한 문장 읽기', minimumMinutes: 1, goalResult: '책 3권 완독', steps: ['읽을 책과 남은 쪽수를 확인해요.', '책갈피부터 이어 읽어요.', '읽은 쪽수와 핵심 문장을 기록해요.'] }] })

test('a field alone asks for duration and cannot generate a draft', async () => {
  const result = await runAgentTurn(loadState({ stage: 5 }), '건강, 일, 신앙', provider([capture({ areas: ['건강', '일', '신앙'] }), dialogue('세 분야를 함께 챙기려는 계획이네요.', '먼저 얼마 동안 진행하고 싶으세요?', {choices:['1개월','3개월','6개월']})]))
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.equal(result.state.goal_card.weeklyActions.length, 0)
  assert.match(result.assistant_message, /먼저 얼마 동안/)
  assert.deepEqual(result.suggestions, ['1개월', '3개월', '6개월'])
})
test('even an invalid model attempt cannot skip the intake gate', async () => {
  const result = await runAgentTurn(loadState({ stage: 5 }), '건강', provider([respond(proposal()), dialogue('건강 목표를 정하기 전에 기간부터 함께 생각해 볼게요.', '얼마 동안 진행하고 싶으세요?')]))
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.match(result.assistant_message, /기간/)
  assert.doesNotMatch(result.assistant_message, /주간 실행|이 초안으로/)
  assert.match(result.events.find(e=>e.tool==='respond'&&!e.result.ok).result.error, /goal_brief_incomplete/)
})
test('duration alone is remembered and asks for an end result, not routine input', async () => {
  const result = await runAgentTurn(loadState({ stage: 5 }), '3개월', provider([dialogue('3개월을 기준으로 현실적인 목표를 함께 잡아볼게요.', '3개월 뒤 무엇을 이루고 싶으세요?')]))
  assert.equal(result.state.agent_v2_context.brief.period.weeks, 13)
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.match(result.assistant_message, /3개월 뒤 무엇을 이루고/)
  assert.equal(result.events.filter(e=>e.tool==='model_usage').length, 1)
})
test('per-domain results accumulate across reloads, without reasking completed domains', async () => {
  let brief = updateGoalBrief(emptyBrief(), { period: '3개월', areas: ['일', '건강'], objectives: [] }, '일과 건강, 3개월')
  const state = loadState({ stage: 5, agent_v2_context: { version: 3, draft: null, brief } })
  const result = await runAgentTurn(state, '일에서는 포트폴리오 완성', provider([capture({ objectives: [{ area: '일', result: '포트폴리오 완성' }] }), dialogue('일에서는 포트폴리오 완성을 목표로 기억할게요.', '건강 분야에서 가장 바꾸고 싶은 것은 무엇인가요?')]))
  assert.equal(result.state.agent_v2_context.brief.objectives[0].result, '포트폴리오 완성')
  assert.match(result.assistant_message.split('\n\n').at(-1), /^\*\*건강 분야에서/)
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.deepEqual(loadState(result.state).agent_v2_context.brief, result.state.agent_v2_context.brief)
})
test('complete input moves straight to a linked daily guide and still requires approval', async () => {
  const result = await runAgentTurn(loadState({ stage: 5 }), '독서 목표로 3개월 동안 책 3권 완독', provider([
    capture({ period: '3개월', areas: ['독서'], objectives: [{ area: '독서', result: '책 3권 완독' }] }), respond(proposal()),
  ]))
  assert.equal(result.state.agent_v2_context.draft.card.durationWeeks, 13)
  assert.equal(result.state.goal_card.weeklyActions.length, 0)
  assert.match(result.assistant_message, /실행하는 날의 순서/)
  assert.match(result.assistant_message, /1\. 읽을 책/)
  assert.match(result.assistant_message, /책 3권 완독/)
  assert.match(result.assistant_message, /3개월.*13주/)
  const approved = await runAgentTurn(result.state, '이 초안으로 시작할게요', provider([]), { draftId: result.state.agent_v2_context.draft.id })
  assert.deepEqual(approved.state.goal_card.execution.actions[0].steps, proposal().actions[0].steps)
})
test('outcome before duration is kept while asking only the missing period', async () => {
  const result = await runAgentTurn(loadState({ stage: 5 }), '독서로 책 3권 완독', provider([capture({ areas: ['독서'], objectives: [{ area: '독서', result: '책 3권 완독' }] }), dialogue('책 3권 완독이라는 결과가 분명하네요.', '먼저 얼마 동안 읽을 계획인가요?')]))
  assert.equal(missingGoalBrief(result.state.agent_v2_context.brief), 'period')
  assert.match(result.assistant_message, /책 3권 완독/)
  assert.match(result.assistant_message, /먼저 얼마 동안/)
})
test('vague fields, invented results, and suggested but unchosen values cannot be captured', () => {
  for (const result of ['건강', '3개월 동안 건강', '더 열심히 살기']) assert.throws(() => updateGoalBrief(emptyBrief(), { period: null, areas: ['건강'], objectives: [{ area: '건강', result }] }, `건강 ${result}`), /concrete_user_evidence/)
  assert.throws(() => updateGoalBrief(emptyBrief(), { period: '3개월', areas: [], objectives: [] }, '3개월이면 좋을까?'), /not_decided/)
  assert.throws(() => updateGoalBrief(emptyBrief(), { period: '3개월', areas: [], objectives: [] }, '기간 추천해줘'), /exact_user_evidence/)
  assert.throws(() => updateGoalBrief(readyBrief(), { period: null, areas: [], objectives: [{ area: '독서', result: '책 5권 완독' }] }, '좋아'), /concrete_user_evidence/)
})
test('period and outcome cannot be replaced with a short experiment or generic completion rate', () => {
  const card = materializeGoalDraft(proposal())
  assert.equal(goalBriefIssue(card, readyBrief()), null)
  assert.match(goalBriefIssue({ ...card, durationWeeks: 4 }, readyBrief()), /preserve_goal_period/)
  assert.match(goalBriefIssue({ ...card, targetMetric: '실행률 80%' }, readyBrief()), /preserve_goal_results/)
  card.execution.actions[0].goalResult = '새로운 목표'
  assert.match(goalBriefIssue(card, readyBrief()), /daily_guide/)
})
test('unsupported or ambiguous periods are not guessed', () => {
  assert.equal(parseGoalPeriod('세 달').weeks, 13)
  assert.equal(parseGoalPeriod('4주').weeks, 4)
  for (const value of ['0개월', '3~6개월', '언젠가', '3년']) assert.equal(parseGoalPeriod(value), null)
})
test('known fields may be resent idempotently without discarding a new period', () => {
  const first = updateGoalBrief(emptyBrief(), {period:null,areas:['독서'],objectives:[]}, '독서')
  const next = updateGoalBrief(first, {period:'3개월',areas:['독서'],objectives:[]}, '3개월')
  assert.equal(next.period.weeks, 13)
  assert.deepEqual(updateGoalBrief(readyBrief(), {period:'3개월',areas:['독서'],objectives:[{area:'독서',result:'책 3권 완독'}]}, '좋아'), readyBrief())
  assert.equal(updateGoalBrief(emptyBrief(), {period:'3개월',areas:['독서'],objectives:[]}, '3개월', ['독서 목표를 정할게']).period.weeks, 13)
})
test('requesting result suggestions does not confirm the AI candidates', async () => {
  const brief = updateGoalBrief(emptyBrief(), { period: '3개월', areas: ['독서'], objectives: [] }, '독서 3개월')
  const turn = respond(null)
  Object.assign(turn[1], { details: ['후보: 책 3권 완독', '후보: 책 1권 완독'], question: '어떤가요?', choices: ['책 3권 완독', '책 1권 완독'] })
  const result = await runAgentTurn(loadState({ stage: 5, agent_v2_context: { version: 3, draft: null, brief } }), '목표를 추천해줘', provider([turn]))
  assert.equal(result.state.agent_v2_context.brief.objectives.length, 0)
  assert.deepEqual(result.suggestions, ['책 3권 완독', '책 1권 완독'])
  assert.equal(result.state.agent_v2_context.draft, null)
})
test('explicit restart drops only an unconfirmed draft, preserving the schedule', async () => {
  const card = materializeGoalDraft(proposal())
  const state = loadState({ stage: 5, goal_card: emptyGoal, agent_v2_context: { version: 3, draft: { id: 'old', presentedMessageId: 'a', card } }, day_bounds: [{ days: [0], wake: '06:00', bedtime: '23:00', variable: false }] })
  const result = await runAgentTurn(state, '기간부터 먼저 정할게', provider([dialogue('미확정 초안은 내려놓고 기간부터 다시 잡아볼게요.', '먼저 얼마 동안 진행하고 싶으세요?')]))
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.deepEqual(result.state.day_bounds, state.day_bounds)
  assert.match(result.assistant_message, /먼저 얼마 동안/)
})

test('three unnamed areas get a contextual model question rather than the fixed result prompt', async () => {
  const brief = updateGoalBrief(emptyBrief(), {period:'3개월',areas:[],objectives:[]}, '3개월')
  const message = dialogue('3개월 동안 세 분야를 함께 챙기고 싶으시군요. 분야부터 정리해 볼게요.', '생각하신 세 가지 분야는 무엇인가요?')
  const result = await runAgentTurn(loadState({stage:5,agent_v2_context:{version:3,draft:null,brief}}), '3개월간 3가지 분야에서 각각의 목표를 달성하고 싶어', provider([message]))
  assert.match(result.assistant_message, /생각하신 세 가지 분야/)
  assert.doesNotMatch(result.assistant_message, /책 3권 완독|뒤 무엇을 이루고/)
  assert.equal(result.state.agent_v2_context.brief.areaCount, 3)
  assert.equal(result.state.agent_v2_context.draft, null)
})

test('recording facts returns control to the model to decide the next conversational question', async () => {
  const result = await runAgentTurn(loadState({stage:5}), '일, 건강, 신앙을 3개월 동안 챙기고 싶어', provider([
    capture({period:'3개월',areas:['일','건강','신앙']}),
    dialogue('일·건강·신앙을 함께 챙기려는 계획이네요. 한 분야씩 구체화해 볼게요.', '지금 가장 먼저 달라졌으면 하는 분야는 어디인가요?'),
  ]))
  assert.match(result.assistant_message, /가장 먼저 달라졌으면/)
  assert.equal(result.events.filter(e=>e.tool==='model_usage').length, 2)
  assert.equal(result.state.agent_v2_context.brief.period.weeks, 13)
  assert.deepEqual(result.state.agent_v2_context.brief.areas, ['일','건강','신앙'])
})

test('a why question is answered before continuing the intake', async () => {
  const brief = updateGoalBrief(emptyBrief(), {period:'3개월',areas:['일'],objectives:[]}, '일 3개월')
  const result = await runAgentTurn(loadState({stage:5,agent_v2_context:{version:3,draft:null,brief}}), '왜 기간부터 정해야 해?', provider([
    dialogue('기간은 목표의 범위를 현실적으로 나누기 위한 기준이에요. 아직 감이 없다면 원하는 변화부터 이야기해도 괜찮아요.', '요즘 가장 바꾸고 싶은 부분은 무엇인가요?'),
  ]))
  assert.match(result.assistant_message, /범위를 현실적으로/)
  assert.doesNotMatch(result.assistant_message, /먼저 얼마 동안/)
  assert.deepEqual(result.state.agent_v2_context.brief, brief)
})

test('unnamed requested areas survive reload and block an incomplete one-area draft', async () => {
  const brief = updateGoalBrief(readyBrief(), {period:null,areas:[],objectives:[]}, '3가지 분야를 챙기고 싶어')
  const state = loadState({stage:5,agent_v2_context:{version:3,draft:null,brief}})
  assert.equal(state.agent_v2_context.brief.areaCount, 3)
  assert.equal(missingGoalBrief(brief), 'areas')
  assert.match(goalBriefIssue(materializeGoalDraft(proposal()), brief), /incomplete/)
  const result = await runAgentTurn(state, '독서는 책 3권 완독이야', provider([respond(proposal()), dialogue('독서 목표는 기억하고 있어요. 함께 챙기려는 다른 분야도 알아볼게요.', '나머지 두 분야는 무엇인가요?')]))
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.match(result.assistant_message, /나머지 두 분야/)
})

test('identical repeated reply is repaired with current context without losing facts', async () => {
  const previous = '기간은 정했어요.\n\n**어떤 결과를 원하나요?**'
  const state = loadState({stage:5,messages:[{id:'last',role:'assistant',text:previous}]})
  const result = await runAgentTurn(state, '3가지 분야를 챙기고 싶어', provider([
    dialogue('기간은 정했어요.', '어떤 결과를 원하나요?'),
    dialogue('여러 분야를 함께 챙기려는 거군요.', '생각하신 세 분야는 무엇인가요?'),
  ]))
  assert.ok(result.events.some(e=>e.tool==='respond'&&/repeated_reply/.test(e.result.error??'')))
  assert.match(result.assistant_message, /생각하신 세 분야/)
  assert.equal(result.state.agent_v2_context.brief.areaCount, 3)
})

test('count mentions in candidate questions and unsupported numbers are not stored as decisions', () => {
  for (const text of ['3가지 분야면 어떨까?', '3가지 분야를 추천해줘', '13가지 분야', '3가지 분야 말고', '책 3권 완독']) {
    const brief = updateGoalBrief(emptyBrief(), {period:null,areas:[],objectives:[]}, text)
    assert.equal(brief.areaCount, undefined, text)
  }
})

test('exhausted model validation has a bounded fallback aware of the unnamed area scope', async () => {
  const brief = updateGoalBrief(emptyBrief(), {period:'3개월',areas:[],objectives:[]}, '3개월 3가지 분야')
  const result = await runAgentTurn(loadState({stage:5,agent_v2_context:{version:3,draft:null,brief}}), '분야를 말할게', provider(Array.from({length:5},()=>respond(proposal()))))
  assert.match(result.assistant_message, /3가지 분야/)
  assert.equal(result.state.agent_v2_context.draft, null)
  assert.ok(result.events.some(e=>e.tool==='goal_brief_clarification'))
})

test('explanation bullets cannot duplicate the model-selected final question', async () => {
  const result = await runAgentTurn(loadState({stage:5}), '3가지 분야를 챙기고 싶어', provider([
    dialogue('세 분야를 함께 챙기고 싶은 거군요.', '생각하신 세 분야는 무엇인가요?', {details:['한 분야씩 목표를 구체화할 수 있어요.', '세 분야 이름을 알려주세요.', '어떤 분야가 있나요?']}),
  ]))
  assert.match(result.assistant_message, /한 분야씩 목표/)
  assert.doesNotMatch(result.assistant_message, /이름을 알려주세요|어떤 분야가 있나요/)
  assert.equal(result.assistant_message.match(/\?/g).length, 1)
})
