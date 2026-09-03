import { createClient } from '@supabase/supabase-js'
import type { AiDayBounds, AiScheduleBlock } from './aiSchedule'
import type { GoalCard } from './goalAgent'

export type UnifiedAgentResult = {
  assistant_message: string
  suggestions: string[]
  needs_clarification: boolean
  response_id?: string
  state: {
    stage: number
    blocks: AiScheduleBlock[]
    dayBounds: AiDayBounds[]
    goalCard: GoalCard
  }
}

const url=import.meta.env.VITE_SUPABASE_URL as string|undefined
const key=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined
const supabase=url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null

export async function talkToOnju(sessionId:string,message:string){
  if(!supabase)throw new Error('Supabase 환경변수가 연결되지 않았어요.')
  const {data,error}=await supabase.functions.invoke<UnifiedAgentResult>('onju-agent-v2',{body:{sessionId,message}})
  if(error||!data)throw new Error('통합 온주 에이전트에 연결할 수 없어요.')
  return data
}
