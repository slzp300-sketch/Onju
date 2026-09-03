import { createClient } from '@supabase/supabase-js'
import type { AiScheduleBlock } from './aiSchedule'
import type { GoalCard } from './goalAgent'

export type GeneratedPlanItem={dayIndex:number;start:string;end:string;title:string;tinyStart:string;fallback:string;rationale:string}
export type PlanAgentResult={assistant_message:string;items:GeneratedPlanItem[];warnings:string[];response_id:string}
const url=import.meta.env.VITE_SUPABASE_URL as string|undefined
const anonKey=import.meta.env.VITE_SUPABASE_ANON_KEY as string|undefined
const supabase=url&&anonKey?createClient(url,anonKey):null

export async function generateWeeklyPlan(input:{goalCard:GoalCard;scheduleBlocks:AiScheduleBlock[]}){
 if(!supabase)throw new Error('Supabase 환경변수가 연결되지 않았어요.')
 const{data,error}=await supabase.functions.invoke<PlanAgentResult>('onju-plan-agent',{body:input})
 if(error||!data)throw new Error('주간 계획 에이전트에 연결할 수 없어요.')
 return data
}
