import { getAgentSessionId, withAgentSession } from './agentSession'
import { supabase } from './supabaseClient'
import { agentRequestFailure } from './agentApiErrors'

export type AiScheduleBlock = {
  days: number[]
  title: string
  start: string
  end: string
  kind: 'fixed' | 'variable' | 'recovery'
}
// Empty clock values are unknown, never inferred sleep boundaries.
export type AiDayBounds = { days: number[]; wake: string; bedtime: string; variable: boolean; deferred?: boolean }

export type AiScheduleResult = {
  assistant_message: string
  needs_clarification: boolean
  stage_complete: boolean
  suggestions: string[]
  day_bounds: AiDayBounds[]
  blocks: AiScheduleBlock[]
  response_id: string
}

export async function interpretSchedule(input: {
  message: string
  stage: string
  existingBlocks: AiScheduleBlock[]
  existingDayBounds: AiDayBounds[]
  previousResponseId?: string
}): Promise<AiScheduleResult> {
  if (!supabase) throw new Error('Supabase 환경변수가 연결되지 않았어요.')
  const { data, error } = await supabase.functions.invoke<AiScheduleResult>('onju-agent', { body: withAgentSession(getAgentSessionId(), input) })
  if (error) throw await agentRequestFailure(error, 'AI 일정 해석기에 연결하지 못했어요. 입력을 보존했으니 잠시 후 다시 확인해 주세요.')
  if (!data) throw new Error('AI가 빈 응답을 보냈어요. 다시 시도해 주세요.')
  return data
}
