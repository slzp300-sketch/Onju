import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadState, runAgentTurn } from '../../supabase/functions/onju-agent-v2/agent.ts'
import { formatReply } from '../../supabase/functions/onju-agent-v2/state.ts'

const adaptive = (paragraphs, options = {}) => ({
  focus: 'open',
  intent: 'share_fact',
  move: 'answer',
  remember: [],
  forget: [],
  goal_outcome: '',
  goal_draft: null,
  paragraphs: Array.isArray(paragraphs) ? paragraphs : [paragraphs],
  bullets: [],
  question: '',
  choices: [],
  ...options,
})

const provider = (sequence, inspect) => {
  let count = 0
  return {
    now: '2026년 9월 7일',
    request: async body => {
      inspect?.(body, count)
      assert.ok(count < sequence.length, 'unexpected extra model call')
      const [name, args] = sequence[count]
      count += 1
      return {
        id: `adaptive-${count}`,
        model: 'gpt-4.1-2025-04-14',
        usage: { input_tokens: 1, output_tokens: 1 },
        output: [{ type: 'function_call', name, arguments: JSON.stringify(args), call_id: `call-${count}` }],
      }
    },
  }
}

test('an open rhythm item does not override a direct side-question answer', async () => {
  const response = adaptive([
    '생활 시간은 목표를 실제 빈 시간에 놓기 위해 확인해요.',
    '하지만 꼭 먼저 끝낼 필요는 없어요. 지금은 운동 목표부터 이야기해도 괜찮아요.',
  ], { intent: 'ask_question', move: 'answer' })
  const result = await runAgentTurn(loadState({ stage: 0 }), '운동 목표를 세우고 싶은데 생활시간부터 꼭 말해야 해?', provider([
    ['respond', response],
  ], body => {
    assert.match(body.instructions, /대화 순서를 강제하는 체크리스트가 아니다/)
    assert.match(body.instructions, /conversationNeeds/)
  }))

  assert.match(result.assistant_message, /꼭 먼저 끝낼 필요는 없어요/)
  assert.doesNotMatch(result.assistant_message, /몇 시에 일어나|취침 시간.*알려/)
  assert.equal(result.state.agent_v2_context.dialogue.focus, 'goals')
  assert.equal(result.needs_clarification, false)
})

test('the controller can move from schedule intake to a goal conversation immediately', async () => {
  const result = await runAgentTurn(loadState({ stage: 0 }), '생활 시간은 나중에 말하고 운동 목표부터 정하고 싶어', provider([
    ['respond', adaptive('좋아요. 생활 시간은 실제 배치 전에 다시 확인하고, 지금은 원하는 운동 변화부터 잡아볼게요.', {
      focus: 'goals',
      intent: 'decide',
      move: 'transition',
      question: '몇 개월 뒤 어떤 운동 결과를 만들고 싶나요?',
    })],
  ]))

  assert.equal(result.state.agent_v2_context.dialogue.focus, 'goals')
  assert.equal(result.state.stage, 5)
  assert.match(result.assistant_message, /운동 변화부터/)
  assert.match(result.assistant_message, /몇 개월 뒤/)
})

test('durable preferences persist and are exposed to the next turn without being recited', async () => {
  const first = await runAgentTurn(loadState({ stage: 0 }), '선택지가 많으면 부담돼. 설명은 짧게 해줘', provider([
    ['respond', adaptive('알겠어요. 앞으로는 제가 먼저 판단해 가장 중요한 내용만 짧게 제안할게요.', {
      intent: 'share_fact',
      move: 'reflect',
      remember: [{ kind: 'preference', note: '선택지를 많이 받는 것보다 짧고 주도적인 제안을 선호함', evidence: '선택지가 많으면 부담돼. 설명은 짧게 해줘' }],
    })],
  ]))

  assert.equal(first.state.agent_v2_context.dialogue.memory.length, 1)
  const reloaded = loadState(first.state)
  const second = await runAgentTurn(reloaded, '왜 생활 시간을 물어봐?', provider([
    ['respond', adaptive('목표를 빈 시간에 무리 없이 배치하려고 확인해요. 원한다면 목표부터 정해도 괜찮아요.', { intent: 'ask_question' })],
  ], body => {
    assert.match(body.instructions, /선택지를 많이 받는 것보다 짧고 주도적인 제안을 선호함/)
  }))

  assert.equal(second.suggestions.length, 0)
  assert.doesNotMatch(second.assistant_message, /기억하고/)
})

test('a correction can remove stale memory and replace it with current evidence', async () => {
  const state = loadState({
    stage: 0,
    agent_v2_context: {
      version: 4,
      draft: null,
      dialogue: {
        version: 1,
        focus: 'open',
        lastIntent: 'share_fact',
        lastMove: 'reflect',
        scheduleComplete: false,
        memory: [{ id: 'old', kind: 'preference', note: '선택지가 많으면 부담됨', evidence: '선택지가 많으면 부담돼' }],
      },
    },
  })
  const result = await runAgentTurn(state, '아니, 선택지는 괜찮아. 비교해서 고르는 게 더 좋아', provider([
    ['respond', adaptive('정정할게요. 앞으로는 필요한 경우 비교할 수 있는 선택지를 함께 제안할게요.', {
      intent: 'correct',
      move: 'act_confirm',
      forget: [{ note: '선택지가 많으면 부담됨', evidence: '선택지는 괜찮아' }],
      remember: [{ kind: 'preference', note: '비교 가능한 선택지를 함께 보는 것을 선호함', evidence: '비교해서 고르는 게 더 좋아' }],
    })],
  ]))

  assert.deepEqual(result.state.agent_v2_context.dialogue.memory.map(item => item.note), ['비교 가능한 선택지를 함께 보는 것을 선호함'])
})

test('adaptive schedule replies preserve natural text and append only verified receipts', async () => {
  const schedule = {
    bounds: [{ days: ['월', '화', '수', '목', '금', '토', '일'], wake: '06:00', bedtime: '23:00', variable: false, deferred: false }],
    blocks: [],
    updates: [],
  }
  const result = await runAgentTurn(loadState({ stage: 0 }), '매일 6시에 일어나고 23시에 자', provider([
    ['apply_schedule', schedule],
    ['respond', adaptive('좋아요. 알려주신 생활 리듬을 기준으로 무리 없는 시간을 찾아볼게요.', { focus: 'schedule', move: 'act_confirm' })],
  ]))

  assert.match(result.assistant_message, /무리 없는 시간을 찾아볼게요/)
  assert.match(result.assistant_message, /06:00/)
  assert.match(result.assistant_message, /23:00/)
  assert.equal(result.state.day_bounds.length, 1)
})

test('answer-only and one-question replies are both valid presentation moves', () => {
  const answer = formatReply(adaptive(['먼저 지금 힘든 점부터 같이 정리해도 괜찮아요.', '일정 질문은 필요해질 때 다시 꺼낼게요.']))
  assert.equal(answer.text.match(/[?？]/g), null)

  const question = formatReply(adaptive('말씀하신 목표를 결과 기준으로 좁혀볼게요.', { move: 'ask', question: '3개월 뒤 확인하고 싶은 변화는 무엇인가요?' }))
  assert.equal(question.text.match(/[?？]/g)?.length, 1)
})

test('invented memory without exact user evidence is ignored', async () => {
  const result = await runAgentTurn(loadState({ stage: 0 }), '퇴근 후에는 많이 지쳐', provider([
    ['respond', adaptive('퇴근 뒤에는 에너지가 적다는 점을 고려해 작은 행동부터 제안할게요.', {
      move: 'reflect',
      remember: [{ kind: 'preference', note: '아침 운동을 선호함', evidence: '아침 운동을 선호함' }],
    })],
  ]))

  assert.equal(result.state.agent_v2_context.dialogue.memory.length, 0)
  assert.equal(result.events.find(event => event.tool === 'dialogue_update')?.result?.ignored, 1)
})
