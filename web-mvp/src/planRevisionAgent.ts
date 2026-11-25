import { withAgentSession } from './agentSession'
import { agentRequestFailure } from './agentApiErrors'
import { supabase } from './supabaseClient'
import type { AiScheduleBlock } from './aiSchedule'
import type { GoalCard } from './goalAgent'
import type { PlanItem } from './model'
import type { UserRegionalContext } from './regionalContext'
import { translator } from './i18n'

export type PlanChange = {
  type: 'add' | 'move' | 'resize' | 'remove' | 'edit'
  summary: string
  before: string
  after: string
}

export type PlanRevisionResult = {
  assistant_message: string
  proposed_plan: PlanItem[]
  changes: PlanChange[]
  warnings: string[]
  needs_clarification: boolean
  response_id: string
}

export async function reviseWeeklyPlan(input: {
  sessionId: string;
  message: string
  currentPlan: PlanItem[]
  scheduleBlocks: AiScheduleBlock[]
  goalCard: GoalCard
  previousResponseId?: string
  regionalContext: UserRegionalContext
}) {
  const t = translator(input.regionalContext)
  if (!supabase) throw new Error(t('api.supabaseMissing'))
  const { data, error } = await supabase.functions.invoke<PlanRevisionResult>('onju-plan-revision-agent', { body: withAgentSession(input.sessionId, input) })
  if (error) throw await agentRequestFailure(error, t('api.revisionUnavailable'), input.regionalContext.locale)
  if (!data) throw new Error(t('api.revisionUnavailable'))
  return data
}
