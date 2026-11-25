import { test } from 'node:test'
import assert from 'node:assert/strict'
import { compactConversation } from '../../supabase/functions/onju-agent-v2/compaction.ts'
import { applyDailyCheckIn } from '../../supabase/functions/onju-agent-v2/daily.ts'
import { applyDialogueUpdate, emptyDialogue, loadDialogue, settleDialogueReply } from '../../supabase/functions/onju-agent-v2/dialogue.ts'
import { loadState, runAgentTurn } from '../../supabase/functions/onju-agent-v2/agent.ts'
import { replayConversation } from '../../supabase/functions/onju-agent-v2/state.ts'

test('the visible question is the source of truth for reply expectation', async () => {
  const response = {
    focus: 'open', intent: 'ask_question', move: 'answer', confidence: 'high', expects_reply: false, open_threads: [],
    remember: [], forget: [], goal_outcome: '', goal_draft: null, paragraphs: ['먼저 원하는 변화를 좁혀볼게요.'], bullets: [],
    question: '3개월 뒤 어떤 결과를 확인하고 싶나요?', choices: [],
  }
  const result = await runAgentTurn(loadState({ stage: 5 }), '목표를 정하고 싶어', {
    now: '2026년 9월 7일',
    request: async () => ({ id: 'r1', model: 'gpt-4.1', usage: { input_tokens: 1, output_tokens: 1 }, output: [{ type: 'function_call', name: 'respond', call_id: 'c1', arguments: JSON.stringify(response) }] }),
  })
  assert.equal(result.needs_clarification, true)
  assert.equal(result.state.agent_v2_context.dialogue.expectsReply, true)
  assert.equal(result.state.agent_v2_context.dialogue.lastMove, 'ask')
})

test('memory v2 records source, lifetime and refreshes duplicate evidence', () => {
  const now = '2026-09-07T00:00:00.000Z'
  const first = applyDialogueUpdate(emptyDialogue(), {
    remember: [{ kind: 'context', note: '이번 주 야근이 많음', evidence: '이번 주 야근이 많아', scope: 'temporary', expires_in_days: 7 }],
  }, '이번 주 야근이 많아', { now, userMessageId: 'message-1' }).state
  assert.equal(first.memory[0].scope, 'temporary')
  assert.equal(first.memory[0].sourceMessageId, 'message-1')
  assert.equal(first.memory[0].expiresAt, '2026-09-14T00:00:00.000Z')
  const refreshed = applyDialogueUpdate(first, {
    remember: [{ kind: 'context', note: '이번 주 야근이 많음', evidence: '아직 이번 주 야근이 많아', scope: 'temporary', expires_in_days: 10 }],
  }, '아직 이번 주 야근이 많아', { now: '2026-09-08T00:00:00.000Z', userMessageId: 'message-2' }).state
  assert.equal(refreshed.memory.length, 1)
  assert.equal(refreshed.memory[0].sourceMessageId, 'message-2')
  assert.equal(loadDialogue(refreshed, 0, '2026-09-19T00:00:00.000Z').memory.length, 0)
})

test('long history is compacted and only recent turns are replayed', () => {
  const messages = Array.from({ length: 30 }, (_, index) => ({ id: `m${index}`, role: index % 2 ? 'assistant' : 'user', text: index % 2 ? `반영한 답변 ${index}` : `사용자 맥락 ${index}` }))
  const summary = compactConversation(messages)
  assert.ok(summary)
  assert.ok(summary.userSignals.length > 0)
  const replay = replayConversation(messages, '새 질문')
  assert.equal(replay.length, 17)
  assert.equal(replay.at(-1).content, '새 질문')
})

test('daily check-in stores only evidence-backed execution facts', () => {
  const result = applyDailyCheckIn([], {
    completed: [{ action: '독서 15분', evidence: '독서 15분 했어' }], missed: [], energy: 3,
    blocker: '야근', blocker_evidence: '야근 때문에 늦었어', adjustment: '내일은 5분부터 시작',
  }, '독서 15분 했어. 야근 때문에 늦었어', '2026-09-07', '2026-09-07T13:00:00.000Z')
  assert.deepEqual(result.record.completed, ['독서 15분'])
  assert.equal(result.record.energy, 3)
  assert.equal(result.record.blocker, '야근')
  assert.throws(() => applyDailyCheckIn([], { completed: [{ action: '운동', evidence: '운동 완료' }] }, '오늘 피곤해', '2026-09-07', '2026-09-07T13:00:00.000Z'))
})

test('settled answer-only replies do not leave a stale clarification flag', () => {
  const dialogue = emptyDialogue()
  settleDialogueReply(dialogue, '')
  assert.equal(dialogue.expectsReply, false)
  assert.equal(dialogue.lastMove, 'answer')
})
