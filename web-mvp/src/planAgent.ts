import { supabase } from './supabaseClient'
import type { AiDayBounds, AiScheduleBlock } from './aiSchedule'
import type { GoalCard } from './goalAgent'
import type { UserRegionalContext } from './regionalContext'
import { translator } from './i18n'
import { withAgentSession } from './agentSession'
import { agentRequestFailure } from './agentApiErrors'

export type GeneratedPlanItem={dayIndex:number;start:string;end:string;title:string;tinyStart:string;fallback:string;rationale:string}
export type PlanAgentResult={assistant_message:string;items:GeneratedPlanItem[];warnings:string[];response_id:string}
export async function generateWeeklyPlan(input:{sessionId:string;goalCard:GoalCard;scheduleBlocks:AiScheduleBlock[];dayBounds:AiDayBounds[];regionalContext:UserRegionalContext}){
 const t=translator(input.regionalContext)
 if(!supabase)throw new Error(t('api.supabaseMissing'))
 const{data,error}=await supabase.functions.invoke<PlanAgentResult>('onju-plan-agent',{body:withAgentSession(input.sessionId,input)})
 if(error||!data)throw await agentRequestFailure(error,t('api.planUnavailable'),input.regionalContext.locale)
 return data
}
