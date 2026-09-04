import { createClient } from '@supabase/supabase-js'
import type { AiScheduleBlock } from './aiSchedule'
import type { GoalExecution } from '../../supabase/functions/onju-agent-v2/goalExecution'

export type GoalCategory='일·커리어'|'자기계발·공부'|'건강·운동'|'신앙'|'생활관리'|'관계·가족'|'취미·창작'|'기타'
export type WeeklyAction={title:string;frequencyPerWeek:number;durationMinutes:number;preferredDays:number[]}
export type GoalCard={
  execution?:GoalExecution
  category:GoalCategory;outcome:string;identity:string;durationWeeks:number;deadline:string
  baselineMetric:string;targetMetric:string;weeklyActions:WeeklyAction[];tinyStart:string
  cue:string;environment:string;fallbackAction:string;recoveryRule:string;reviewCycle:string
}
export type GoalAgentResult={assistant_message:string;goal_card:GoalCard;missing_fields:string[];ready_for_confirmation:boolean;suggestions:string[];response_id:string}

export const emptyGoalCard:GoalCard={category:'기타',outcome:'',identity:'',durationWeeks:0,deadline:'',baselineMetric:'',targetMetric:'',weeklyActions:[],tinyStart:'',cue:'',environment:'',fallbackAction:'',recoveryRule:'두 번 연속 놓치지 않기',reviewCycle:'매주 실행률 확인 · 4주마다 조정'}

// Start with an agreed outcome and actionable routine. Optional coaching fields
// and an unknown baseline must not turn planning into an eleven-question form.
export function canGenerateGoalPlan(card?: GoalCard) {
  return Boolean(card?.outcome?.trim() && card.targetMetric?.trim() && card.durationWeeks > 0 &&
    card.weeklyActions?.length && card.weeklyActions.every(action => action.title?.trim() &&
      action.frequencyPerWeek > 0 && action.frequencyPerWeek <= 7 && action.durationMinutes > 0))
}

const url=import.meta.env.VITE_SUPABASE_URL as string|undefined
const anonKey=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined
const supabase=url&&anonKey?createClient(url,anonKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}):null

export async function designGoal(input:{message:string;goalCard:GoalCard;scheduleBlocks:AiScheduleBlock[];previousResponseId?:string}){
  if(!supabase)throw new Error('Supabase 환경변수가 연결되지 않았어요.')
  const{data,error}=await supabase.functions.invoke<GoalAgentResult>('onju-goal-agent',{body:input})
  if(error||!data)throw new Error('목표 설계 에이전트에 연결할 수 없어요.')
  return data
}
