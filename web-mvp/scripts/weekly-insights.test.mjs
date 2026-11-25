import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildWeeklyInsights, canAssignStrongGrade, dayIndexForDate, rollingWeekDates } from '../../supabase/functions/onju-daily/insights.ts'

const today = '2026-09-07'
const routines = Array.from({ length: 7 }, (_, dayIndex) => ({
  id: `routine-${dayIndex}`,
  title: '독서 · 20분',
  dayIndex,
}))

const log = (logDate, status) => ({
  logDate,
  status,
  routineItemId: `routine-${dayIndexForDate(logDate)}`,
})

test('rolling week uses calendar dates and Monday-first day indexes', () => {
  assert.deepEqual(rollingWeekDates(today), [
    '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07',
  ])
  assert.equal(dayIndexForDate('2026-09-07'), 0)
  assert.equal(dayIndexForDate('2026-09-06'), 6)
})

test('weekly adherence excludes exceptions and keeps unrecorded items visible', () => {
  const result = buildWeeklyInsights(today, routines, [
    log('2026-09-01', 'completed'),
    log('2026-09-02', 'missed'),
    log('2026-09-03', 'exception'),
    log('2026-09-04', 'completed'),
  ], [])

  assert.equal(result.scheduled, 7)
  assert.equal(result.completed, 2)
  assert.equal(result.missed, 1)
  assert.equal(result.exception, 1)
  assert.equal(result.unrecorded, 3)
  assert.equal(result.adherenceRate, 67)
  assert.equal(result.coverageRate, 57)
  assert.equal(result.signals.length, 0)
})

test('three consecutive misses become one evidence-based repetition signal', () => {
  const result = buildWeeklyInsights(today, routines, [
    log('2026-09-05', 'missed'),
    log('2026-09-06', 'missed'),
    log('2026-09-07', 'missed'),
  ], [])

  assert.equal(result.signals[0].type, 'missed_streak')
  assert.equal(result.signals[0].evidenceCount, 3)
  assert.match(result.signals[0].detail, /의지 문제로 단정하지/)
})

test('low adherence and repeated blockers require at least three records', () => {
  const result = buildWeeklyInsights(today, routines, [
    log('2026-09-01', 'missed'),
    log('2026-09-02', 'completed'),
    log('2026-09-03', 'missed'),
    log('2026-09-04', 'missed'),
  ], [
    { logDate: '2026-09-01', blocker: '퇴근이 늦었어요' },
    { logDate: '2026-09-03', blocker: '퇴근이 늦었어요' },
    { logDate: '2026-09-05', blocker: '퇴근이 늦었어요' },
  ])

  assert.deepEqual(result.signals.map(signal => signal.type).sort(), ['low_adherence', 'repeated_blocker'])
  assert.equal(result.adherenceRate, 25)
})

test('a single result is recorded without producing premature advice', () => {
  const result = buildWeeklyInsights(today, routines, [log(today, 'missed')], [])

  assert.equal(result.signals.length, 0)
  assert.match(result.note, /아직 판단하지 않아요/)
  assert.match(result.note, /2번 더/)
})

test('observation and excluded routines do not become failure signals', () => {
  const observationRoutines = routines.map(routine => ({ ...routine, grade: 'observation' }))
  const observed = buildWeeklyInsights(today, observationRoutines, [
    log('2026-09-05', 'missed'),
    log('2026-09-06', 'missed'),
    log('2026-09-07', 'missed'),
  ], [])
  assert.equal(observed.missed, 0)
  assert.equal(observed.observedSkipped, 3)
  assert.equal(observed.adherenceRate, null)
  assert.equal(observed.signals.length, 0)

  const excluded = buildWeeklyInsights(today, routines.map(routine => ({ ...routine, grade: 'excluded' })), [log(today, 'completed')], [])
  assert.equal(excluded.scheduled, 0)
  assert.equal(excluded.completed, 0)
})

test('a strong routine is called out after two consecutive misses', () => {
  const strongRoutines = routines.map(routine => ({ ...routine, grade: 'strong' }))
  const result = buildWeeklyInsights(today, strongRoutines, [
    log('2026-09-06', 'missed'),
    log('2026-09-07', 'missed'),
  ], [])
  assert.equal(result.signals[0].type, 'missed_streak')
  assert.match(result.signals[0].title, /강한 규칙 2회 연속/)
  assert.match(result.signals[0].detail, /회수하지 않아요/)
})

test('strong grade assignment is capped at two distinct routines', () => {
  assert.equal(canAssignStrongGrade(['독서', '운동'], '기도'), false)
  assert.equal(canAssignStrongGrade(['독서', '운동'], '독서'), true)
  assert.equal(canAssignStrongGrade(['독서'], '기도'), true)
})
