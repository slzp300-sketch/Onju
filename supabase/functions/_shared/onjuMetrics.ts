import type { UserRegionalContext } from './onjuRegionalContext.ts'
import { anthropicPricing } from './anthropicPricing.ts'

export type ProviderName = 'openai' | 'google' | 'anthropic' | 'local' | 'unknown'
export type CostStatus = 'estimated' | 'partial' | 'unpriced'
export type TokenUsage = {
  input_tokens?: unknown
  output_tokens?: unknown
  input_tokens_details?: { cached_tokens?: unknown; cache_write_tokens?: unknown }
}
export type ProviderCall = {
  operation: string
  responseId?: string
  model: string
  usage?: TokenUsage
  retries?: number
  latencyMs?: number
  toolCalls?: number
  provider?: ProviderName
}

type Pricing = {
  version: string
  inputUsdPerMillion: number
  cachedInputUsdPerMillion: number
  outputUsdPerMillion: number
  cacheWriteUsdPerMillion?: number
}

const OPENAI_PRICING: Record<string, Pricing> = {
  'gpt-5.6-sol': {
    version: 'openai-gpt-5.6-sol-promo-2026-09-15',
    inputUsdPerMillion: 4,
    cachedInputUsdPerMillion: 0.4,
    outputUsdPerMillion: 20,
  },
  'gpt-4.1': {
    version: 'openai-gpt-4.1-2026-09-15',
    inputUsdPerMillion: 2,
    cachedInputUsdPerMillion: 0.5,
    outputUsdPerMillion: 8,
  },
  'gpt-4o-mini': {
    version: 'openai-gpt-4o-mini-2026-09-15',
    inputUsdPerMillion: 0.15,
    cachedInputUsdPerMillion: 0.075,
    outputUsdPerMillion: 0.6,
  },
}

const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) => {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.min(maximum, Math.trunc(parsed))) : 0
}

const canonicalModel = (model: string) => {
  const value = model.trim().toLowerCase()
  if (/^gpt-5\.6-sol(?:-\d{4}-\d{2}-\d{2})?$/.test(value) || /^gpt-5\.6(?:-\d{4}-\d{2}-\d{2})?$/.test(value)) return 'gpt-5.6-sol'
  // A dated snapshot may share a rate, but mini/nano/pro variants may not.
  if (/^gpt-4\.1(?:-\d{4}-\d{2}-\d{2})?$/.test(value)) return 'gpt-4.1'
  if (/^gpt-4o-mini(?:-\d{4}-\d{2}-\d{2})?$/.test(value)) return 'gpt-4o-mini'
  return value
}

export function providerForModel(model: string, specified?: ProviderName): ProviderName {
  if (specified && specified !== 'unknown') return specified
  const value = model.trim().toLowerCase()
  if (/^(gpt-|o[134](?:-|$)|text-|chatgpt-)/.test(value)) return 'openai'
  if (/^(gemini|models\/gemini)/.test(value)) return 'google'
  if (/^claude/.test(value)) return 'anthropic'
  if (/^(local|ollama|llama|mistral)/.test(value)) return 'local'
  return 'unknown'
}

export function estimateTokenCost(model: string, usage: TokenUsage | undefined, toolCalls = 0, provider?: ProviderName) {
  const inputTokens = integer(usage?.input_tokens)
  const cachedInputTokens = Math.min(inputTokens, integer(usage?.input_tokens_details?.cached_tokens))
  const outputTokens = integer(usage?.output_tokens)
  const resolvedProvider = providerForModel(model, provider)
  const claude = resolvedProvider === 'anthropic' ? anthropicPricing(model) : undefined
  const pricing: Pricing | undefined = claude ? {
    version: 'anthropic-direct-global-2026-10-23', inputUsdPerMillion: claude.input,
    cachedInputUsdPerMillion: claude.cached, cacheWriteUsdPerMillion: claude.write, outputUsdPerMillion: claude.output,
  } : resolvedProvider === 'openai' ? OPENAI_PRICING[canonicalModel(model)] : undefined
  const validTokenCount = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
  const hasUsage = validTokenCount(usage?.input_tokens) && validTokenCount(usage?.output_tokens)
  if (!pricing || !hasUsage) return {
    inputTokens, cachedInputTokens, outputTokens,
    estimatedCostUsdMicros: null,
    pricingVersion: null,
    costStatus: 'unpriced' as CostStatus,
  }
  const cacheWriteTokens = Math.min(inputTokens - cachedInputTokens, integer(usage?.input_tokens_details?.cache_write_tokens))
  const uncachedInputTokens = inputTokens - cachedInputTokens - cacheWriteTokens
  const estimatedCostUsdMicros = Math.round(
    uncachedInputTokens * pricing.inputUsdPerMillion
    + cachedInputTokens * pricing.cachedInputUsdPerMillion
    + cacheWriteTokens * (pricing.cacheWriteUsdPerMillion ?? pricing.inputUsdPerMillion)
    + outputTokens * pricing.outputUsdPerMillion,
  )
  return {
    inputTokens, cachedInputTokens, outputTokens,
    estimatedCostUsdMicros,
    pricingVersion: pricing.version,
    costStatus: (toolCalls > 0 ? 'partial' : 'estimated') as CostStatus,
  }
}

export function buildUsageRows(input: {
  sessionId: string
  sourceId: string
  turnId?: string
  surface: string
  regionalContext: UserRegionalContext
  calls: ProviderCall[]
  occurredAt?: string
}) {
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  return input.calls.map((call, callIndex) => {
    const provider = providerForModel(call.model, call.provider)
    const toolCalls = integer(call.toolCalls, 10)
    const cost = estimateTokenCost(call.model, call.usage, toolCalls, provider)
    return {
      session_id: input.sessionId,
      source_id: input.sourceId.slice(0, 160),
      turn_id: input.turnId ?? null,
      call_index: callIndex,
      surface: input.surface,
      operation: call.operation,
      provider,
      model: call.model.slice(0, 120),
      locale: input.regionalContext.locale,
      country_code: input.regionalContext.countryCode,
      currency_code: input.regionalContext.currencyCode,
      input_tokens: cost.inputTokens,
      cached_input_tokens: cost.cachedInputTokens,
      output_tokens: cost.outputTokens,
      retries: integer(call.retries, 10),
      latency_ms: integer(call.latencyMs, 2147483647),
      tool_calls: toolCalls,
      estimated_cost_usd_micros: cost.estimatedCostUsdMicros,
      pricing_version: cost.pricingVersion,
      cost_status: cost.costStatus,
      response_id: call.responseId?.slice(0, 160) || null,
      occurred_at: occurredAt,
    }
  })
}

type AgentStateLike = {
  stage?: number
  goal_card?: { weeklyActions?: unknown[] }
  agent_v2_context?: {
    draft?: unknown
    brief?: { period?: unknown; areas?: unknown[]; objectives?: unknown[] }
    dialogue?: { focus?: string }
  }
}

const confirmedGoal = (state: AgentStateLike) => Boolean(state.goal_card?.weeklyActions?.length)
const hasBrief = (state: AgentStateLike) => Boolean(
  state.agent_v2_context?.brief?.period
  || state.agent_v2_context?.brief?.areas?.length
  || state.agent_v2_context?.brief?.objectives?.length,
)

export type ProductEvent = { eventName: string; properties?: Record<string, string | number | boolean> }

export function deriveAgentProductEvents(before: AgentStateLike, after: AgentStateLike, sessionStarted = false): ProductEvent[] {
  const events: ProductEvent[] = []
  if (sessionStarted) events.push({ eventName: 'session_started' })
  events.push({ eventName: 'conversation_turn', properties: { stage: Number(after.stage ?? 0) } })
  const intakeStarted = !confirmedGoal(before) && (
    (before.agent_v2_context?.dialogue?.focus !== 'goals' && after.agent_v2_context?.dialogue?.focus === 'goals')
    || (!hasBrief(before) && hasBrief(after))
  )
  if (intakeStarted) events.push({ eventName: 'goal_intake_started' })
  if (!before.agent_v2_context?.draft && after.agent_v2_context?.draft) events.push({ eventName: 'goal_draft_created' })
  if (!confirmedGoal(before) && confirmedGoal(after)) events.push({ eventName: 'goal_confirmed' })
  return events
}

export function buildProductRows(input: {
  sessionId: string
  sourceId: string
  turnId?: string
  surface: string
  regionalContext: UserRegionalContext
  events: ProductEvent[]
  occurredAt?: string
}) {
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  return input.events.map(event => ({
    session_id: input.sessionId,
    source_id: input.sourceId.slice(0, 160),
    turn_id: input.turnId ?? null,
    event_name: event.eventName,
    surface: input.surface,
    locale: input.regionalContext.locale,
    country_code: input.regionalContext.countryCode,
    currency_code: input.regionalContext.currencyCode,
    properties: event.properties ?? {},
    occurred_at: occurredAt,
  }))
}
