import { bindAiCostContext, createBudgetedFetch } from '../_shared/webMvpCostControl.ts'
import { sessionAccessResponse } from '../_shared/webMvpAccess.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { claimWebMvpSession, enforceWebMvpRateLimits } from '../_shared/webMvpAccess.ts'
import { recordWebMvpEventSafely, summarizeModelUsage } from '../_shared/webMvpTelemetry.ts'
import { buildWeeklyPlanRequest, validPlanSessionId, validateWeeklyPlanOutput, type DayBounds, type PlanCycleContext, type TimeBlock } from './core.ts'
import { cleanRegionalContext } from '../_shared/onjuRegionalContext.ts'
import { buildProductRows, buildUsageRows } from '../_shared/onjuMetrics.ts'

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type ModelUsage = { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } }

async function persistPlanMetrics(
  db: ReturnType<typeof createClient>,
  input: {
    sessionId: string
    sourceId: string
    regionalContext: ReturnType<typeof cleanRegionalContext>
    model: string
    modelResults: { responseId: string; model?: string; usage?: ModelUsage }[]
    itemCount: number
    warningCount: number
  },
) {
  try {
    const usageRows = buildUsageRows({
      sessionId: input.sessionId,
      sourceId: input.sourceId,
      surface: 'weekly_plan',
      regionalContext: input.regionalContext,
      calls: input.modelResults.map((call, index) => ({
        operation: index === 0 ? 'weekly_plan_generation' : 'weekly_plan_retry',
        responseId: call.responseId,
        model: call.model ?? input.model,
        usage: call.usage,
        provider: 'openai',
      })),
    })
    const usageResult = await db.from('web_mvp_ai_usage_events').upsert(usageRows, { onConflict: 'session_id,source_id,call_index', ignoreDuplicates: true })
    if (usageResult.error) throw usageResult.error
    const productRows = buildProductRows({
      sessionId: input.sessionId,
      sourceId: input.sourceId,
      surface: 'weekly_plan',
      regionalContext: input.regionalContext,
      events: [{ eventName: 'plan_generated', properties: { item_count: input.itemCount, warning_count: input.warningCount } }],
    })
    const productResult = await db.from('web_mvp_product_events').upsert(productRows, { onConflict: 'session_id,event_name,source_id', ignoreDuplicates: true })
    if (productResult.error) throw productResult.error
  } catch (metricsError) {
    console.error('onju_plan_metrics_write_failed', metricsError instanceof Error ? metricsError.message : 'unknown')
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const startedAt = Date.now()
    const apiKey = Deno.env.get('OPENAI_API_KEY')
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!apiKey || !url || !serviceKey) throw new Error('missing_environment')
    const body = await req.json()
    const requestedSessionId=validPlanSessionId(body.sessionId) ? body.sessionId : ''
    if (!requestedSessionId) return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 400, headers: jsonHeaders })
    const db = createClient(url, serviceKey, { auth: { persistSession: false } })
    const tokenHash = await claimWebMvpSession(db, requestedSessionId, body.sessionToken)
    bindAiCostContext(db, requestedSessionId, 'onju-plan-agent', body)
    const requestFetch = createBudgetedFetch(db)
    await enforceWebMvpRateLimits(db, req, tokenHash, { scope: 'plan', minute: 6, day: 30 })
    const regionalContext = cleanRegionalContext(body.regionalContext)
    const goal = body.goalCard ?? {}
    const schedule: TimeBlock[] = Array.isArray(body.scheduleBlocks) ? body.scheduleBlocks.slice(0, 100) : []
    const dayBounds: DayBounds[] = Array.isArray(body.dayBounds) ? body.dayBounds.slice(0, 14) : []
    const cycleContext: PlanCycleContext = body.cycleContext && typeof body.cycleContext === 'object' ? body.cycleContext : {}
    if (!goal.outcome || !Array.isArray(goal.weeklyActions) || goal.weeklyActions.length === 0) return new Response(JSON.stringify({ error: 'goal_card_incomplete' }), { status: 400, headers: jsonHeaders })
    const model = Deno.env.get('ONJU_PLAN_MODEL') || 'gpt-4o-mini'
    const modelResults: { responseId: string; model?: string; usage?: ModelUsage }[] = []
    let validated: ReturnType<typeof validateWeeklyPlanOutput> | null = null
    let result: Record<string, unknown> | null = null
    let previousItems: unknown[] = []
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const requestBody = buildWeeklyPlanRequest({
        model,
        goal,
        schedule,
        dayBounds,
        regionalContext: { locale: regionalContext.locale, timeZone: regionalContext.timeZone, countryCode: regionalContext.countryCode, weekStartsOn: regionalContext.weekStartsOn },
        cycleContext,
        ...(validated?.issues.length ? { validationFeedback: validated.issues, previousItems } : {}),
      })
      let attemptResult: Record<string, unknown> | undefined
      {
        const response = await requestFetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Client-Request-Id': crypto.randomUUID() },
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(45000),
        })
        if (!response.ok) throw new Error(`openai_${response.status}`)
        attemptResult = await response.json()
        result = attemptResult
      }
      modelResults.push({ responseId: result.id as string, model: typeof result.model === 'string' ? result.model : model, usage: result.usage as ModelUsage | undefined })
      const outputText = Array.isArray(result.output)
        ? result.output.flatMap((item: { content?: { type: string; text?: string }[] }) => item.content ?? []).find((part: { type: string }) => part.type === 'output_text')?.text
        : ''
      if (!outputText || typeof result.id !== 'string') throw new Error('no_structured_output')
      const parsed = JSON.parse(outputText) as Record<string, unknown>
      previousItems = Array.isArray(parsed.items) ? parsed.items : []
      validated = validateWeeklyPlanOutput(parsed, schedule, dayBounds, goal, cycleContext)
      if (!validated.issues.length) break
    }
    if (!result || !validated) throw new Error('weekly_plan_validation_failed')
    if (validated.issues.length) {
      return new Response(JSON.stringify({ error: 'weekly_plan_validation_failed', issues: validated.issues.slice(0, 12) }), { status: 422, headers: jsonHeaders })
    }
    await recordWebMvpEventSafely(db, {
      eventId: uuid.test(body.requestId ?? '') ? body.requestId : undefined,
      sessionId: requestedSessionId,
      eventName: 'weekly_plan_generated',
      source: 'plan',
      stage: 5,
      metadata: {
        duration_ms: Date.now() - startedAt,
        plan_items: validated.items.length,
        rejected_items: validated.rejected.length,
        warning_count: validated.warnings.length,
        cycle_week: validated.items[0]?.weekIndex ?? 1,
        progression_advanced: cycleContext.advanceProgression === true,
        ...summarizeModelUsage(modelResults),
      },
    })
    const sourceId = result.id as string
    if(requestedSessionId)await persistPlanMetrics(db, { sessionId: requestedSessionId, sourceId, regionalContext, model, modelResults, itemCount: validated.items.length, warningCount: validated.warnings.length })
    return new Response(JSON.stringify({
      assistant_message: validated.assistant_message,
      items: validated.items,
      project_plan: validated.projectPlan,
      warnings: validated.warnings,
      response_id: result.id,
    }), { headers: jsonHeaders })
  } catch (error) {
    const accessFailure = sessionAccessResponse(error, jsonHeaders)
    if (accessFailure) return accessFailure
    console.error(error)
    const diagnosticCodes = ['weekly_plan_validation_failed', 'no_structured_output', 'openai_400', 'openai_429', 'openai_500', 'openai_502', 'openai_503', 'openai_504']
    const code = error instanceof Error && ['invalid_session_token', 'session_forbidden', 'rate_limited', 'public_budget_exhausted', ...diagnosticCodes].includes(error.message) ? error.message : 'onju_plan_agent_failed'
    const status = code === 'rate_limited' || code === 'openai_429' || code === 'public_budget_exhausted' ? 429 : code === 'session_forbidden' ? 403 : code === 'invalid_session_token' ? 400 : diagnosticCodes.includes(code) ? 502 : 500
    return new Response(JSON.stringify({ error: code }), { status, headers: jsonHeaders })
  }
})
