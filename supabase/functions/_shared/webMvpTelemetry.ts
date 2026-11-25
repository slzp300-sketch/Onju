type Usage = {
  input_tokens?: number
  output_tokens?: number
  input_tokens_details?: { cached_tokens?: number }
}

type UsageRecord = { model?: string; usage?: Usage }

type DatabaseClient = {
  from: (table: string) => {
    upsert: (
      values: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ) => PromiseLike<{ error: unknown }>
  }
}

const pricing = [
  { prefix: 'gpt-4.1-mini', input: 0.4, cached: 0.1, output: 1.6 },
  { prefix: 'gpt-5.6-sol', input: 4, cached: 0.4, output: 20 },
  { prefix: 'gpt-5.6-terra', input: 2, cached: 0.2, output: 12 },
  { prefix: 'gpt-4.1', input: 2, cached: 0.5, output: 8 },
  { prefix: 'gpt-4o-mini', input: 0.15, cached: 0.075, output: 0.6 },
]

const finiteInteger = (value: unknown) => Number.isFinite(Number(value))
  ? Math.max(0, Math.round(Number(value)))
  : 0

export function summarizeModelUsage(records: UsageRecord[]) {
  let inputTokens = 0
  let cachedInputTokens = 0
  let outputTokens = 0
  let estimatedCostUsd = 0
  let unpricedCalls = 0
  const models = new Set<string>()

  for (const record of records) {
    const model = typeof record.model === 'string' ? record.model : ''
    const input = finiteInteger(record.usage?.input_tokens)
    const cached = Math.min(input, finiteInteger(record.usage?.input_tokens_details?.cached_tokens))
    const output = finiteInteger(record.usage?.output_tokens)
    inputTokens += input
    cachedInputTokens += cached
    outputTokens += output
    if (model) models.add(model)
    const rate = pricing.find(item => model === item.prefix || (model.startsWith(item.prefix + '-') && /^\d{4}-\d{2}-\d{2}$/.test(model.slice(item.prefix.length + 1))))
    if (!rate || typeof record.usage?.input_tokens !== 'number' || typeof record.usage?.output_tokens !== 'number'
      || !Number.isSafeInteger(record.usage.input_tokens) || !Number.isSafeInteger(record.usage.output_tokens)
      || record.usage.input_tokens < 0 || record.usage.output_tokens < 0) {
      unpricedCalls += 1
      continue
    }
    estimatedCostUsd += ((input - cached) * rate.input + cached * rate.cached + output * rate.output) / 1_000_000
  }

  return {
    models: [...models],
    model_calls: records.length,
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: unpricedCalls ? null : Number(estimatedCostUsd.toFixed(8)),
    known_token_cost_usd: Number(estimatedCostUsd.toFixed(8)),
    cost_status: unpricedCalls ? 'incomplete' : 'estimated_tokens_only',
    unpriced_calls: unpricedCalls,
  }
}

const clientNumberKeys = new Set([
  'elapsed_ms', 'existing_message_count', 'message_count', 'user_input_characters',
  'input_characters', 'plan_items', 'retries', 'previous_stage',
])
const clientBooleanKeys = new Set(['returning_session', 'server_data_deleted'])
const clientStringRules: Record<string, RegExp> = {
  visit_id: /^[0-9a-f-]{36}$/i,
  route: /^\/(?:setup|plan|today)?$/,
  exit_reason: /^(?:page_hide|home|later|completed)$/,
  error_code: /^[a-z0-9_]{2,48}$/,
  checkin_type: /^(?:morning|closing)$/,
  item_status: /^(?:completed|minimum|missed|exception)$/,
  decision: /^(?:apply|modify|dismiss)$/,
  reminder_type: /^(?:morning|closing|both)$/,
  reminder_channel: /^(?:browser|calendar)$/,
  feedback_category: /^(?:smooth|confusing|blocked)$/,
  feedback_route: /^(?:setup|plan|today)$/,
  acquisition_source: /^(?:direct|friend|community|contest|other)$/,
}

export function sanitizeClientTelemetry(metadata: unknown) {
  const source = metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {}
  const clean: Record<string, number | boolean | string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (clientNumberKeys.has(key) && Number.isFinite(Number(value))) {
      clean[key] = Math.min(86_400_000, finiteInteger(value))
    } else if (clientBooleanKeys.has(key) && typeof value === 'boolean') {
      clean[key] = value
    } else if (clientStringRules[key] && typeof value === 'string' && clientStringRules[key].test(value)) {
      clean[key] = value
    }
  }
  return clean
}

export async function recordWebMvpEvent(db: DatabaseClient, input: {
  eventId?: string
  sessionId: string
  eventName: string
  source: 'client' | 'agent' | 'plan' | 'plan_revision' | 'daily'
  stage?: number | null
  metadata?: Record<string, unknown>
}) {
  const { error } = await db.from('web_mvp_test_events').upsert({
    event_id: input.eventId ?? crypto.randomUUID(),
    session_id: input.sessionId,
    event_name: input.eventName,
    source: input.source,
    stage: Number.isInteger(input.stage) ? input.stage : null,
    metadata: input.metadata ?? {},
  }, { onConflict: 'session_id,event_id', ignoreDuplicates: true })
  if (error) throw error
}

export async function recordWebMvpEventSafely(db: DatabaseClient, input: Parameters<typeof recordWebMvpEvent>[1]) {
  try {
    await recordWebMvpEvent(db, input)
  } catch (error) {
    console.warn('web_mvp_telemetry_failed', error)
  }
}
