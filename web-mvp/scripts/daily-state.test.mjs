import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advanceCheckIn, inferEnergy, inferItemStatus, startCheckIn } from '../../supabase/functions/onju-daily/state.ts'

test('morning check-in follows the server-owned three step sequence', () => {
  let state = startCheckIn('morning', '책 읽기 20분')
  assert.match(state.pendingQuestion, /몸과 마음/)
  state = advanceCheckIn(state, '보통이에요', '책 읽기 20분').progress
  assert.equal(state.step, 1)
  assert.match(state.pendingQuestion, /책 읽기 20분/)
  state = advanceCheckIn(state, '이대로 할게요', '책 읽기 20분').progress
  assert.equal(state.step, 2)
  state = advanceCheckIn(state, '오후 회의가 길어질 수 있어', '책 읽기 20분').progress
  assert.equal(state.status, 'completed')
  assert.deepEqual(state.collected, { condition: '보통이에요', plan: '이대로 할게요', obstacle: '오후 회의가 길어질 수 있어' })
})

test('closing check-in classifies item status and energy without changing the sequence', () => {
  let state = startCheckIn('closing', '운동 30분')
  let result = advanceCheckIn(state, '오늘은 하지 못했어요', '운동 30분')
  assert.equal(result.itemStatus, 'missed')
  state = result.progress
  result = advanceCheckIn(state, '에너지는 2/5 정도', '운동 30분')
  assert.equal(result.energy, 2)
  state = result.progress
  result = advanceCheckIn(state, '퇴근이 늦었어. 내일은 10분으로 줄일래', '운동 30분')
  assert.equal(result.progress.status, 'completed')
  assert.equal(result.itemStatus, 'missed')
})

test('status and energy parsers preserve exceptions and unknown answers', () => {
  assert.equal(inferItemStatus('오늘은 미리 정한 예외 날이야'), 'exception')
  assert.equal(inferItemStatus('잘 모르겠어'), null)
  assert.equal(inferEnergy('아주 좋아요'), 5)
  assert.equal(inferEnergy('설명하기 어려워'), null)
})

test('completed check-ins cannot be advanced again', () => {
  let state = startCheckIn('morning')
  state = advanceCheckIn(state, '좋아요').progress
  state = advanceCheckIn(state, '이대로 할게요').progress
  state = advanceCheckIn(state, '없어요').progress
  assert.throws(() => advanceCheckIn(state, '다시 답변'))
})
