import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const jsonHeaders = { ...corsHeaders, 'Content-Type': 'application/json' }
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

    if (body.action === 'load') {
      const { data, error } = await supabase
        .from('web_mvp_agent_sessions')
        .select('stage,messages,blocks,pending_blocks,goal,reason,obstacle,openai_response_id,goal_card,goal_response_id,generated_plan,plan_response_id,updated_at')
        .eq('session_id', body.sessionId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle()
      if (error) throw error
      return new Response(JSON.stringify({ state: data }), { headers: jsonHeaders })
    }

    if (body.action === 'save') {
      const state = body.state ?? {}
      const payload = {
        session_id: body.sessionId,
        stage: Math.max(0, Math.min(4, Number.isInteger(state.stage) ? state.stage : 0)),
        messages: cleanArray(state.messages, 100),
        blocks: cleanArray(state.blocks, 100),
        pending_blocks: cleanArray(state.pendingBlocks, 30),
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
      const { error } = await supabase.from('web_mvp_agent_sessions').upsert(payload, { onConflict: 'session_id' })
      if (error) throw error
      return new Response(JSON.stringify({ saved: true }), { headers: jsonHeaders })
    }

    return new Response(JSON.stringify({ error: 'invalid_action' }), { status: 400, headers: jsonHeaders })
  } catch (error) {
    console.error(error)
    return new Response(JSON.stringify({ error: 'onju_memory_failed' }), { status: 500, headers: jsonHeaders })
  }
})
