import { withAgentSession, pauseAgentSession } from './agentSession'
import { completeLocalSessionDeletion } from './sessionData'
import { agentRequestFailure } from './agentApiErrors'
export { getAgentSessionId, getAgentSessionToken } from './agentSession'
import { supabase } from './supabaseClient'
import type { AiDayBounds, AiScheduleBlock } from './aiSchedule'
import type { GoalCard } from './goalAgent'
import type { GeneratedPlanItem } from './planAgent'
import type { PlanItem } from './model'
import type { PlanChange } from './planRevisionAgent'
import type { DailyCheckInView, DialogueView, PendingGoalDraft } from './unifiedAgent'
import { normalizeRegionalContext, type UserRegionalContext } from './regionalContext'

export type StoredChatMessage = { id: string; role: 'user' | 'assistant'; text: string }
export type StoredBlock = AiScheduleBlock & { id: string; pending?: boolean }
export type AgentSetupState = {
  regionalContext: UserRegionalContext
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
  goalDraft?: PendingGoalDraft | null
  dialogue?: DialogueView
  dailyCheckIns?: DailyCheckInView[]
  suggestions?: string[]
  goalResponseId?: string
  generatedPlan?: GeneratedPlanItem[]
  planResponseId?: string
  pendingPlan?: PlanItem[]
  planRevisionHistory?: PlanRevisionRecord[]
  planRevisionResponseId?: string
}

export type PlanRevisionRecord = { id: string; requestedAt: string; request: string; changes: PlanChange[]; plan: PlanItem[] }

export async function loadAgentState(sessionId: string): Promise<AgentSetupState | null> {
  if (!supabase) throw new Error('서버 연결 설정을 확인해 주세요.')
  const { data, error } = await supabase.functions.invoke<{ state: null | {
    stage: number; messages: StoredChatMessage[]; blocks: StoredBlock[]; pending_blocks: StoredBlock[]; day_bounds?:AiDayBounds[]; agent_v2_context?:{draft?:PendingGoalDraft|null;dialogue?:DialogueView;dailyCheckIns?:DailyCheckInView[]}; agent_v2_suggestions?:string[]
    locale?:string; country_code?:string; time_zone?:string; currency_code?:string; week_starts_on?:0|1
    goal: string; reason: string; obstacle: string; openai_response_id?: string; goal_card:GoalCard; goal_response_id?:string; generated_plan?:GeneratedPlanItem[]; plan_response_id?:string; pending_plan?:PlanItem[]; plan_revision_history?:PlanRevisionRecord[]; plan_revision_response_id?:string
  } }>('onju-memory', { body: withAgentSession(sessionId, { action: 'load' }) })
  if (error) throw await agentRequestFailure(error, '저장된 대화를 불러오지 못했어요. 입력을 유지한 채 다시 시도해 주세요.')
  if (!data || !Object.hasOwn(data, 'state')) throw new Error('저장된 대화 응답을 확인하지 못했어요.')
  if (!data.state) return null
  return {
    regionalContext: normalizeRegionalContext({
      locale: data.state.locale,
      countryCode: data.state.country_code,
      timeZone: data.state.time_zone,
      currencyCode: data.state.currency_code,
      weekStartsOn: data.state.week_starts_on,
    }),
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
    goalDraft: data.state.agent_v2_context?.draft ?? null,
    dialogue: data.state.agent_v2_context?.dialogue,
    dailyCheckIns: data.state.agent_v2_context?.dailyCheckIns ?? [],
    suggestions: data.state.agent_v2_suggestions ?? [],
    goalResponseId: data.state.goal_response_id,
    generatedPlan: data.state.generated_plan??[],
    planResponseId: data.state.plan_response_id,
    pendingPlan: data.state.pending_plan??[],
    planRevisionHistory: data.state.plan_revision_history??[],
    planRevisionResponseId: data.state.plan_revision_response_id,
  }
}

export async function savePlanRevision(sessionId: string, input: { plan: PlanItem[]; pendingPlan: PlanItem[]; history: PlanRevisionRecord[]; responseId?: string }) {
  if (!supabase) throw new Error('서버 연결 설정을 확인해 주세요.')
  const { error } = await supabase.functions.invoke('onju-memory', { body: withAgentSession(sessionId, { action: 'save_plan_revision', ...input }) })
  if (error) throw error
}

export async function saveAgentState(sessionId: string, state: AgentSetupState) {
  if (!supabase) throw new Error('서버 연결 설정을 확인해 주세요.')
  const { error } = await supabase.functions.invoke('onju-memory', { body: withAgentSession(sessionId, { action: 'save', state }) })
  if (error) throw error
}

export async function forgetAgentMemory(sessionId: string, memoryId: string) {
  if (!supabase) throw new Error('Supabase 환경변수가 연결되지 않았어요.')
  const { data, error } = await supabase.functions.invoke<{ dialogue: DialogueView }>('onju-memory', { body: withAgentSession(sessionId, { action: 'forget_agent_memory', memoryId }) })
  if (error || !data?.dialogue) throw new Error('기억을 지우지 못했어요. 잠시 후 다시 시도해 주세요.')
  return data.dialogue
}

export async function saveAgentFeedback(sessionId: string, messageId: string, rating: -1 | 1, reason = '') {
  if (!supabase) throw new Error('서버 연결 설정을 확인해 주세요.')
  const { error } = await supabase.functions.invoke('onju-memory', { body: withAgentSession(sessionId, { action: 'save_agent_feedback', messageId, rating, reason }) })
  if (error) throw new Error('의견을 저장하지 못했어요.')
}

export async function deleteAgentSession(sessionId: string) {
  if (!supabase) throw new Error('서버 연결 설정을 확인해 주세요.')
  const body = withAgentSession(sessionId, { action: 'delete_session' }, true)
  pauseAgentSession(sessionId)
  const { data, error } = await supabase.functions.invoke<{ deleted?: boolean }>('onju-memory', { body })
  if (error || data?.deleted !== true) throw await agentRequestFailure(error, '삭제 완료를 확인하지 못했어요. 같은 삭제 요청을 다시 시도해 주세요.')
  try { completeLocalSessionDeletion(sessionId) } catch { throw new Error('local_cleanup_incomplete') }
}
