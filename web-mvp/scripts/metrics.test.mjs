import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildProductRows,
  buildUsageRows,
  deriveAgentProductEvents,
  estimateTokenCost,
  providerForModel,
} from '../../supabase/functions/_shared/onjuMetrics.ts'

const regionalContext = {
  locale: 'en-US',
  countryCode: 'US',
  timeZone: 'America/New_York',
  currencyCode: 'USD',
  weekStartsOn: 0,
}

test('GPT-5.6 Sol production usage uses the official promotional rates', () => {
  const cost = estimateTokenCost('gpt-5.6-sol', {
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 250 },
    output_tokens: 100,
  })
  assert.equal(cost.estimatedCostUsdMicros, 5100)
  assert.equal(cost.costStatus, 'estimated')
  assert.match(cost.pricingVersion, /^openai-gpt-5\.6-sol-promo-/)
})

test('GPT-4.1 cost separates cached input from ordinary input', () => {
  const cost = estimateTokenCost('gpt-4.1-2025-04-14', {
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 400 },
    output_tokens: 200,
  })
  assert.equal(cost.estimatedCostUsdMicros, 3000)
  assert.equal(cost.costStatus, 'estimated')
  assert.match(cost.pricingVersion, /^openai-gpt-4\.1-/)
})

test('GPT-4o Mini plan usage uses its own lower token rates', () => {
  const cost = estimateTokenCost('gpt-4o-mini-2024-07-18', {
    input_tokens: 1000,
    output_tokens: 1000,
  })
  assert.equal(cost.estimatedCostUsdMicros, 750)
  assert.equal(cost.costStatus, 'estimated')
})

test('tool costs stay partial and unknown models are never reported as free', () => {
  const search = estimateTokenCost('gpt-4.1', { input_tokens: 100, output_tokens: 20 }, 1)
  assert.equal(search.costStatus, 'partial')
  assert.equal(search.estimatedCostUsdMicros, 360)
  const unknown = estimateTokenCost('future-provider-model', { input_tokens: 1000, output_tokens: 1000 })
  assert.equal(unknown.costStatus, 'unpriced')
  assert.equal(unknown.estimatedCostUsdMicros, null)
})

test('provider recognition is ready for OpenAI, Gemini, Claude, and local models', () => {
  assert.equal(providerForModel('gpt-4.1'), 'openai')
  assert.equal(providerForModel('gemini-2.5-flash'), 'google')
  assert.equal(providerForModel('claude-sonnet-4'), 'anthropic')
  assert.equal(providerForModel('ollama/llama3'), 'local')
})

test('model variants never inherit base-model rates and missing usage is not free', () => {
  for (const model of ['gpt-4.1-mini', 'gpt-4.1-nano-2025-04-14', 'gpt-4o-mini-audio-preview', 'gpt-5.6-sol-pro', 'gpt-5.6-pro']) {
    assert.equal(estimateTokenCost(model, { input_tokens: 1000, output_tokens: 100 }).costStatus, 'unpriced')
  }
  for (const usage of [undefined, {}, { input_tokens: 100 }, { input_tokens: -1, output_tokens: 5 }]) {
    const result = estimateTokenCost('gpt-4.1', usage)
    assert.equal(result.costStatus, 'unpriced')
    assert.equal(result.estimatedCostUsdMicros, null)
  }
  assert.equal(estimateTokenCost('gpt-4.1', { input_tokens: 0, output_tokens: 0 }).estimatedCostUsdMicros, 0)
})

test('usage rows preserve country, language, currency, provider, and call operation', () => {
  const [row] = buildUsageRows({
    sessionId: '00000000-0000-4000-8000-000000000001',
    sourceId: '00000000-0000-4000-8000-000000000002',
    turnId: '00000000-0000-4000-8000-000000000002',
    surface: 'setup_chat',
    regionalContext,
    calls: [{ operation: 'term_lookup', model: 'gpt-4.1', usage: { input_tokens: 50, output_tokens: 10 }, toolCalls: 1 }],
    occurredAt: '2026-09-15T00:00:00.000Z',
  })
  assert.equal(row.country_code, 'US')
  assert.equal(row.locale, 'en-US')
  assert.equal(row.currency_code, 'USD')
  assert.equal(row.provider, 'openai')
  assert.equal(row.operation, 'term_lookup')
  assert.equal(row.cost_status, 'partial')
})

test('agent funnel events are derived only from state transitions', () => {
  const before = { stage: 4, goal_card: { weeklyActions: [] }, agent_v2_context: { draft: null, dialogue: { focus: 'schedule' } } }
  const draft = { stage: 5, goal_card: { weeklyActions: [] }, agent_v2_context: { draft: { id: 'd1' }, brief: { period: { weeks: 12 }, areas: ['fitness'] }, dialogue: { focus: 'goals' } } }
  assert.deepEqual(deriveAgentProductEvents(before, draft, true).map(event => event.eventName), [
    'session_started', 'conversation_turn', 'goal_intake_started', 'goal_draft_created',
  ])
  const confirmed = { ...draft, goal_card: { weeklyActions: [{ title: 'run' }] }, agent_v2_context: { ...draft.agent_v2_context, draft: null } }
  assert.deepEqual(deriveAgentProductEvents(draft, confirmed).map(event => event.eventName), ['conversation_turn', 'goal_confirmed'])
})

test('product rows contain segmentation and bounded state metadata, not conversation text', () => {
  const rows = buildProductRows({
    sessionId: '00000000-0000-4000-8000-000000000001',
    sourceId: 'turn-1',
    surface: 'setup_chat',
    regionalContext,
    events: [{ eventName: 'conversation_turn', properties: { stage: 5 } }],
    occurredAt: '2026-09-15T00:00:00.000Z',
  })
  assert.equal(rows[0].properties.stage, 5)
  assert.equal('message' in rows[0].properties, false)
  assert.equal(rows[0].country_code, 'US')
})

test('metrics migration is service-only, idempotent, segmented, and keeps unknown cost nullable', () => {
  const migration = readFileSync(resolve('../supabase/migrations/0020_web_mvp_metrics.sql'), 'utf8')
  for (const table of ['web_mvp_ai_usage_events', 'web_mvp_product_events']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`))
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from anon, authenticated`))
  }
  for (const field of ['country_code', 'locale', 'currency_code', 'provider', 'estimated_cost_usd_micros', 'cost_status']) assert.match(migration, new RegExp(field))
  assert.match(migration, /unique \(session_id, source_id, call_index\)/)
  assert.match(migration, /unique \(session_id, event_name, source_id\)/)
  assert.match(migration, /estimated_cost_usd_micros bigint check \(estimated_cost_usd_micros is null/)
  assert.match(migration, /create view public\.web_mvp_ai_cost_daily/)
  assert.match(migration, /create view public\.web_mvp_funnel_daily/)
  assert.match(migration, /unpriced_calls/)
})

test('production flows emit the expected funnel events and localize streaming status', () => {
  const agent = readFileSync(resolve('../supabase/functions/onju-agent-v2/index.ts'), 'utf8')
  const plan = readFileSync(resolve('../supabase/functions/onju-plan-agent/index.ts'), 'utf8')
  const daily = readFileSync(resolve('../supabase/functions/onju-daily/index.ts'), 'utf8')
  assert.match(agent, /deriveAgentProductEvents/)
  assert.match(agent, /I'm understanding what you shared\./)
  assert.match(plan, /plan_generated/)
  assert.match(plan, /const requestedSessionId=/)
  assert.match(plan, /if\(requestedSessionId\)await persistPlanMetrics/)
  assert.match(daily, /first_action_completed/)
  assert.match(daily, /daily_checkin_completed/)
  assert.match(daily, /trial_started/)
})

test('protected plan and daily calls attach the browser session token', () => {
  const session = readFileSync(resolve('../web-mvp/src/agentSession.ts'), 'utf8')
  const planClient = readFileSync(resolve('../web-mvp/src/planAgent.ts'), 'utf8')
  const dailyClient = readFileSync(resolve('../web-mvp/src/dailyAgent.ts'), 'utf8')
  assert.match(session, /export function getAgentSessionToken/)
  assert.match(planClient, /withAgentSession\(input.sessionId,input\)/)
  assert.match(dailyClient, /withAgentSession\(String\(body.sessionId\)/)
  assert.match(session, /sessionToken: current.token/)
})
