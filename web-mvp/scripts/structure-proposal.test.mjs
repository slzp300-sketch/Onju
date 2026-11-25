import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildStructureProposal, findStructureOption } from '../../supabase/functions/onju-daily/structure.ts'

const today = '2026-09-07'
const signal = { type: 'missed_streak', title: '독서 · 3회 연속 미실행', detail: '반복', evidenceCount: 3, routineTitle: '독서' }
const routine = { key: '독서', title: '독서', start: '06:30', dependencyKinds: [] }

test('an explicit prerequisite wins over keyword and time inference', () => {
  const result = buildStructureProposal(today, [signal], [{ ...routine, dependencyKinds: ['energy'] }], ['회의가 길었어요'], [])
  assert.equal(result.dependencyKind, 'energy')
})

test('an early routine is linked to waking when no stronger evidence exists', () => {
  const result = buildStructureProposal(today, [signal], [routine], [], [])
  assert.equal(result.dependencyKind, 'wake')
  assert.equal(result.trialUntil, '2026-09-21')
})

test('a blocker can identify schedule as the prerequisite', () => {
  const result = buildStructureProposal(today, [signal], [routine], ['퇴근과 회의가 늦었어요'], [])
  assert.equal(result.dependencyKind, 'schedule')
})

test('a proposal waits for a routine-specific threshold signal', () => {
  assert.equal(buildStructureProposal(today, [], [routine], [], []), null)
  assert.equal(buildStructureProposal(today, [{ ...signal, type: 'repeated_blocker', routineTitle: null }], [routine], [], []), null)
})

test('every proposal has three choices with visible tradeoffs', () => {
  const result = buildStructureProposal(today, [signal], [routine], [], [])
  assert.equal(result.options.length, 3)
  assert.ok(result.options.every(option => option.tradeoff.length > 0))
})

test('an active trial suppresses duplicate proposals', () => {
  const result = buildStructureProposal(today, [signal], [routine], [], [{ routineKey: '독서', status: 'active' }])
  assert.equal(result, null)
})

test('only a server-created option can be selected', () => {
  const result = buildStructureProposal(today, [signal], [routine], [], [])
  assert.equal(findStructureOption(result, 'first-stable-block').id, 'first-stable-block')
  assert.equal(findStructureOption(result, 'invented-option'), null)
})
