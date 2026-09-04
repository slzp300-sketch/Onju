import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { loadState, runAgentTurn } from './agent.ts'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const headers = { ...cors, 'Content-Type': 'application/json' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const apiKey = Deno.env.get('OPENAI_API_KEY'), url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!apiKey || !url || !key) throw new Error('missing_environment')
    const body = await req.json()
    if (!uuid.test(body.sessionId ?? '') || typeof body.message !== 'string' || !body.message.trim()) return new Response(JSON.stringify({ error: 'invalid_request' }), { status: 400, headers })
    const db = createClient(url, key, { auth: { persistSession: false } })
    const { data, error } = await db.from('web_mvp_agent_sessions').select('*').eq('session_id', body.sessionId).gt('expires_at', new Date().toISOString()).maybeSingle()
    if (error) throw error
    const result = await runAgentTurn(loadState(data), body.message, {
      now: new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'full', timeStyle: 'short' }).format(new Date()),
      model: Deno.env.get('ONJU_AGENT_MODEL') || 'gpt-4.1-2025-04-14',
      request: async request => {
        const response = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal: AbortSignal.timeout(45000) })
        if (!response.ok) throw new Error(`openai_${response.status}`)
        return response.json()
      },
    }, body.confirmation)
    const state = result.state
    const payload = {
      session_id: body.sessionId, ...state, pending_blocks: [], goal: state.goal_card.outcome, reason: state.goal_card.identity, obstacle: state.goal_card.recoveryRule,
      agent_v2_response_id: result.response_id || data?.agent_v2_response_id,
      agent_v2_events: [...(data?.agent_v2_events ?? []), ...result.events].slice(-200), agent_v2_suggestions: result.suggestions, agent_v2_version: 3,
      updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 2592e6).toISOString(),
    }
    const saved = data
      ? await db.from('web_mvp_agent_sessions').update(payload).eq('session_id', body.sessionId).eq('updated_at', data.updated_at).select('session_id').maybeSingle()
      : await db.from('web_mvp_agent_sessions').insert(payload).select('session_id').maybeSingle()
    const saveError = saved.error
    if ((!saveError && !saved.data) || saveError?.code === '23505') throw new Error('session_changed')
    if (saveError) throw saveError
    return new Response(JSON.stringify({
      assistant_message: result.assistant_message, assistant_message_id: state.messages.at(-1)?.id, suggestions: result.suggestions, needs_clarification: result.needs_clarification, response_id: result.response_id,
      diagnostics: { model: result.events.find(e => e.tool === 'model_usage')?.model, calls: result.events.filter(e => e.tool === 'model_usage').length },
      state: { stage: state.stage, blocks: state.blocks, dayBounds: state.day_bounds, goalCard: state.goal_card, goalDraft: state.agent_v2_context.draft },
    }), { headers })
  } catch (error) {
    console.error(error)
    const code = error instanceof Error && /^(openai_\d{3}|no_final_text|draft_changed|session_changed)$/.test(error.message) ? error.message : 'onju_agent_v2_failed'
    return new Response(JSON.stringify({ error: code }), { status: code.endsWith('_changed') ? 409 : 500, headers })
  }
})
