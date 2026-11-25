import { getAgentSessionId, withAgentSession } from './agentSession'
import { supabase } from './supabaseClient'
import { agentRequestFailure } from './agentApiErrors'
import type { AiScheduleBlock } from './aiSchedule'
import type { GoalExecution } from '../../supabase/functions/onju-agent-v2/goalExecution'
import { loadRegionalContext, type UserRegionalContext } from './regionalContext'
import { translator } from './i18n'

export type GoalCategory='일·커리어'|'자기계발·공부'|'건강·운동'|'신앙'|'생활관리'|'관계·가족'|'취미·창작'|'기타'
export type WeeklyAction={title:string;frequencyPerWeek:number;durationMinutes:number;preferredDays:number[]}
export type GoalCard={
  execution?:GoalExecution
  category:GoalCategory;outcome:string;identity:string;durationWeeks:number;deadline:string
  baselineMetric:string;targetMetric:string;weeklyActions:WeeklyAction[];tinyStart:string
  cue:string;environment:string;fallbackAction:string;recoveryRule:string;reviewCycle:string
}
export type GoalAgentResult={assistant_message:string;goal_card:GoalCard;missing_fields:string[];ready_for_confirmation:boolean;suggestions:string[];response_id:string}

export function emptyGoalCardFor(regionalContext: UserRegionalContext): GoalCard {
  const t = translator(regionalContext)
  return {category:'기타',outcome:'',identity:'',durationWeeks:0,deadline:'',baselineMetric:'',targetMetric:'',weeklyActions:[],tinyStart:'',cue:'',environment:'',fallbackAction:'',recoveryRule:t('goal.defaultRecovery'),reviewCycle:t('goal.defaultReview')}
}

export const emptyGoalCard:GoalCard=emptyGoalCardFor(loadRegionalContext())

// Start with an agreed outcome and actionable routine. Optional coaching fields
// and an unknown baseline must not turn planning into an eleven-question form.
export function canGenerateGoalPlan(card?: GoalCard) {
  return Boolean(card?.outcome?.trim() && card.targetMetric?.trim() && card.durationWeeks > 0 &&
    card.weeklyActions?.length && card.weeklyActions.every(action => action.title?.trim() &&
      action.frequencyPerWeek > 0 && action.frequencyPerWeek <= 7 && action.durationMinutes > 0))
}

export async function designGoal(input:{message:string;goalCard:GoalCard;scheduleBlocks:AiScheduleBlock[];regionalContext:UserRegionalContext;previousResponseId?:string}){
  const t=translator(input.regionalContext)
  if(!supabase)throw new Error(t('api.supabaseMissing'))
  const{data,error}=await supabase.functions.invoke<GoalAgentResult>('onju-goal-agent',{body: withAgentSession(getAgentSessionId(), input)})
  if(error||!data)throw await agentRequestFailure(error,t('api.goalUnavailable'),input.regionalContext.locale)
  return data
}
