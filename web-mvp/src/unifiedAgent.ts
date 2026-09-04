import { createClient } from '@supabase/supabase-js'
import type { AiDayBounds, AiScheduleBlock } from './aiSchedule'
import type { GoalCard } from './goalAgent'
type GoalChange = { label: string; before: string; after: string }
export type PendingGoalDraft = { id: string; card: GoalCard; presentedMessageId: string; changes?:GoalChange[]; baseLabel?:string; related?:{card:GoalCard;changes:GoalChange[];reason:string}; notes?:string[] }

export type UnifiedAgentResult = {
  assistant_message: string
  assistant_message_id?: string
  suggestions: string[]
  needs_clarification: boolean
  response_id?: string
  state: {
    stage: number
    blocks: AiScheduleBlock[]
    dayBounds: AiDayBounds[]
    goalCard: GoalCard
    goalDraft: PendingGoalDraft | null
  }
}

const url=import.meta.env.VITE_SUPABASE_URL as string|undefined
const key=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined
const supabase=url&&key?createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null

export async function talkToOnju(sessionId:string,message:string,confirmation?:{draftId:string;includeRelated?:boolean}){
  if(!supabase)throw new Error('Supabase 환경변수가 연결되지 않았어요.')
  const {data,error}=await supabase.functions.invoke<UnifiedAgentResult>('onju-agent-v2',{body:{sessionId,message,confirmation}})
  if(error){
    const failure = error.context instanceof Response ? await error.context.clone().json().catch(() => null) : null
    if(failure?.error==='openai_429')throw new Error('요청이 잠시 몰렸어요. 1분 정도 후 다시 시도해 주세요.')
    if(failure?.error==='draft_changed')throw new Error('온주의 초안이 바뀌었어요. 새로고침한 뒤 최신 초안을 확인해 주세요.')
    if(failure?.error==='session_changed')throw new Error('온주 대화가 다른 화면에서 바뀌었어요. 새로고침한 뒤 이어서 이야기해 주세요.')
    throw new Error('온주에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
  if(!data)throw new Error('온주 응답을 받지 못했어요. 다시 시도해 주세요.')
  return data
}
