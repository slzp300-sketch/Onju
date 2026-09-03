import { createClient } from '@supabase/supabase-js'
import type { AiDayBounds, AiScheduleBlock } from './aiSchedule'
import type { GoalCard } from './goalAgent'
import type { GeneratedPlanItem } from './planAgent'
import type { PlanItem } from './model'
import type { PlanChange } from './planRevisionAgent'

export type StoredChatMessage = { id: string; role: 'user' | 'assistant'; text: string }
export type StoredBlock = AiScheduleBlock & { id: string; pending?: boolean }
export type AgentSetupState = {
  stage: number
  messages: StoredChatMessage[]
  blocks: StoredBlock[]
  pendingBlocks: StoredBlock[]
  dayBounds: AiDayBounds[]
  goal: string
  reason: string
  obstacle: string
  responseId?: string
  goalCard: GoalCard
  goalResponseId?: string
  generatedPlan?: GeneratedPlanItem[]
  planResponseId?: string
  pendingPlan?: PlanItem[]
  planRevisionHistory?: PlanRevisionRecord[]
  planRevisionResponseId?: string
}

export type PlanRevisionRecord = { id: string; requestedAt: string; request: string; changes: PlanChange[]; plan: PlanItem[] }

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null
const sessionKey = 'onju-web-mvp-session-id'

export function getAgentSessionId() {
  const saved = localStorage.getItem(sessionKey)
  if (saved) return saved
  const created = crypto.randomUUID()
  localStorage.setItem(sessionKey, created)
  return created
}

export async function loadAgentState(sessionId: string): Promise<AgentSetupState | null> {
  if (!supabase) return null
  const { data, error } = await supabase.functions.invoke<{ state: null | {
    stage: number; messages: StoredChatMessage[]; blocks: StoredBlock[]; pending_blocks: StoredBlock[]; day_bounds?:AiDayBounds[]
    goal: string; reason: string; obstacle: string; openai_response_id?: string; goal_card:GoalCard; goal_response_id?:string; generated_plan?:GeneratedPlanItem[]; plan_response_id?:string; pending_plan?:PlanItem[]; plan_revision_history?:PlanRevisionRecord[]; plan_revision_response_id?:string
  } }>('onju-memory', { body: { action: 'load', sessionId } })
  if (error || !data?.state) return null
  return {
    stage: data.state.stage,
    messages: data.state.messages,
    blocks: data.state.blocks,
    pendingBlocks: data.state.pending_blocks,
    dayBounds: data.state.day_bounds??[],
    goal: data.state.goal,
    reason: data.state.reason,
    obstacle: data.state.obstacle,
    responseId: data.state.openai_response_id,
    goalCard: data.state.goal_card,
    goalResponseId: data.state.goal_response_id,
    generatedPlan: data.state.generated_plan??[],
    planResponseId: data.state.plan_response_id,
    pendingPlan: data.state.pending_plan??[],
    planRevisionHistory: data.state.plan_revision_history??[],
    planRevisionResponseId: data.state.plan_revision_response_id,
  }
}

export async function savePlanRevision(sessionId: string, input: { plan: PlanItem[]; pendingPlan: PlanItem[]; history: PlanRevisionRecord[]; responseId?: string }) {
  if (!supabase) return
  const { error } = await supabase.functions.invoke('onju-memory', { body: { action: 'save_plan_revision', sessionId, ...input } })
  if (error) throw error
}

export async function saveAgentState(sessionId: string, state: AgentSetupState) {
  if (!supabase) return
  const { error } = await supabase.functions.invoke('onju-memory', { body: { action: 'save', sessionId, state } })
  if (error) throw error
}
