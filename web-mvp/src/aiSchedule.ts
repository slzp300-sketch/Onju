import { createClient } from '@supabase/supabase-js'

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

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
const supabase = url && anonKey ? createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null

export async function interpretSchedule(input: {
  message: string
  stage: string
  existingBlocks: AiScheduleBlock[]
  existingDayBounds: AiDayBounds[]
  previousResponseId?: string
}): Promise<AiScheduleResult> {
  if (!supabase) throw new Error('Supabase 환경변수가 연결되지 않았어요.')
  const { data, error } = await supabase.functions.invoke<AiScheduleResult>('onju-agent', { body: input })
  if (error) throw new Error(`AI 일정 해석기 연결 오류: ${error.message}`)
  if (!data) throw new Error('AI가 빈 응답을 보냈어요. 다시 시도해 주세요.')
  return data
}
