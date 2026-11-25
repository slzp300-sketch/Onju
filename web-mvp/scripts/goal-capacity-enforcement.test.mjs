import {withCoachingDetails} from '../../logs/sites/onju-web-mvp/web-mvp/scripts/fixtures/coaching-plan.mjs'
import './offline-network-guard.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { emptyBrief, loadGoalBrief, updateGoalBrief } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { parseGoalCapacity } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacity.ts'
import { assessGoalFeasibility, nextGoalIntakeStep, goalFeasibilityIssue, parseGoalQuantity } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalFeasibility.ts'
import { loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'

const strategy = '첫 주 실제 시간을 기록하고 다음 주 실행량을 다시 제안합니다.'
const seed = summary => ({ ...emptyBrief(), period: { label: '8 weeks', weeks: 8 }, areas: ['writing'],
  baselines: [{ area: 'writing', current: '1 article per week', evidence: '1 article per week', status: 'known' }],
  objectives: [{ area: 'writing', result: '8 articles', evidence: '8 articles', resultKind: 'metric' }],
  capacity: { summary, evidence: summary, status: 'known' } })
const card = (minutes, frequency = 1) => ({ weeklyActions: [{ durationMinutes: minutes, frequencyPerWeek: frequency }], execution: { progressStrategy: strategy } })

// Exhaustive small-domain invariants, not fictional users or live model replies.
for (const count of [2, 3, 5, 7]) for (const minutes of [1, 5, 10, 20, 30, 60]) {
  for (const text of [`${count} sessions of ${minutes} minutes per week`, `주 ${count}회, 회당 ${minutes}분 가능해.`]) {
    test('weekly budget cannot be concentrated beyond the session limit: ' + text, () => {
      const brief = seed(text), before = structuredClone(brief)
      assert.equal(goalFeasibilityIssue(card(minutes, count), brief), null)
      assert.match(goalFeasibilityIssue(card(minutes + 1, 1), brief), /goal_capacity_conflict/)
      assert.match(goalFeasibilityIssue(card(minutes * count, 1), brief), /goal_capacity_conflict/)
      assert.deepEqual(brief, before)
    })
  }
}
for (const [text, min, max] of [
  ['20 minutes per session', 20, 20], ['회당 20분 가능해.', 20, 20], ['한 번에 20분', 20, 20],
  ['20 minutes at a time', 20, 20], ['1½ hours per session', 90, 90], ['30 to 60 minutes per session', 30, 60],
  ['회당 1시간 30분', 90, 90], ['0 minutes per session', 0, 0],
]) test('session-only capacity is preserved without inventing weekly frequency: ' + text, () => {
  assert.deepEqual(parseGoalCapacity(text), { status: 'bounded', weeklyMinutes: null, weeklySessions: null, perSessionMinutes: { min, max } })
  const brief = seed(text)
  if (max > 0) {
    assert.equal(goalFeasibilityIssue(card(max), brief), null)
    assert.match(goalFeasibilityIssue(card(max + 1), brief), /goal_capacity_conflict/)
  } else {
    assert.equal(nextGoalIntakeStep(brief, null), 'feasibility')
    assert.match(goalFeasibilityIssue(card(1), brief), /goal_feasibility_choice_required/)
    brief.feasibilityAcceptance = { evidence: 'I choose to keep this target.' }
    assert.match(goalFeasibilityIssue(card(1), brief), /goal_capacity_conflict/)
  }
})
for (const text of ['20 minutes', '20분 가능해.', '2 hours', '2 sessions', '30 mins', 'thirty minutes',
  '20 minutes whenever I can', '회당 20 또는 40분', '20 or 40 minutes per session',
  'at least 20 minutes per session', 'two sessions of 20 minutes']) {
  test('a quantitative budget with missing/ambiguous scope is not unlimited: ' + text, () => {
    const brief = seed(text)
    assert.equal(parseGoalCapacity(text).status, 'unresolved')
    assert.equal(assessGoalFeasibility(brief).status, 'needs_measurement')
    assert.equal(nextGoalIntakeStep(brief, null), 'capacity')
    assert.match(goalFeasibilityIssue(card(10), brief), /goal_capacity_unresolved/)
  })
}
for (const text of ['I am free after work.', 'I am free after 6 pm.', '퇴근 후 가능해.', '주간 실행 시간 확인됨']) {
  test('narrative availability is not forced into a numeric questionnaire: ' + text, () => {
    assert.equal(parseGoalCapacity(text).status, 'unspecified')
    assert.equal(nextGoalIntakeStep(seed(text), null), null)
    assert.equal(goalFeasibilityIssue(card(10), seed(text)), null)
  })
}
test('unmeasured capacity remains a calibration path, not an invented restriction', () => {
  const brief = seed('20 minutes, not measured yet'); brief.capacity.status = 'unmeasured'
  assert.equal(assessGoalFeasibility(brief).status, 'needs_measurement')
  assert.equal(nextGoalIntakeStep(brief, null), null)
  assert.equal(goalFeasibilityIssue(card(10), brief), null)
})
test('per-session ranges use the declared upper bound, without enforcing a minimum', () => {
  const brief = seed('2 to 3 sessions of 10 to 20 minutes per week')
  assert.equal(goalFeasibilityIssue(card(5), brief), null)
  assert.equal(goalFeasibilityIssue(card(20, 3), brief), null)
  assert.match(goalFeasibilityIssue(card(21, 1), brief), /goal_capacity_conflict/)
})
test('every action is checked, not an average duration across actions', () => {
  const brief = seed('3 sessions of 10 minutes per week'), mixed = card(5)
  mixed.weeklyActions.push({ durationMinutes: 15, frequencyPerWeek: 1 })
  assert.match(goalFeasibilityIssue(mixed, brief), /goal_capacity_conflict/)
})
test('an explicit weekly total does not imply an equal per-session limit', () => {
  assert.equal(goalFeasibilityIssue(card(60), seed('three sessions per week, 60 minutes total')), null)
})
for (const text of ['20 minutes per session', '회당 20분 가능해.', '회당 20분']) test('captured and reloaded session budget still enforces the same limit: ' + text, () => {
  const source = text.startsWith('20') ? 'I can spend ' + text + '.' : text
  const brief = updateGoalBrief(seed('1 hour per week'), { capacity: { summary: text, evidence: text, status: 'known' } }, source)
  const reloaded = loadGoalBrief(JSON.parse(JSON.stringify(brief)))
  assert.equal(reloaded.capacity.summary, text)
  assert.match(goalFeasibilityIssue(card(21), reloaded), /goal_capacity_conflict/)
})
for (const text of ['minus 20 minutes per week', 'minus two hours per week', '마이너스 20분', '마이너스 반 시간', 'minus ½ hour per session', 'minus ２０ minutes per week']) {
  test('written minus is not discarded by either numeric parser: ' + text, () => {
    assert.equal(parseGoalCapacity(text).status, 'unresolved')
    assert.equal(parseGoalQuantity(text), null)
    assert.match(goalFeasibilityIssue(card(1), seed(text)), /goal_capacity_unresolved/)
  })
}
for (const text of ['3 sessions of 5 minutes per week', '주 3회, 회당 5분 가능해.', '5 minutes per session']) {
  test('real agent rejects an over-session mock draft within the weekly total: ' + text, async () => {
    const brief = seed(text), state = loadState({ stage: 5, agent_v2_context: { brief }, messages: [{ role: 'user', text: 'writing: 8 weeks, current 1 article per week, target 8 articles. ' + text }] })
    const before = structuredClone(state)
    const proposal = minutes => ({ category: 'writing', outcome: '8 articles', identity: '', cue: '', environment: '', deadline: '', baselineMetric: '1 article per week', targetMetric: '8 articles', durationWeeks: 8,
      measurement: 'custom_outcome', completionPercent: null, reviewEveryWeeks: 1, progressStrategy: strategy,
      actions: [{ title: 'Draft an article', frequencyPerWeek: 1, durationMinutes: minutes, preferredDays: [], planningStyle: 'repeat', completionCriterion: 'Save a draft and one revision note', minimumAction: 'Open the draft', minimumMinutes: 1, goalResult: '8 articles', steps: ['Open the draft', 'Write and save one revision note'] }] })
    let calls = 0
    const result = await runAgentTurn(state, '지금 말한 시간을 기준으로 초안을 만들어줘.', { today: '2026-09-16', now: '2026년 9월 16일', request: async body => {
      assert.ok(++calls <= 4, 'unexpected extra mock request')
      const route = !body.tools.some(tool => tool.name === 'respond')
      const rejected = body.input.filter(item => item.type === 'function_call_output').some(item => /goal_capacity_conflict/.test(JSON.parse(item.output).error ?? ''))
      const name = route ? 'route_request' : 'respond', args = route ? { module: 'goal', evidence: '지금 말한 시간을 기준으로 초안을 만들어줘.', reason: 'Use recorded capacity.' }
        : { focus: 'goals', goal_outcome: '8 articles', goal_draft: withCoachingDetails(proposal(rejected ? 5 : 10)), summary: '시작할 초안이에요.', details: [], question: '시작할까요?', choices: [] }
      return { id: 'mock-' + calls, model: 'offline-fixture', usage: { input_tokens: 0, output_tokens: 0 }, output: [{ type: 'function_call', name, call_id: 'call-' + calls, arguments: JSON.stringify(args) }] }
    } })
    assert.ok(result.events.some(event => /goal_capacity_conflict/.test(event.result?.error ?? '')))
    assert.equal(result.state.agent_v2_context.draft.card.weeklyActions[0].durationMinutes, 5)
    assert.deepEqual(result.state.goal_card, before.goal_card)
    assert.deepEqual(result.state.agent_v2_context.brief, before.agent_v2_context.brief)
    assert.deepEqual(state, before)
  })
}
