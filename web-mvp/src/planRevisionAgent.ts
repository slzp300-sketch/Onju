import { createClient } from '@supabase/supabase-js'
import type { AiScheduleBlock } from './aiSchedule'
import type { GoalCard } from './goalAgent'
import type { PlanItem } from './model'

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

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null

export async function reviseWeeklyPlan(input: {
  message: string
  currentPlan: PlanItem[]
  scheduleBlocks: AiScheduleBlock[]
  goalCard: GoalCard
  previousResponseId?: string
}) {
  if (!supabase) throw new Error('Supabase 환경변수가 연결되지 않았어요.')
  const { data, error } = await supabase.functions.invoke<PlanRevisionResult>('onju-plan-revision-agent', { body: input })
  if (error || !data) throw new Error('계획 수정 에이전트에 연결할 수 없어요.')
  return data
}
