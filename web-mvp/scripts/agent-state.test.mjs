import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatReply, hasUserEvidence, isExplicitCompletion, isScheduleComplete, replaceScheduleBlock, replayConversation, scheduleOpenings } from '../../supabase/functions/onju-agent-v2/state.ts'
import { validGoalCard } from '../../supabase/functions/onju-agent-v2/goal.ts'

test('global completion can move directly to goals', () => {
  for (const text of ['더 이상 일정 없어', '더이상 일정에 대해 설명할게 없어', '추가할 일정이 없어요', '일정은 이게 전부야', '일정은 여기까지예요', '이제 목표로 넘어가자']) assert.equal(isScheduleComplete(text), true, text)
})
test('evidence matching tolerates quotation marks and punctuation, not invented facts', () => {
  assert.equal(hasUserEvidence('“주말은 일정하지 않아.”', ['평일은 고정, 주말은 일정하지 않아, 나중에 알려줄게']), true)
  assert.equal(hasUserEvidence('일요일 23시 취침', ['토요일 23시 취침']), false)
})
test('partial completion must not skip the other schedule sections', () => {
  for (const text of ['월요일은 일정이 없어', '회복 시간은 없어', '일정은 아직 전부 말한 건 아니야', '다음으로', '이번 주 일정도 없어 다음으로']) assert.equal(isScheduleComplete(text), false, text)
})

test('partial negation and unknown times do not close a stage', () => {
  for (const value of ['월요일은 일정이 없어. 화요일에는 약속이 있는데 시간은 아직 몰라.', '시간이 없어', '충분하지 않아', '전부는 아니고', '다음으로 가기 전에 수정할게']) assert.equal(isExplicitCompletion(value), false, value)
})
test('explicit completion phrases remain supported', () => {
  for (const value of ['이게 전부예요', '고정 일정은 이게 전부예요', '고정 일정은 없어 다음으로', '반복 일정도 없어 다음으로', '매주 일정은 없어 다음으로', '보호할 회복 시간은 없어 다음으로', '이번 주 일정도 없어 다음으로', '이 단계는 충분해요 · 다음으로']) assert.equal(isExplicitCompletion(value), true, value)
})
const blocks = [{ days: [0,1,2,3,4], title: '근무', start: '09:00', end: '18:00', kind: 'fixed' }]
test('full correction replaces instead of appending', () => {
  const next = replaceScheduleBlock(blocks, 0, [0,1,2,3,4], '09:00', '17:00')
  assert.equal(next.length, 1)
  assert.equal(next[0].end, '17:00')
  assert.equal(blocks[0].end, '18:00')
})
test('one-day correction preserves every other day', () => {
  const next = replaceScheduleBlock(blocks, 0, [2], '09:00', '17:00')
  assert.deepEqual(next.map(b => [b.days, b.end]), [[[0,1,3,4], '18:00'], [[2], '17:00']])
})
test('invalid corrections fail without mutation', () => {
  assert.throws(() => replaceScheduleBlock(blocks, 3, [0], '09:00', '17:00'))
  assert.throws(() => replaceScheduleBlock(blocks, 0, [6], '09:00', '17:00'))
  assert.throws(() => replaceScheduleBlock(blocks, 0, [0], '19:00', '17:00'))
  assert.equal(blocks[0].end, '18:00')
})
test('conversation replay preserves unknown information without provider ID', () => {
  assert.deepEqual(replayConversation([{ role: 'user', text: '일요일은 7시 기상' }, { role: 'assistant', text: '취침은요?' }], '22시에 자요'), [
    { role: 'user', content: '일요일은 7시 기상' }, { role: 'assistant', content: '취침은요?' }, { role: 'user', content: '22시에 자요' },
  ])
})

test('reply sections always produce paragraphs, a list and one clear question', () => {
  assert.deepEqual(formatReply({ summary: '일정을 반영했어요.', details: ['이동 **06:30–08:30**', '근무 **08:30–17:30**'], question: '더 비워둘 시간이 있나요?', choices: ['일정은 여기까지예요', '추가할 일정이 있어요'] }), {
    text: '일정을 반영했어요.\n\n- 이동 **06:30–08:30**\n- 근무 **08:30–17:30**\n\n**더 비워둘 시간이 있나요?**', choices: ['일정은 여기까지예요', '추가할 일정이 있어요'],
  })
})
test('reply can finish without unnecessary questions or buttons', () => {
  assert.deepEqual(formatReply({ summary: '초안을 반영했어요.', details: [], question: '', choices: [] }), { text: '초안을 반영했어요.', choices: [] })
})
test('long paragraphs and stacked questions are rejected rather than displayed', () => {
  const reply = { summary: '반영했어요.', details: [], question: '어떻게 할까요?', choices: [] }
  assert.throws(() => formatReply({ ...reply, summary: 'a'.repeat(241) }))
  assert.throws(() => formatReply({ ...reply, question: '언제 일어나요? 언제 자요?' }))
  assert.throws(() => formatReply({ ...reply, details: ['첫째\n둘째'] }))
})
test('openings merge overlapping appointments and do not invent unknown days', () => {
  const result = scheduleOpenings([{ days: [0], wake: '06:00', bedtime: '23:00', variable: false }], [
    { ...blocks[0], days: [0], start: '09:00', end: '18:00' },
    { ...blocks[0], days: [0], start: '17:00', end: '19:00' },
  ])
  assert.deepEqual(result[0].slots, [{ start: '06:00', end: '09:00' }, { start: '19:00', end: '23:00' }])
  assert.deepEqual(result[1].slots, [])
})
test('variable rhythms are not claimed as available time', () => {
  assert.deepEqual(scheduleOpenings([{ days: [0], wake: '08:00', bedtime: '23:00', variable: true }], [])[0].slots, [])
})
test('goal cards cannot store malformed weekly actions or missing fields', () => {
  const card = { category: '기타', outcome: '독서', identity: '', deadline: '', baselineMetric: '', targetMetric: '4주 1권', tinyStart: '', cue: '', environment: '', fallbackAction: '', recoveryRule: '', reviewCycle: '', durationWeeks: 4, weeklyActions: [{ title: '독서', frequencyPerWeek: 3, durationMinutes: 15, preferredDays: [] }] }
  assert.equal(validGoalCard(card), true)
  assert.equal(validGoalCard({ ...card, weeklyActions: ['주 3회 15분'] }), false)
  assert.equal(validGoalCard({ ...card, weeklyActions: [{ ...card.weeklyActions[0], frequencyPerWeek: 20 }] }), false)
  assert.equal(validGoalCard({ outcome: '독서' }), false)
})
