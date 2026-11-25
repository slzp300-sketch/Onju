import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildTrialReview } from '../../supabase/functions/onju-daily/trialReview.ts'
import { dayIndexForDate } from '../../supabase/functions/onju-daily/insights.ts'

const routine = date => ({ id: `routine-${date}`, routineKey: '독서', title: '독서', dayIndex: dayIndexForDate(date) })
const trial = { id: 'trial', routineKey: '독서', strategyId: 'minimum-version', strategy: '2분 독서', dependencyKind: 'schedule', startedOn: '2026-09-01', trialUntil: '2026-09-14', extensionCount: 0 }
const log = (date, status) => ({ routineItemId: `routine-${date}`, logDate: date, status })

test('an active trial shows progress without an early verdict', () => {
  const result = buildTrialReview('2026-09-07', trial, [routine('2026-09-01')], [log('2026-09-01', 'completed')])
  assert.equal(result.due, false)
  assert.equal(result.recommendation, 'pending')
  assert.equal(result.elapsedDays, 7)
})

test('a successful due trial recommends keeping the structure', () => {
  const routines = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map(routine)
  const logs = [log('2026-09-01', 'completed'), log('2026-09-02', 'completed'), log('2026-09-03', 'completed'), log('2026-09-04', 'missed')]
  const result = buildTrialReview('2026-09-14', trial, routines, logs)
  assert.equal(result.adherenceRate, 75)
  assert.equal(result.recommendation, 'keep')
})

test('a mixed due trial recommends another structure', () => {
  const routines = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map(routine)
  const logs = [log('2026-09-01', 'completed'), log('2026-09-02', 'completed'), log('2026-09-03', 'missed'), log('2026-09-04', 'missed')]
  assert.equal(buildTrialReview('2026-09-14', trial, routines, logs).recommendation, 'modify')
})

test('a low-adherence due trial recommends stopping', () => {
  const routines = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map(routine)
  const logs = [log('2026-09-01', 'completed'), log('2026-09-02', 'missed'), log('2026-09-03', 'missed'), log('2026-09-04', 'missed')]
  assert.equal(buildTrialReview('2026-09-14', trial, routines, logs).recommendation, 'stop')
})

test('exceptions and unrecorded slots do not distort adherence', () => {
  const routines = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'].map(routine)
  const logs = [log('2026-09-01', 'completed'), log('2026-09-02', 'missed'), log('2026-09-03', 'exception')]
  const result = buildTrialReview('2026-09-04', { ...trial, trialUntil: '2026-09-04' }, routines, logs)
  assert.equal(result.adherenceRate, 50)
  assert.equal(result.exception, 1)
  assert.equal(result.unrecorded, 1)
})

test('insufficient evidence gets one extension instead of a verdict', () => {
  const routines = ['2026-09-01', '2026-09-02'].map(routine)
  const result = buildTrialReview('2026-09-14', trial, routines, [log('2026-09-01', 'completed')])
  assert.equal(result.recommendation, 'extend')
  assert.match(result.summary, /7일/)
})

test('insufficient evidence after the only extension recommends stopping', () => {
  const extended = { ...trial, trialUntil: '2026-09-21', extensionCount: 1 }
  const result = buildTrialReview('2026-09-21', extended, [routine('2026-09-01')], [log('2026-09-01', 'completed')])
  assert.equal(result.recommendation, 'stop')
})

test('revision choices exclude the strategy already tested', () => {
  const result = buildTrialReview('2026-09-14', trial, [], [])
  assert.equal(result.alternativeOptions.length, 2)
  assert.ok(result.alternativeOptions.every(option => option.id !== trial.strategyId))
})
