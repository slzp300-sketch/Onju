import { sha256 } from './webMvpAccess.ts'
import { ANTHROPIC_PRICING } from './anthropicPricing.ts'
import { LlmProviderTransportError, safeProviderDiagnostic, type LlmProviderDiagnostic, type LlmProviderResponse } from './llmGateway.ts'

type Database = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }
type Scope = 'public' | 'evaluation'
type Context = { sessionId: string; surface: string; body: Record<string, unknown>; scope: Scope; index: number; halted?: string }
const contexts = new WeakMap<Database, Context>()
const env = (name: string) => Deno.env.get(name)

// Retain the configured models/rates. Price additions require an explicit review.
// Exact names and dated snapshots only: gpt-4.1-mini is NOT gpt-4.1.
const rates = [
  ...Object.entries(ANTHROPIC_PRICING).map(([name, rate]) => ({ name, ...rate })),
  { name: 'gpt-5.6-sol', input: 4, cached: .4, write: 5, output: 20, max: 128000 },
  { name: 'gpt-5.6-terra', input: 2, cached: .2, write: 2.5, output: 12, max: 128000 },
  { name: 'gpt-4.1', input: 2, cached: .5, write: 2, output: 8, max: 32768 },
  { name: 'gpt-4.1-mini', input: .4, cached: .1, write: .4, output: 1.6, max: 32768 },
  { name: 'gpt-4o-mini', input: .15, cached: .075, write: .15, output: .6, max: 16384 },
  { name: 'gemini-3.8-flash', input: .75, cached: .75, write: .75, output: 3.75, max: 65536 },
  { name: 'gemini-3.5-flash-lite', input: .3, cached: .3, write: .3, output: 2.5, max: 65536 },
  { name: 'gemini-3.1-flash-lite', input: .25, cached: .25, write: .25, output: 1.5, max: 65536 },
]
const rateFor = (model: unknown) => rates.find(rate => model === rate.name || (typeof model === 'string' && new RegExp(`^${rate.name.replaceAll('.', '\\.')}-\\d{4}-\\d{2}-\\d{2}$`).test(model)))
const integer = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0
export function dailyAiBudgetMicroUsd(raw: string | undefined) {
  if (raw === undefined || raw.trim() === '') return 5_000_000
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('ai_budget_config_invalid')
  return Math.ceil(value * 1e6) // Zero explicitly pauses calls; never falls back to $5.
}
function callLimit(name: string, fallback: number) {
  const raw = env(name)
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!integer(value) || value > 10000) throw new Error('ai_budget_config_invalid')
  return value
}
export function estimateAiReservationMicroUsd(request: Record<string, unknown>) {
  const rate = rateFor(request.model)
  if (!rate) throw new Error('ai_price_unavailable')
  const output = request.max_output_tokens === undefined ? rate.max : request.max_output_tokens
  if (!integer(output) || output < 1) throw new Error('ai_budget_config_invalid')
  // Bytes cover this serialized input, NOT hidden previous-response history.
  // Chained legacy calls retain at least a conservative additional reservation.
  const input = new TextEncoder().encode(JSON.stringify(request)).length
  const tools = Array.isArray(request.tools) ? request.tools : []
  const paidTools = tools.some(tool => tool && typeof tool === 'object' && (tool as { type?: string }).type !== 'function')
  const toolReserve = paidTools ? .02 * (integer(request.max_tool_calls) && request.max_tool_calls > 0 ? request.max_tool_calls : 10) * 1e6 : 0
  const chainedReserve = request.previous_response_id ? 250000 : 0
  return Math.max(1, Math.ceil((input * Math.max(rate.input, rate.write) + output * rate.output) * 1.2 + toolReserve + chainedReserve))
}
export function estimateObservedCost(result: Record<string, unknown> | undefined, request: Record<string, unknown>) {
  const rate = rateFor(result?.model)
  const usage = result?.usage as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } } | undefined
  if (!rate || !integer(usage?.input_tokens) || !integer(usage?.output_tokens)) return null
  const cached = usage.input_tokens_details?.cached_tokens ?? 0
  const written = usage.input_tokens_details?.cache_write_tokens ?? 0
  if (!integer(cached) || !integer(written) || cached + written > usage.input_tokens) return null
  const tokenCost = Math.ceil((usage.input_tokens - cached - written) * rate.input + cached * rate.cached + written * rate.write + usage.output_tokens * rate.output)
  const tools = Array.isArray(request.tools) ? request.tools : []
  // Tool billing is not fully represented by normalized token usage. Keep the
  // reservation instead of incorrectly treating search as free.
  if (tools.some(tool => tool && typeof tool === 'object' && (tool as { type?: string }).type !== 'function')) return null
  return tokenCost
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([key, v]) => key !== 'sessionToken' && v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}
export function bindAiCostContext(db: Database, sessionId: string, surface: string, body: Record<string, unknown>, scope: Scope = 'public') {
  contexts.set(db, { sessionId, surface, body, scope, index: 0 })
}
type Envelope = { provider: string; requestId: string; ok: boolean; status: number; data?: Record<string, unknown>; retryAfter: string | null }
export function providerRetryDelay(headers: { get(name: string): string | null }, now = Date.now()) {
  const ms = headers.get('retry-after-ms')
  if (ms && Number.isFinite(Number(ms)) && Number(ms) >= 0) return Number(ms)
  const raw = headers.get('retry-after')
  if (!raw) return 0
  if (Number.isFinite(Number(raw))) return Math.max(0, Number(raw) * 1000)
  const date = Date.parse(raw)
  return Number.isFinite(date) ? Math.max(0, date - now) : 0
}
type Reservation = { state: string; id?: string; response?: Envelope }
function reportProviderFailure(provider: string, diagnostic: LlmProviderDiagnostic) {
  // Diagnostics must neither leak prompts/credentials nor interfere with cost
  // settlement. No response/error bodies or session identifiers are recorded.
  try {
    console.warn(JSON.stringify({event:'onju_provider_failure',provider:/^[a-z][a-z0-9_]{1,31}$/.test(provider)?provider:'unknown',...safeProviderDiagnostic(diagnostic)}))
  } catch { /* a logging outage must not cause another paid attempt */ }
}
async function rpc(db: Database, name: string, args: Record<string, unknown>) {
  const result = await db.rpc(name, args)
  if (result.error) throw new Error('ai_cost_store_unavailable')
  return result.data
}
export async function budgetedGenerate(db: Database, request: Record<string, unknown>, generate: () => Promise<LlmProviderResponse>): Promise<LlmProviderResponse> {
  const context = contexts.get(db)
  if (!context) throw new Error('ai_cost_context_missing')
  if (context.halted) throw new Error(context.halted)
  try { return await executeBudgetedGenerate(db, context, request, generate) } catch (error) {
    // Even a higher-level agent catch/fallback cannot bypass a cost stop by
    // calling the helper again in this request.
    context.halted = error instanceof Error ? error.message : 'ai_cost_store_unavailable'
    throw error
  }
}
async function executeBudgetedGenerate(db: Database, context: Context, request: Record<string, unknown>, generate: () => Promise<LlmProviderResponse>): Promise<LlmProviderResponse> {
  // Retrying a rejected attempt belongs to the SAME logical call. Advance only
  // after success so a lost reply after 429 -> success replays that success.
  const index = context.index
  const payloadHash = await sha256(canonical(context.body))
  const id = context.body.turnId ?? context.body.requestId ?? payloadHash
  const callKey = await sha256(`${context.surface}:${String(id)}:${index}`)
  const limitName = context.scope === 'evaluation' ? 'ONJU_EVALUATION_DAILY_BUDGET_USD' : 'ONJU_PUBLIC_DAILY_BUDGET_USD'
  const daily = dailyAiBudgetMicroUsd(env(limitName))
  const sessionRaw = env(context.scope === 'evaluation' ? 'ONJU_EVALUATION_SESSION_DAILY_BUDGET_USD' : 'ONJU_SESSION_DAILY_BUDGET_USD')
  let sessionLimit = sessionRaw === undefined ? daily : dailyAiBudgetMicroUsd(sessionRaw)
  // An evaluator may only LOWER its owned session's cap. Every provider
  // attempt (including fallbacks/retries) uses the same atomic ledger.
  if (context.scope === 'evaluation' && context.body.evaluationBudgetUsd !== undefined) {
    const cap = context.body.evaluationBudgetUsd
    if (typeof cap !== 'number' || !Number.isFinite(cap) || cap < 0) throw new Error('ai_budget_config_invalid')
    sessionLimit = Math.min(sessionLimit, daily, Math.floor(cap * 1e6))
  }
  const reserved = estimateAiReservationMicroUsd(request)
  const reservation = await rpc(db, 'web_mvp_begin_ai_call', {
    p_session_id: context.sessionId, p_scope: context.scope, p_call_key: callKey, p_payload_hash: payloadHash,
    p_reserved: reserved, p_daily_limit: daily,
    p_session_limit: sessionLimit,
    p_minute_calls: callLimit('ONJU_AI_SESSION_MINUTE_CALLS', 60),
    p_day_calls: callLimit('ONJU_AI_SESSION_DAY_CALLS', 600),
  }) as Reservation | null
  if (reservation?.state === 'replay' && reservation.response?.ok && reservation.response.data) {
    const cached = reservation.response
    context.index++
    return { ...cached, data: { ...cached.data, onju_cost_replayed: true, usage: { input_tokens: 0, output_tokens: 0 } }, headers: new Headers() }
  }
  if (reservation?.state !== 'reserved' || typeof reservation.id !== 'string') {
    const codes: Record<string, string> = { running: 'ai_request_in_progress', unknown: 'ai_outcome_unknown', changed: 'ai_request_changed', global_limit: context.scope === 'evaluation' ? 'evaluation_budget_exhausted' : 'public_budget_exhausted', session_limit: 'session_budget_exhausted', rate_limit: 'rate_limited' }
    throw new Error(codes[reservation?.state ?? ''] ?? 'ai_cost_store_unavailable')
  }
  let response: LlmProviderResponse
  try { response = await generate() } catch (error) {
    // A timeout/cancel/network error may already have incurred a charge. Do not
    // automatically retry or refund. A repeated key remains blocked for review.
    reportProviderFailure(error instanceof LlmProviderTransportError ? error.provider : 'unknown',
      error instanceof LlmProviderTransportError ? error.diagnostic : {kind:'unknown',phase:'request'})
    await rpc(db, 'web_mvp_finish_ai_call', { p_id: reservation.id, p_state: 'unknown', p_actual: null, p_response: null })
    // eslint-disable-next-line preserve-caught-error -- Raw causes can contain secrets; only the allowlisted diagnostic above may be logged.
    throw new Error('ai_outcome_unknown')
  }
  if (!response.ok || response.diagnostic) reportProviderFailure(response.provider, response.diagnostic ?? {
    kind:'http', phase:'response', status:response.status, requestId:response.requestId,
    providerRequestId:response.headers.get('x-request-id') ?? undefined,
  })
  const envelope: Envelope = { provider: response.provider, requestId: response.requestId, ok: response.ok, status: response.status, data: response.data, retryAfter: response.headers.get('retry-after') }
  const actual = response.ok ? estimateObservedCost(response.data, request) : null
  const state = response.ok && response.data ? 'completed' : response.status >= 400 && response.status < 500 ? 'rejected' : 'unknown'
  // Settlement must finish before output reaches downstream mutation code.
  // Persisted response enables recovery after a lost HTTP reply, without a new bill.
  const settled = await rpc(db, 'web_mvp_finish_ai_call', { p_id: reservation.id, p_state: state, p_actual: actual, p_response: state === 'completed' ? envelope : null })
  if (settled !== true) throw new Error('ai_cost_store_unavailable')
  if (state === 'unknown') throw new Error('ai_outcome_unknown')
  if (state === 'completed') context.index++
  if (!response.ok && (response.status === 401 || response.status === 403 || ['insufficient_quota','billing_hard_limit_reached','billing_not_active','quota_exceeded'].includes(response.errorCode ?? ''))) throw new Error('ai_provider_action_required')
  if (!response.ok) {
    const delay = providerRetryDelay(response.headers)
    if (delay > 12000) throw new Error('ai_provider_deferred')
    // All endpoint retry loops must wait at least the provider's hint; their
    // existing bounded exponential backoff is additional, never a shorter cap.
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
  }
  return response
}

export function createBudgetedFetch(db: Database) {
  return async (url: string, init: RequestInit): Promise<Response> => {
    if (url !== 'https://api.openai.com/v1/responses' || typeof init.body !== 'string') throw new Error('ai_cost_context_missing')
    const request = JSON.parse(init.body) as Record<string, unknown>
    const response = await budgetedGenerate(db, request, async () => {
      const result = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(45000) })
      const data = result.ok ? await result.json() as Record<string, unknown> : undefined
      const failure = result.ok ? undefined : await result.json().catch(() => undefined)
      return { provider: 'openai', requestId: result.headers.get('x-request-id') ?? '', ok: result.ok, status: result.status, data, errorCode: typeof failure?.error?.code === 'string' ? failure.error.code : undefined, headers: result.headers }
    })
    return new Response(JSON.stringify(response.data ?? {}), { status: response.status, headers: { 'Content-Type': 'application/json', ...(response.headers.get('retry-after') ? { 'Retry-After': response.headers.get('retry-after')! } : {}) } })
  }
}
