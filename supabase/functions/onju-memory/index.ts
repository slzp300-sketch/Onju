import { claimWebMvpSession, deleteOwnedWebMvpSession, sessionAccessResponse } from '../_shared/webMvpAccess.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { exportOwnedWebMvpSession } from '../_shared/webMvpDataControls.ts'
import { forgetMemory, loadDialogue, publicDialogue } from '../onju-agent-v2/dialogue.ts'
import { cleanRegionalContext, regionalColumns } from '../_shared/onjuRegionalContext.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function cleanText(value: unknown, max = 1000) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

function cleanArray(value: unknown, max: number) {
  return Array.isArray(value) ? value.slice(-max) : []
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !serviceKey) throw new Error('Supabase service environment is unavailable')
    const body = await req.json()
    if (!uuidPattern.test(body.sessionId ?? '')) {
      return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 400, headers: jsonHeaders })
    }
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })
    if (body.action === 'export_session') {
      const snapshot = await exportOwnedWebMvpSession(supabase, body.sessionId, body.sessionToken)
      return new Response(JSON.stringify({ snapshot }), { headers: { ...jsonHeaders, 'Cache-Control': 'no-store' } })
    }
    if (body.action === 'delete_session') {
      await deleteOwnedWebMvpSession(supabase, body.sessionId, body.sessionToken)
      return new Response(JSON.stringify({ deleted: true }), { headers: jsonHeaders })
    }
    await claimWebMvpSession(supabase, body.sessionId, body.sessionToken)

    if (body.action === 'load') {
      const { data, error } = await supabase
        .from('web_mvp_agent_sessions')
        .select('stage,messages,blocks,pending_blocks,day_bounds,goal,reason,obstacle,openai_response_id,goal_card,goal_response_id,generated_plan,plan_response_id,pending_plan,plan_revision_history,plan_revision_response_id,agent_v2_context,agent_v2_suggestions,locale,country_code,time_zone,currency_code,week_starts_on,updated_at')
        .eq('session_id', body.sessionId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (error) throw error
      return new Response(JSON.stringify({ state: data }), { headers: jsonHeaders })
    }

    if (body.action === 'save') {
      const state = body.state ?? {}
      const regionalContext = cleanRegionalContext(state.regionalContext)
      const { data: current, error: loadError } = await supabase.from('web_mvp_agent_sessions')
        .select('goal_card,goal,reason,obstacle,agent_v2_context,updated_at').eq('session_id', body.sessionId).maybeSingle()
      if (loadError) throw loadError
      if (!current) throw new Error('session_not_found')
      // Accepted conversations are server-managed, never replaced by a stale tab.
      if (Number(current.agent_v2_context?.version) >= 3) {
        return new Response(JSON.stringify({ saved: true, serverManaged: true }), { headers: jsonHeaders })
      }
      const payload: Record<string, unknown> = {
        session_id: body.sessionId,
        ...regionalColumns(regionalContext),
        stage: Math.max(0, Math.min(5, Number.isInteger(state.stage) ? state.stage : 0)),
        messages: cleanArray(state.messages, 100),
        blocks: cleanArray(state.blocks, 100),
        pending_blocks: cleanArray(state.pendingBlocks, 30),
        day_bounds: cleanArray(state.dayBounds, 14),
        goal: cleanText(state.goal),
        reason: cleanText(state.reason),
        obstacle: cleanText(state.obstacle),
        openai_response_id: cleanText(state.responseId, 200) || null,
        goal_card: typeof state.goalCard === 'object' && state.goalCard ? state.goalCard : {},
        goal_response_id: cleanText(state.goalResponseId, 200) || null,
        generated_plan: cleanArray(state.generatedPlan, 14),
        plan_response_id: cleanText(state.planResponseId, 200) || null,
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }
      // Autosave must not bypass or undo server-side proposal confirmation.
      if (Number(current?.agent_v2_context?.version) >= 3) {
        for (const key of ['goal_card', 'goal', 'reason', 'obstacle']) delete payload[key]
      }
      const { data: saved, error } = await supabase.from('web_mvp_agent_sessions').update(payload).eq('session_id', body.sessionId).eq('updated_at', current.updated_at).select('session_id').maybeSingle()
      if (error) throw error
      if (!saved) throw new Error('session_changed')
      return new Response(JSON.stringify({ saved: true }), { headers: jsonHeaders })
    }

    if (body.action === 'forget_agent_memory') {
      if (!uuidPattern.test(body.memoryId ?? '')) return new Response(JSON.stringify({ error: 'invalid_memory' }), { status: 400, headers: jsonHeaders })
      const { data: current, error: loadError } = await supabase.from('web_mvp_agent_sessions')
        .select('agent_v2_context,updated_at').eq('session_id', body.sessionId).gt('expires_at', new Date().toISOString()).maybeSingle()
      if (loadError) throw loadError
      if (!current) return new Response(JSON.stringify({ error: 'session_not_found' }), { status: 404, headers: jsonHeaders })
      const context = typeof current.agent_v2_context === 'object' && current.agent_v2_context ? structuredClone(current.agent_v2_context) : {}
      context.dialogue = forgetMemory(loadDialogue(context.dialogue), body.memoryId)
      const updatedAt = new Date().toISOString()
      const { data: saved, error: saveError } = await supabase.from('web_mvp_agent_sessions')
        .update({ agent_v2_context: context, updated_at: updatedAt }).eq('session_id', body.sessionId).eq('updated_at', current.updated_at).select('session_id').maybeSingle()
      if (saveError) throw saveError
      if (!saved) return new Response(JSON.stringify({ error: 'session_changed' }), { status: 409, headers: jsonHeaders })
      return new Response(JSON.stringify({ dialogue: publicDialogue(context.dialogue) }), { headers: jsonHeaders })
    }

    if (body.action === 'save_agent_feedback') {
      if (!uuidPattern.test(body.messageId ?? '') || ![-1, 1].includes(body.rating)) return new Response(JSON.stringify({ error: 'invalid_feedback' }), { status: 400, headers: jsonHeaders })
      const { data: current, error: loadError } = await supabase.from('web_mvp_agent_sessions')
        .select('agent_v2_context,updated_at').eq('session_id', body.sessionId).gt('expires_at', new Date().toISOString()).maybeSingle()
      if (loadError) throw loadError
      if (!current) return new Response(JSON.stringify({ error: 'session_not_found' }), { status: 404, headers: jsonHeaders })
      const context = typeof current.agent_v2_context === 'object' && current.agent_v2_context ? structuredClone(current.agent_v2_context) : {}
      const feedback = Array.isArray(context.feedback) ? context.feedback : []
      const record = { messageId: body.messageId, rating: body.rating, reason: cleanText(body.reason, 240), createdAt: new Date().toISOString() }
      context.feedback = [...feedback.filter((item: { messageId?: string }) => item?.messageId !== body.messageId), record].slice(-100)
      const updatedAt = new Date().toISOString()
      const { data: saved, error: saveError } = await supabase.from('web_mvp_agent_sessions')
        .update({ agent_v2_context: context, updated_at: updatedAt }).eq('session_id', body.sessionId).eq('updated_at', current.updated_at).select('session_id').maybeSingle()
      if (saveError) throw saveError
      if (!saved) return new Response(JSON.stringify({ error: 'session_changed' }), { status: 409, headers: jsonHeaders })
      return new Response(JSON.stringify({ saved: true, feedback: record }), { headers: jsonHeaders })
    }

    if (body.action === 'save_plan_revision') {
      const payload = {
        session_id: body.sessionId,
        generated_plan: cleanArray(body.plan, 14),
        pending_plan: cleanArray(body.pendingPlan, 14),
        plan_revision_history: cleanArray(body.history, 50),
        plan_revision_response_id: cleanText(body.responseId, 200) || null,
        updated_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }
      const { data: saved, error } = await supabase.from('web_mvp_agent_sessions').update(payload).eq('session_id', body.sessionId).select('session_id').maybeSingle()
      if (error) throw error
      if (!saved) throw new Error('session_changed')
      return new Response(JSON.stringify({ saved: true }), { headers: jsonHeaders })
    }

    return new Response(JSON.stringify({ error: 'invalid_action' }), { status: 400, headers: jsonHeaders })
  } catch (error) {
    const accessFailure = sessionAccessResponse(error, jsonHeaders)
    if (accessFailure) return accessFailure
    console.error(error)
    return new Response(JSON.stringify({ error: 'onju_memory_failed' }), { status: 500, headers: jsonHeaders })
  }
})
