import { bindAiCostContext, budgetedGenerate } from '../_shared/webMvpCostControl.ts'
import { sessionAccessResponse, sessionAccessFailure } from '../_shared/webMvpAccess.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { cleanRegionalContext, type UserRegionalContext } from '../_shared/onjuRegionalContext.ts'
import { buildProductRows } from '../_shared/onjuMetrics.ts'
import { advanceCheckIn, completionMessage, isCheckInType, questionFor, startCheckIn, type CheckInProgress, type CheckInRoutine, type ItemStatus } from './state.ts'
import { addCalendarDays, buildWeeklyInsights, canAssignStrongGrade, dayIndexForDate, isRoutineGrade, routineIdentity, type RoutineGrade } from './insights.ts'
import { buildStructureProposal, findStructureOption, isDependencyKind, type DependencyKind } from './structure.ts'
import { buildTrialReview } from './trialReview.ts'
import { runWeeklyReviewTurn, weeklyReviewEvidenceSignature, weeklyReviewOpening, type WeeklyReviewInsights } from './weeklyReview.ts'
import { buildWeeklyCalibration } from './weeklyCalibration.ts'
import { dailyAdaptationEvidenceSignature, fallbackDailyAdaptation, runDailyAdaptationTurn, type DailyAdaptationItem, type DailyAdaptationLog, type DailyAdaptationTarget } from './dailyAdaptation.ts'
import { buildDailyAdaptationMetrics, type DailyAdaptationDecisionMode } from './dailyAdaptationMetrics.ts'
import { claimWebMvpSession, enforceWebMvpRateLimits } from '../_shared/webMvpAccess.ts'
import { createLlmGateway, providerStatusCode, type LlmGateway } from '../_shared/llmGateway.ts'
import { createOpenAiResponsesAdapter } from '../_shared/openAiResponsesAdapter.ts'
import { appendGoalProgress } from '../onju-memory/goalProgress.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const headers = { ...cors, 'Content-Type': 'application/json' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const time = /^([01]\d|2[0-3]):[0-5]\d$/
const isoDate = /^\d{4}-\d{2}-\d{2}$/
const clean = (value: unknown, max = 500) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : ''
const cleanMessage = (value: unknown, max = 1200) => typeof value === 'string' ? value.trim().replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').slice(0, max) : ''
const routineTitle = (value: unknown) => clean(value, 180).replace(/\s*[·|]\s*\d+\s*분(?:\s*.*)?$/u, '').trim()
const regionalDate = (timeZone: string) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
const meaningfulEvidence = (value: unknown) => {
  const compact = clean(value, 500).toLocaleLowerCase('ko').replace(/[\s.,!?~。！？]/g, '')
  return compact.length >= 2 && !/^(?:완료|완료했어|완료했어요|했어|했어요|끝|끝냈어|끝냈어요|마쳤어|마쳤어요|성공)$/.test(compact)
}

type PlanInput = {
  id?: unknown
  actionIndex?: unknown
  planningStyle?: unknown
  weekIndex?: unknown
  weekStart?: unknown
  progressIndex?: unknown
  sequenceIndex?: unknown
  milestoneId?: unknown
  dependsOnSequenceIndex?: unknown
  inputArtifact?: unknown
  dayIndex?: unknown
  day?: unknown
  title?: unknown
  completionEvidence?: unknown
  fallback?: unknown
  start?: unknown
  end?: unknown
  tinyStart?: unknown
  rationale?: unknown
}

function planDayIndex(item: PlanInput) {
  if (Number.isInteger(item.dayIndex) && Number(item.dayIndex) >= 0 && Number(item.dayIndex) <= 6) return Number(item.dayIndex)
  return ['월', '화', '수', '목', '금', '토', '일'].indexOf(clean(item.day, 2))
}

function normalizedPlan(plan: unknown) {
  if (!Array.isArray(plan) || plan.length > 28) return null
  const rows = (plan as PlanInput[]).flatMap(item => {
    const sourceId = clean(item.id, 120)
    const title = clean(item.title, 160)
    const dayIndex = planDayIndex(item)
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(sourceId) || !title || dayIndex < 0) return []
    const planningStyle = item.planningStyle === 'progression' ? 'progression' : 'repeat'
    const actionIndex = Number.isInteger(item.actionIndex) ? Number(item.actionIndex) : -1
    const weekIndex = Number.isInteger(item.weekIndex) && Number(item.weekIndex) > 0 ? Number(item.weekIndex) : 1
    const progressIndex = Number.isInteger(item.progressIndex) && Number(item.progressIndex) >= 0 ? Number(item.progressIndex) : 0
    const sequenceIndex = Number.isInteger(item.sequenceIndex) && Number(item.sequenceIndex) >= 0 ? Number(item.sequenceIndex) : 0
    return [{
      session_id: '',
      source_plan_item_id: sourceId,
      routine_key: planningStyle === 'progression' && actionIndex >= 0 ? `action:${actionIndex}` : routineIdentity(title) || sourceId,
      day_index: dayIndex,
      title,
      minimum_action: clean(item.fallback, 240),
      start_time: time.test(clean(item.start, 5)) ? clean(item.start, 5) : null,
      end_time: time.test(clean(item.end, 5)) ? clean(item.end, 5) : null,
      planning_style: planningStyle,
      action_index: actionIndex,
      week_index: weekIndex,
      progress_index: progressIndex,
      sequence_index: sequenceIndex,
      milestone_id: clean(item.milestoneId, 24),
      depends_on_sequence_index: Number.isInteger(item.dependsOnSequenceIndex) && Number(item.dependsOnSequenceIndex) >= 0 ? Number(item.dependsOnSequenceIndex) : 0,
      completion_evidence: clean(item.completionEvidence, 160),
      input_artifact: clean(item.inputArtifact, 160),
    }]
  })
  return rows.length === plan.length ? rows : null
}

function clientPlanSnapshot(plan: unknown) {
  if (!normalizedPlan(plan) || !Array.isArray(plan)) return null
  return (plan as PlanInput[]).map(item => ({
    id: clean(item.id, 120),
    actionIndex: Number.isInteger(item.actionIndex) ? Number(item.actionIndex) : -1,
    planningStyle: ['repeat', 'progression'].includes(String(item.planningStyle)) ? item.planningStyle : 'unknown',
    weekIndex: Number.isInteger(item.weekIndex) ? Number(item.weekIndex) : 0,
    weekStart: isoDate.test(clean(item.weekStart, 10)) ? clean(item.weekStart, 10) : '',
    progressIndex: Number.isInteger(item.progressIndex) ? Number(item.progressIndex) : 0,
    sequenceIndex: Number.isInteger(item.sequenceIndex) ? Number(item.sequenceIndex) : 0,
    milestoneId: clean(item.milestoneId, 24),
    dependsOnSequenceIndex: Number.isInteger(item.dependsOnSequenceIndex) ? Number(item.dependsOnSequenceIndex) : 0,
    inputArtifact: clean(item.inputArtifact, 160),
    dayIndex: planDayIndex(item),
    day: ['월', '화', '수', '목', '금', '토', '일'][planDayIndex(item)],
    title: clean(item.title, 160),
    completionEvidence: clean(item.completionEvidence, 160),
    fallback: clean(item.fallback, 240),
    start: time.test(clean(item.start, 5)) ? clean(item.start, 5) : '',
    end: time.test(clean(item.end, 5)) ? clean(item.end, 5) : '',
    tinyStart: clean(item.tinyStart, 160),
    rationale: clean(item.rationale, 240),
  }))
}

function publicWeeklyReview(row: Record<string, unknown> | undefined) {
  if (!row) return null
  const stored = row.recommendation && typeof row.recommendation === 'object' ? row.recommendation as Record<string, unknown> : {}
  const messages = Array.isArray(row.messages) ? row.messages.flatMap(message => {
    if (!message || typeof message !== 'object') return []
    const item = message as Record<string, unknown>
    const role = item.role === 'user' ? 'user' : item.role === 'assistant' ? 'assistant' : null
    const text = cleanMessage(item.text, 1200)
    return role && text ? [{ role, text }] : []
  }).slice(-12) : []
  const ready = row.status === 'ready' || row.status === 'applied'
  return {
    id: row.id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    nextWeekStart: row.next_week_start,
    nextWeekEnd: row.next_week_end,
    status: ['active', 'ready', 'applied', 'dismissed'].includes(String(row.status)) ? row.status : 'active',
    revision: Number(row.revision ?? 0),
    evidenceSignature: clean(row.evidence_signature, 2000),
    messages,
    choices: Array.isArray(stored.choices) ? stored.choices.map(choice => clean(choice, 60)).filter(Boolean).slice(0, 3) : [],
    recommendation: ready ? {
      causeCategory: clean(stored.causeCategory, 40) || 'other',
      causeSummary: clean(stored.causeSummary, 180),
      strategy: clean(stored.strategy, 40) || 'keep',
      routineKey: clean(stored.routineKey, 180),
      rationale: clean(stored.rationale, 240),
      minimumAction: clean(stored.minimumAction, 120),
      fromDayIndex: Number(stored.fromDayIndex ?? -1),
      toDayIndex: Number(stored.toDayIndex ?? -1),
      preferredTime: clean(stored.preferredTime, 5),
    } : null,
    approvedAt: row.approved_at ?? null,
  }
}

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
async function requestModel(db: ReturnType<typeof createClient>, gateway: LlmGateway, request: Record<string, unknown>) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    let result: Record<string, unknown> | undefined
    {
      const response = await budgetedGenerate(db, request, () => gateway.generate(request))
      if (response.ok) {
        if (!response.data) throw new Error('no_structured_output')
        result = response.data
        return result
      }
      if (![429, 500, 502, 503, 504].includes(response.status) || attempt === 3) throw new Error(providerStatusCode(response))
      await wait(Math.min(8000, 800 * 2 ** attempt + Math.floor(Math.random() * 250)))
    }
  }
  throw new Error('openai_503')
}

function publicSession(row: Record<string, unknown>, locale = 'ko-KR') {
  const type = isCheckInType(row.check_type) ? row.check_type : 'morning'
  const step = Number(row.step ?? 0)
  const status = row.status === 'completed' ? 'completed' : 'active'
  const collected = row.collected && typeof row.collected === 'object' ? row.collected as Record<string, unknown> : {}
  const ids = Array.isArray(collected.routineIds) ? collected.routineIds : []
  const titles = Array.isArray(collected.routineTitles) ? collected.routineTitles : []
  const minimums = Array.isArray(collected.routineMinimumActions) ? collected.routineMinimumActions : []
  const styles = Array.isArray(collected.routinePlanningStyles) ? collected.routinePlanningStyles : []
  const completionEvidence = Array.isArray(collected.routineCompletionEvidence) ? collected.routineCompletionEvidence : []
  const inputArtifacts = Array.isArray(collected.routineInputArtifacts) ? collected.routineInputArtifacts : []
  const adaptiveActions = Array.isArray(collected.routineAdaptiveActions) ? collected.routineAdaptiveActions : []
  const routines: CheckInRoutine[] = ids.flatMap((id, index) => {
    const safeId = clean(id, 120), title = clean(titles[index], 80)
    return safeId && title ? [{
      id: safeId,
      title,
      minimumAction: clean(minimums[index], 160),
      planningStyle: styles[index] === 'progression' ? 'progression' : 'repeat',
      completionEvidence: clean(completionEvidence[index], 160),
      inputArtifact: clean(inputArtifacts[index], 160),
      adaptiveAction: clean(adaptiveActions[index], 240),
    }] : []
  })
  const pending = status === 'active' ? questionFor(type, step, routines, locale) : { question: '', choices: [] }
  return {
    id: row.id,
    date: row.check_date,
    type,
    status,
    step,
    collected,
    pendingQuestion: cleanMessage(row.pending_question) || pending.question,
    choices: pending.choices,
    completedAt: row.completed_at ?? null,
  }
}

async function ensurePreferences(db: ReturnType<typeof createClient>, sessionId: string, timeZone: string) {
  const { error: preferenceError } = await db.from('web_mvp_checkin_preferences').upsert({ session_id: sessionId, timezone: timeZone }, { onConflict: 'session_id', ignoreDuplicates: true })
  if (preferenceError) throw preferenceError
  const { error } = await db.from('web_mvp_checkin_preferences').update({ timezone: timeZone }).eq('session_id', sessionId)
  if (error) throw error
}

async function ensureDailyLog(db: ReturnType<typeof createClient>, sessionId: string, date: string, timeZone: string) {
  // Preserve the original date/timezone provenance, even on the same date after travel.
  const { error: insertError } = await db.from('web_mvp_daily_logs').upsert({ session_id: sessionId, log_date: date, timezone: timeZone }, { onConflict: 'session_id,log_date', ignoreDuplicates: true })
  if (insertError) throw insertError
  const { data, error } = await db.from('web_mvp_daily_logs').select('*').eq('session_id', sessionId).eq('log_date', date).single()
  if (error) throw error
  return data
}

const publicDailyAdaptation = (row: Record<string, unknown>, targetStatus: ItemStatus | null = null) => {
  const recommendation = row.recommendation && typeof row.recommendation === 'object' ? row.recommendation as Record<string, unknown> : {}
  const status = row.status === 'applied' || row.status === 'dismissed' ? row.status : 'proposed'
  const rawDecisionMode = clean(row.decision_mode, 20)
  const decisionMode: DailyAdaptationDecisionMode = ['pending', 'accepted', 'modified', 'dismissed'].includes(rawDecisionMode)
    ? rawDecisionMode as DailyAdaptationDecisionMode
    : status === 'applied' ? 'accepted' : status === 'dismissed' ? 'dismissed' : 'pending'
  const proposedAction = clean(recommendation.nextAction, 240)
  const selectedAction = clean(row.selected_action, 240)
  return {
    id: row.id,
    sourceDate: row.source_date,
    targetDate: row.target_date,
    sourcePlanItemId: clean(row.source_plan_item_id, 120),
    targetPlanItemId: clean(row.target_plan_item_id, 120),
    routineKey: clean(row.routine_key, 180),
    status,
    decisionMode,
    decisionReason: clean(row.decision_reason, 40),
    decisionNote: clean(row.decision_note, 240),
    revision: Number(row.revision ?? 0),
    evidenceSignature: clean(row.evidence_signature, 2000),
    acknowledgement: clean(recommendation.acknowledgement, 220),
    causeCategory: clean(recommendation.causeCategory, 40) || 'other',
    causeSummary: clean(recommendation.causeSummary, 180),
    strategy: clean(recommendation.strategy, 40) || 'keep',
    title: clean(recommendation.title, 120),
    proposedAction,
    nextAction: selectedAction || proposedAction,
    rationale: clean(recommendation.rationale, 240),
    minimumAction: clean(recommendation.minimumAction, 160),
    sourceTitle: clean(recommendation.sourceTitle, 160),
    sourceCompletionEvidence: clean(recommendation.sourceCompletionEvidence, 160),
    sourceInputArtifact: clean(recommendation.sourceInputArtifact, 160),
    targetTitle: clean(recommendation.targetTitle, 160),
    targetStatus,
    createdAt: row.created_at,
    appliedAt: row.applied_at ?? null,
    decidedAt: row.decided_at ?? null,
  }
}

function adaptationItem(row: Record<string, unknown>): DailyAdaptationItem {
  return {
    id: String(row.id),
    sourcePlanItemId: clean(row.source_plan_item_id, 120),
    routineKey: clean(row.routine_key, 180),
    title: clean(row.title, 160),
    dayIndex: Number(row.day_index),
    planningStyle: row.planning_style === 'progression' ? 'progression' : 'repeat',
    sequenceIndex: Number(row.sequence_index ?? 0),
    minimumAction: clean(row.minimum_action, 240),
    completionEvidence: clean(row.completion_evidence, 160),
    inputArtifact: clean(row.input_artifact, 160),
    grade: clean(row.grade, 20) || 'normal',
  }
}

async function currentDailyAdaptationSignature(
  db: ReturnType<typeof createClient>,
  sessionId: string,
  sourceDate: string,
) {
  const dayIndex = dayIndexForDate(sourceDate)
  const [items, logs, daily] = await Promise.all([
    db.from('web_mvp_routine_items').select('*').eq('session_id', sessionId),
    db.from('web_mvp_item_logs').select('routine_item_id,status,evidence_text').eq('session_id', sessionId).eq('log_date', sourceDate),
    db.from('web_mvp_daily_logs').select('energy,blocker,adjustment').eq('session_id', sessionId).eq('log_date', sourceDate).maybeSingle(),
  ])
  if (items.error || logs.error || daily.error) throw items.error ?? logs.error ?? daily.error
  const sourceItems = (items.data ?? [])
    .filter(item => item.day_index === dayIndex && item.grade !== 'excluded')
    .filter(item => (!item.activated_on || item.activated_on <= sourceDate) && (!item.deactivated_on || item.deactivated_on >= sourceDate))
    .map(adaptationItem)
  return dailyAdaptationEvidenceSignature({
    sourceDate,
    items: sourceItems,
    logs: (logs.data ?? []).map(log => ({
      routineItemId: String(log.routine_item_id),
      status: log.status as ItemStatus,
      evidenceText: clean(log.evidence_text, 500),
    })),
    energy: typeof daily.data?.energy === 'number' ? daily.data.energy : null,
    blocker: clean(daily.data?.blocker, 300),
    adjustment: clean(daily.data?.adjustment, 500),
  })
}

async function resolveProjectExecutionItem(
  db: ReturnType<typeof createClient>,
  sessionId: string,
  item: Record<string, unknown>,
  date: string,
) {
  if (item.planning_style !== 'progression') return item
  const { data: applied, error: adaptationError } = await db.from('web_mvp_daily_adaptations')
    .select('source_plan_item_id,recommendation')
    .eq('session_id', sessionId)
    .eq('target_date', date)
    .eq('target_plan_item_id', clean(item.source_plan_item_id, 120))
    .eq('status', 'applied')
    .maybeSingle()
  if (adaptationError) throw adaptationError
  const recommendation = applied?.recommendation && typeof applied.recommendation === 'object' ? applied.recommendation as Record<string, unknown> : {}
  if (applied && recommendation.strategy === 'recover_first') {
    const { data: source, error } = await db.from('web_mvp_routine_items').select('*').eq('session_id', sessionId).eq('source_plan_item_id', applied.source_plan_item_id).maybeSingle()
    if (error || !source) throw error ?? new Error('project_dependency_incomplete')
    return source
  }
  const dependsOn = Number(item.depends_on_sequence_index ?? 0)
  if (!dependsOn) return item
  const { data: previous, error: previousError } = await db.from('web_mvp_routine_items').select('id,source_plan_item_id')
    .eq('session_id', sessionId)
    .eq('routine_key', clean(item.routine_key, 180))
    .eq('sequence_index', dependsOn)
    .maybeSingle()
  if (previousError || !previous) throw previousError ?? new Error('project_dependency_incomplete')
  const [{ data: previousLogs, error: logError }, { data: recoveryUses, error: recoveryError }] = await Promise.all([
    db.from('web_mvp_item_logs').select('log_date,evidence_text').eq('session_id', sessionId).eq('routine_item_id', previous.id).eq('status', 'completed').lte('log_date', date),
    db.from('web_mvp_daily_adaptations').select('target_date,recommendation').eq('session_id', sessionId).eq('target_plan_item_id', previous.source_plan_item_id).eq('status', 'applied').lte('target_date', date),
  ])
  if (logError || recoveryError) throw logError ?? recoveryError
  const recoveryDates = new Set((recoveryUses ?? []).filter(row => row.recommendation?.strategy === 'recover_first').map(row => row.target_date))
  const dependencyComplete = (previousLogs ?? []).some(log => meaningfulEvidence(log.evidence_text) && !recoveryDates.has(log.log_date))
  if (!dependencyComplete) throw new Error('project_dependency_incomplete')
  return item
}

function nextAdaptationTargets(date: string, sourceItems: DailyAdaptationItem[], itemRows: Record<string, unknown>[]): DailyAdaptationTarget[] {
  const todayIndex = dayIndexForDate(date)
  return sourceItems.flatMap(source => {
    const sameRoutine = itemRows
      .filter(row => row.active === true && row.grade !== 'excluded' && clean(row.routine_key, 180) === source.routineKey)
      .filter(row => source.planningStyle !== 'progression' || Number(row.sequence_index ?? 0) > source.sequenceIndex)
      .sort((a, b) => source.planningStyle === 'progression'
        ? Number(a.sequence_index ?? 0) - Number(b.sequence_index ?? 0)
        : (((Number(a.day_index) - todayIndex + 7) % 7 || 7) - ((Number(b.day_index) - todayIndex + 7) % 7 || 7)))
    const targetRow = sameRoutine[0] ?? itemRows.find(row => row.source_plan_item_id === source.sourcePlanItemId) ?? null
    if (!targetRow) return []
    const targetDayIndex = Number(targetRow.day_index)
    const offset = targetRow.source_plan_item_id === source.sourcePlanItemId
      ? 1
      : (targetDayIndex - todayIndex + 7) % 7 || 7
    return [{
      sourcePlanItemId: clean(targetRow.source_plan_item_id, 120),
      routineKey: clean(targetRow.routine_key, 180),
      title: clean(targetRow.title, 160),
      targetDate: addCalendarDays(date, offset),
      planningStyle: targetRow.planning_style === 'progression' ? 'progression' : 'repeat',
      sequenceIndex: Number(targetRow.sequence_index ?? 0),
      minimumAction: clean(targetRow.minimum_action, 240),
      completionEvidence: clean(targetRow.completion_evidence, 160),
      inputArtifact: clean(targetRow.input_artifact, 160),
    }]
  })
}

async function recordProjectProgress(
  db: ReturnType<typeof createClient>,
  sessionId: string,
  item: Record<string, unknown>,
  logId: string,
  evidence: string,
  createdAt: string,
) {
  const planningStyle = item.planning_style ?? item.planningStyle
  const milestoneId = clean(item.milestone_id ?? item.milestoneId, 24)
  if (planningStyle !== 'progression' || !meaningfulEvidence(evidence) || !/^\d+-\d+$/.test(milestoneId)) return
  const { data: agent, error } = await db.from('web_mvp_agent_sessions').select('goal_card,generated_plan,agent_v2_context').eq('session_id', sessionId).maybeSingle()
  if (error || !agent) throw error ?? new Error('agent_session_not_found')
  const plan = Array.isArray(agent.generated_plan) ? agent.generated_plan : []
  const context = agent.agent_v2_context && typeof agent.agent_v2_context === 'object' ? agent.agent_v2_context as Record<string, unknown> : {}
  const milestone = agent.goal_card?.projectPlan?.milestones?.find?.((entry: Record<string, unknown>) => entry?.id === milestoneId)
  const maxSequence = plan
    .filter((entry: Record<string, unknown>) => clean(entry?.milestoneId, 24) === milestoneId)
    .reduce((value: number, entry: Record<string, unknown>) => Math.max(value, Number(entry?.sequenceIndex ?? 0)), 0)
  const sequenceIndex = Number(item.sequence_index ?? item.sequenceIndex ?? 0)
  const weekIndex = Number(item.week_index ?? item.weekIndex ?? 0)
  const milestoneCompleted = sequenceIndex >= maxSequence && weekIndex >= Number(milestone?.endWeek ?? Number.MAX_SAFE_INTEGER)
  const result = appendGoalProgress({
    existing: context.goalProgress,
    progress: {
      milestoneId,
      weekIndex,
      result: clean(item.title, 160),
      evidence,
      milestoneCompleted,
    },
    goalCard: agent.goal_card ?? {},
    plan,
    id: logId,
    createdAt,
  })
  const { error: updateError } = await db.from('web_mvp_agent_sessions').update({
    agent_v2_context: { ...context, goalProgress: result.entries },
    updated_at: new Date().toISOString(),
  }).eq('session_id', sessionId)
  if (updateError) throw updateError
}

async function clearProjectProgress(
  db: ReturnType<typeof createClient>,
  sessionId: string,
  item: Record<string, unknown>,
  logId: string,
) {
  if ((item.planning_style ?? item.planningStyle) !== 'progression') return
  const { data: agent, error } = await db.from('web_mvp_agent_sessions').select('agent_v2_context').eq('session_id', sessionId).maybeSingle()
  if (error || !agent) throw error ?? new Error('agent_session_not_found')
  const context = agent.agent_v2_context && typeof agent.agent_v2_context === 'object' ? agent.agent_v2_context as Record<string, unknown> : {}
  const entries = Array.isArray(context.goalProgress) ? context.goalProgress.filter(entry => !entry || typeof entry !== 'object' || (entry as Record<string, unknown>).id !== logId) : []
  if (Array.isArray(context.goalProgress) && entries.length === context.goalProgress.length) return
  const { error: updateError } = await db.from('web_mvp_agent_sessions').update({
    agent_v2_context: { ...context, goalProgress: entries },
    updated_at: new Date().toISOString(),
  }).eq('session_id', sessionId)
  if (updateError) throw updateError
}

async function maybeCreateDailyAdaptation(
  db: ReturnType<typeof createClient>,
  sessionId: string,
  date: string,
  dashboard: Awaited<ReturnType<typeof readDashboard>>,
) {
  const { data: existing, error: existingError } = await db.from('web_mvp_daily_adaptations').select('id').eq('session_id', sessionId).eq('source_date', date).maybeSingle()
  if (existingError) throw existingError
  if (existing) return
  const { data: itemRows, error: itemError } = await db.from('web_mvp_routine_items').select('*').eq('session_id', sessionId)
  if (itemError) throw itemError
  const sourceItems = dashboard.items.map(item => ({
    id: item.id,
    sourcePlanItemId: item.sourcePlanItemId,
    routineKey: item.routineKey,
    title: item.title,
    dayIndex: item.dayIndex,
    planningStyle: item.planningStyle,
    sequenceIndex: item.sequenceIndex,
    minimumAction: item.minimumAction,
    completionEvidence: item.completionEvidence,
    inputArtifact: item.inputArtifact,
    grade: item.grade,
  }))
  const logs: DailyAdaptationLog[] = dashboard.itemLogs.map(log => ({ routineItemId: log.routineItemId, status: log.status, evidenceText: log.evidence }))
  const targets = nextAdaptationTargets(date, sourceItems, itemRows ?? [])
  const common = {
    sourceDate: date,
    items: sourceItems,
    logs,
    targets,
    energy: dashboard.dailyLog?.energy ?? null,
    blocker: dashboard.dailyLog?.blocker ?? '',
    adjustment: dashboard.dailyLog?.adjustment ?? '',
    weeklySignals: dashboard.weekly.signals,
  }
  const fallback = fallbackDailyAdaptation(common)
  if (!fallback) return
  const signature = dailyAdaptationEvidenceSignature({
    sourceDate: date,
    items: sourceItems,
    logs,
    energy: common.energy,
    blocker: common.blocker,
    adjustment: common.adjustment,
  })
  const fallbackSource = sourceItems.find(item => item.sourcePlanItemId === fallback.sourcePlanItemId)
  if (!fallbackSource) return
  const fallbackRecommendation = {
    ...fallback.recommendation,
    sourceTitle: fallbackSource.title,
    sourceCompletionEvidence: fallbackSource.completionEvidence,
    sourceInputArtifact: fallbackSource.inputArtifact,
    targetTitle: fallback.target.title,
  }
  const { data: reserved, error } = await db.from('web_mvp_daily_adaptations').insert({
    session_id: sessionId,
    source_date: date,
    target_date: fallback.target.targetDate,
    source_plan_item_id: fallbackSource.sourcePlanItemId,
    target_plan_item_id: fallback.target.sourcePlanItemId,
    routine_key: fallbackSource.routineKey,
    evidence_signature: signature,
    source_snapshot: { items: sourceItems, logs, energy: common.energy, blocker: common.blocker, adjustment: common.adjustment },
    recommendation: fallbackRecommendation,
  }).select('id').maybeSingle()
  if (error?.code === '23505') return
  if (error) throw error
  if (!reserved) return

  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) return
  const gateway = createLlmGateway(createOpenAiResponsesAdapter({ apiKey }))
  try {
    const result = await runDailyAdaptationTurn({
      ...common,
      model: Deno.env.get('ONJU_DAILY_MODEL') || 'gpt-4.1-mini-2025-04-14',
      request: request => requestModel(db, gateway, request),
    }) ?? fallback
    const sourceItem = sourceItems.find(item => item.sourcePlanItemId === result.sourcePlanItemId)
    if (!sourceItem) return
    const recommendation = {
      ...result.recommendation,
      sourceTitle: sourceItem.title,
      sourceCompletionEvidence: sourceItem.completionEvidence,
      sourceInputArtifact: sourceItem.inputArtifact,
      targetTitle: result.target.title,
    }
    const { error: updateError } = await db.from('web_mvp_daily_adaptations').update({
      target_date: result.target.targetDate,
      source_plan_item_id: sourceItem.sourcePlanItemId,
      target_plan_item_id: result.target.sourcePlanItemId,
      routine_key: sourceItem.routineKey,
      recommendation,
      updated_at: new Date().toISOString(),
    }).eq('id', reserved.id).eq('session_id', sessionId).eq('status', 'proposed')
    if (updateError) throw updateError
  } catch (cause) {
    console.error('daily_adaptation_model_fallback', cause)
  }
}

async function readDashboard(db: ReturnType<typeof createClient>, sessionId: string, date: string, regionalContext: UserRegionalContext) {
  const dayIndex = dayIndexForDate(date)
  const weekStart = addCalendarDays(date, -6)
  const [trials, reviews] = await Promise.all([
    db.from('web_mvp_rule_trials').select('*').eq('session_id', sessionId).eq('status', 'active').order('started_on', { ascending: false }),
    db.from('web_mvp_weekly_reviews').select('*').eq('session_id', sessionId).order('week_end', { ascending: false }).limit(4),
  ])
  if (trials.error) throw trials.error
  if (reviews.error) throw reviews.error
  const trialHistoryStart = (trials.data ?? []).reduce((earliest, trial) => trial.started_on < earliest ? trial.started_on : earliest, weekStart)
  const historyStart = (reviews.data ?? []).reduce((earliest, review) => review.week_start < earliest ? review.week_start : earliest, trialHistoryStart)
  const [preferences, items, dailyLogs, itemLogs, sessions, adaptations] = await Promise.all([
    db.from('web_mvp_checkin_preferences').select('*').eq('session_id', sessionId).maybeSingle(),
    db.from('web_mvp_routine_items').select('*').eq('session_id', sessionId).order('day_index').order('start_time', { ascending: true, nullsFirst: false }),
    db.from('web_mvp_daily_logs').select('*').eq('session_id', sessionId).gte('log_date', historyStart).lte('log_date', date).order('log_date'),
    db.from('web_mvp_item_logs').select('*').eq('session_id', sessionId).gte('log_date', historyStart).lte('log_date', date).order('log_date'),
    db.from('web_mvp_checkin_sessions').select('*').eq('session_id', sessionId).eq('check_date', date).order('started_at'),
    db.from('web_mvp_daily_adaptations').select('*').eq('session_id', sessionId).order('source_date', { ascending: false }).limit(21),
  ])
  for (const result of [preferences, items, dailyLogs, itemLogs, sessions, adaptations]) if (result.error) throw result.error
  const preference = preferences.data ?? { timezone: 'Asia/Seoul', morning_enabled: true, morning_time: '06:30:00', closing_enabled: true, closing_time: '22:00:00' }
  const itemRows = items.data ?? []
  const allItems = itemRows.filter(item => item.active === true)
  const effectiveItems = itemRows.filter(item => (!item.activated_on || item.activated_on <= date) && (!item.deactivated_on || item.deactivated_on >= date))
  const currentItems = effectiveItems.filter(item => item.day_index === dayIndex && item.grade !== 'excluded')
  const weekItemLogs = itemLogs.data ?? []
  const weekDailyLogs = dailyLogs.data ?? []
  const todayDailyLog = weekDailyLogs.find(item => item.log_date === date)
  const todayItemLogs = weekItemLogs.filter(item => item.log_date === date)
  const yesterdayDate = addCalendarDays(date, -1)
  const yesterdayDailyLog = weekDailyLogs.find(item => item.log_date === yesterdayDate)
  const yesterdayItemLogs = weekItemLogs.filter(item => item.log_date === yesterdayDate)
  const baseWeekly = buildWeeklyInsights(
    date,
    itemRows.map(item => ({ id: item.id, title: item.title, dayIndex: item.day_index, grade: isRoutineGrade(item.grade) ? item.grade : 'normal', activatedOn: item.activated_on, deactivatedOn: item.deactivated_on })),
    weekItemLogs.map(item => ({ routineItemId: item.routine_item_id, logDate: item.log_date, status: item.status as ItemStatus })),
    weekDailyLogs.map(item => ({ logDate: item.log_date, blocker: item.blocker })),
    regionalContext.locale,
  )
  const itemIdBySource = new Map(itemRows.map(item => [clean(item.source_plan_item_id, 120), item.id]))
  const publicAdaptations = (adaptations.data ?? []).map(row => {
    const targetItemId = itemIdBySource.get(clean(row.target_plan_item_id, 120))
    const targetLog = targetItemId ? weekItemLogs.find(log => log.routine_item_id === targetItemId && log.log_date === row.target_date) : null
    return publicDailyAdaptation(row, targetLog ? targetLog.status as ItemStatus : null)
  })
  const weeklyAdaptations = publicAdaptations.filter(item => item.sourceDate >= baseWeekly.startDate && item.sourceDate <= baseWeekly.endDate)
  const adaptationMetrics = buildDailyAdaptationMetrics(weeklyAdaptations, baseWeekly.startDate, baseWeekly.endDate)
  const firstActivatedOn = itemRows.map(item => clean(item.activated_on, 10)).filter(Boolean).sort()[0] ?? ''
  const weekly = {
    ...baseWeekly,
    isFirstPlanWeek: Boolean(firstActivatedOn && firstActivatedOn >= baseWeekly.startDate && firstActivatedOn <= baseWeekly.endDate),
    adaptations: weeklyAdaptations,
    adaptationSummary: {
      proposed: weeklyAdaptations.filter(item => item.status === 'proposed').length,
      applied: weeklyAdaptations.filter(item => item.status === 'applied').length,
      dismissed: weeklyAdaptations.filter(item => item.status === 'dismissed').length,
      continued: weeklyAdaptations.filter(item => item.status === 'applied' && (item.targetStatus === 'completed' || item.targetStatus === 'minimum')).length,
    },
    adaptationMetrics,
  }
  const routineGroups = new Map<string, { id: string; key: string; title: string; grade: RoutineGrade; days: number[]; gradeUpdatedAt: string; start: string; dependencyKinds: DependencyKind[]; activeStrategy: string; strategyTrialUntil: string | null; strategyState: 'none' | 'trial' | 'adopted' }>()
  for (const item of allItems) {
    const key = clean(item.routine_key, 180) || routineIdentity(item.title) || item.id
    const existing = routineGroups.get(key)
    if (existing) {
      if (!existing.days.includes(item.day_index)) existing.days.push(item.day_index)
      if (!existing.start && item.start_time) existing.start = clean(item.start_time, 8).slice(0, 5)
      continue
    }
    routineGroups.set(key, {
      id: item.id,
      key,
      title: routineTitle(item.title) || item.title,
      grade: isRoutineGrade(item.grade) ? item.grade : 'normal',
      days: [item.day_index],
      gradeUpdatedAt: item.grade_updated_at,
      start: item.start_time ? clean(item.start_time, 8).slice(0, 5) : '',
      dependencyKinds: Array.isArray(item.dependency_kinds) ? item.dependency_kinds.filter(isDependencyKind) : [],
      activeStrategy: clean(item.active_strategy, 240),
      strategyTrialUntil: item.strategy_trial_until ?? null,
      strategyState: item.strategy_state === 'trial' || item.strategy_state === 'adopted' ? item.strategy_state : 'none',
    })
  }
  const routineList = [...routineGroups.values()].map(group => ({ ...group, days: group.days.sort((a, b) => a - b) }))
  const reviewRoutines = itemRows.map(item => ({ id: item.id, routineKey: clean(item.routine_key, 180) || routineIdentity(item.title) || item.id, title: routineTitle(item.title) || item.title, dayIndex: item.day_index, activatedOn: item.activated_on, deactivatedOn: item.deactivated_on }))
  const reviewLogs = weekItemLogs.map(item => ({ routineItemId: item.routine_item_id, logDate: item.log_date, status: item.status as ItemStatus }))
  const activeTrials = (trials.data ?? []).map(trial => {
    const publicTrial = { id: trial.id, routineKey: trial.routine_key, routineTitle: routineList.find(routine => routine.key === trial.routine_key)?.title ?? trial.routine_key, signalType: trial.signal_type, dependencyKind: isDependencyKind(trial.dependency_kind) ? trial.dependency_kind : 'schedule' as DependencyKind, strategyId: trial.strategy_id, strategy: trial.strategy, rationale: trial.rationale, startedOn: trial.started_on, trialUntil: trial.trial_until, extensionCount: Number(trial.extension_count ?? 0), status: trial.status }
    return { ...publicTrial, review: buildTrialReview(date, publicTrial, reviewRoutines, reviewLogs, regionalContext.locale) }
  })
  const structureProposal = buildStructureProposal(date, weekly.signals, routineList, weekDailyLogs.map(log => clean(log.blocker)).filter(Boolean), activeTrials, regionalContext.locale)
  const currentReviewRow = (reviews.data ?? []).find(review => review.week_start === weekly.startDate && review.week_end === weekly.endDate)
    ?? (reviews.data ?? []).find(review => review.status === 'active' || review.status === 'ready')
  const latestApplied = (reviews.data ?? []).find(review => review.status === 'applied')
  let weeklyCalibration = null
  if (latestApplied) {
    const rawBaseline = latestApplied.baseline && typeof latestApplied.baseline === 'object' ? latestApplied.baseline as Record<string, unknown> : {}
    const baseline = {
      scheduled: Number(rawBaseline.scheduled ?? 0),
      outcomeCount: Number(rawBaseline.outcomeCount ?? 0),
      adherenceRate: typeof rawBaseline.adherenceRate === 'number' && Number.isFinite(rawBaseline.adherenceRate) ? rawBaseline.adherenceRate : null,
      continuityRate: typeof rawBaseline.continuityRate === 'number' && Number.isFinite(rawBaseline.continuityRate) ? rawBaseline.continuityRate : null,
      coverageRate: typeof rawBaseline.coverageRate === 'number' && Number.isFinite(rawBaseline.coverageRate) ? rawBaseline.coverageRate : null,
      unrecorded: Number(rawBaseline.unrecorded ?? 0),
    }
    const outcome = buildWeeklyInsights(
      latestApplied.next_week_end,
      itemRows.map(item => ({ id: item.id, title: item.title, dayIndex: item.day_index, grade: isRoutineGrade(item.grade) ? item.grade : 'normal', activatedOn: item.activated_on, deactivatedOn: item.deactivated_on })),
      weekItemLogs.map(item => ({ routineItemId: item.routine_item_id, logDate: item.log_date, status: item.status as ItemStatus })),
      weekDailyLogs.map(item => ({ logDate: item.log_date, blocker: item.blocker })),
      regionalContext.locale,
    )
    const calculated = buildWeeklyCalibration({ today: date, nextWeekEnd: latestApplied.next_week_end, baseline, outcome })
    const stored = latestApplied.evaluation && typeof latestApplied.evaluation === 'object' && Object.keys(latestApplied.evaluation).length
      ? latestApplied.evaluation
      : null
    const evaluation = stored ?? calculated
    if (!stored && calculated.ready) {
      const { error: evaluationError } = await db.from('web_mvp_weekly_reviews').update({ evaluation: calculated, updated_at: new Date().toISOString() }).eq('id', latestApplied.id).eq('session_id', sessionId)
      if (evaluationError) throw evaluationError
    }
    const recommendation = latestApplied.recommendation && typeof latestApplied.recommendation === 'object' ? latestApplied.recommendation : {}
    weeklyCalibration = { reviewId: latestApplied.id, strategy: recommendation.strategy ?? 'keep', ...evaluation }
  }
  return {
    date,
    dayIndex,
    preferences: {
      timezone: regionalContext.timeZone,
      morningEnabled: preference.morning_enabled !== false,
      morningTime: clean(preference.morning_time, 8).slice(0, 5) || '06:30',
      closingEnabled: preference.closing_enabled !== false,
      closingTime: clean(preference.closing_time, 8).slice(0, 5) || '22:00',
    },
    items: currentItems.map(item => {
      const appliedAdaptation = publicAdaptations.find(adaptation => adaptation.status === 'applied' && adaptation.targetDate === date && adaptation.targetPlanItemId === item.source_plan_item_id)
      const recovering = appliedAdaptation?.strategy === 'recover_first'
      return ({
      id: item.id,
      sourcePlanItemId: item.source_plan_item_id,
      routineKey: clean(item.routine_key, 180),
      dayIndex: item.day_index,
      title: item.title,
      minimumAction: item.minimum_action,
      start: item.start_time ? clean(item.start_time, 8).slice(0, 5) : '',
      end: item.end_time ? clean(item.end_time, 8).slice(0, 5) : '',
      grade: isRoutineGrade(item.grade) ? item.grade : 'normal',
      dependencyKinds: Array.isArray(item.dependency_kinds) ? item.dependency_kinds.filter(isDependencyKind) : [],
      activeStrategy: clean(item.active_strategy, 240),
      strategyTrialUntil: item.strategy_trial_until ?? null,
      strategyState: item.strategy_state === 'trial' || item.strategy_state === 'adopted' ? item.strategy_state : 'none',
      planningStyle: item.planning_style === 'progression' ? 'progression' : 'repeat',
      actionIndex: Number(item.action_index ?? -1),
      weekIndex: Number(item.week_index ?? 1),
      progressIndex: Number(item.progress_index ?? 0),
      sequenceIndex: Number(item.sequence_index ?? 0),
      milestoneId: clean(item.milestone_id, 24),
      dependsOnSequenceIndex: Number(item.depends_on_sequence_index ?? 0),
      completionEvidence: recovering ? appliedAdaptation.sourceCompletionEvidence : clean(item.completion_evidence, 160),
      inputArtifact: recovering ? appliedAdaptation.sourceInputArtifact : clean(item.input_artifact, 160),
      adaptation: appliedAdaptation,
      adaptiveAction: appliedAdaptation?.nextAction ?? '',
    })}),
    dailyLog: todayDailyLog ? {
      id: todayDailyLog.id,
      energy: todayDailyLog.energy,
      blocker: todayDailyLog.blocker,
      adjustment: todayDailyLog.adjustment,
      summary: todayDailyLog.summary,
      agentCheckIn: todayDailyLog.agent_checkin,
      updatedAt: todayDailyLog.updated_at,
    } : null,
    itemLogs: todayItemLogs.map(item => ({
      id: item.id,
      routineItemId: item.routine_item_id,
      status: item.status,
      note: item.note,
      evidence: item.evidence_text,
      source: item.source,
      recordedAt: item.recorded_at,
    })),
    checkIns: (sessions.data ?? []).map(row => publicSession(row, regionalContext.locale)),
    routines: routineList,
    yesterday: yesterdayDailyLog || yesterdayItemLogs.length ? {
      date: yesterdayDate,
      energy: yesterdayDailyLog?.energy ?? null,
      blocker: yesterdayDailyLog?.blocker ?? '',
      adjustment: yesterdayDailyLog?.adjustment ?? '',
      summary: yesterdayDailyLog?.summary ?? '',
      completed: yesterdayItemLogs.filter(item => item.status === 'completed').length,
      minimum: yesterdayItemLogs.filter(item => item.status === 'minimum').length,
      missed: yesterdayItemLogs.filter(item => item.status === 'missed').length,
      exception: yesterdayItemLogs.filter(item => item.status === 'exception').length,
    } : null,
    weekly,
    dailyAdaptation: publicAdaptations.find(item => item.status === 'proposed' && item.sourceDate === date)
      ?? publicAdaptations.find(item => item.status === 'applied' && item.targetDate === date)
      ?? null,
    adaptationHistory: publicAdaptations,
    weeklyReview: publicWeeklyReview(currentReviewRow),
    weeklyCalibration,
    structureProposal,
    activeTrials,
  }
}

async function recordDailyProductEvent(db: ReturnType<typeof createClient>, sessionId: string, regionalContext: UserRegionalContext, eventName: string, sourceId: string, properties: Record<string, string | number | boolean> = {}) {
  try {
    const rows = buildProductRows({ sessionId, sourceId, surface: 'daily', regionalContext, events: [{ eventName, properties }] })
    const result = await db.from('web_mvp_product_events').upsert(rows, { onConflict: 'session_id,event_name,source_id', ignoreDuplicates: true })
    if (result.error) throw result.error
  } catch (error) { console.error('onju_daily_metrics_write_failed', error instanceof Error ? error.message : 'unknown') }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) throw new Error('missing_environment')
    const body = await req.json()
    const regionalContext = cleanRegionalContext(body.regionalContext)
    if (!uuid.test(body.sessionId ?? '')) return new Response(JSON.stringify({ error: 'invalid_session' }), { status: 400, headers })
    const sessionId = body.sessionId as string
    const date = regionalDate(regionalContext.timeZone)
    const db = createClient(url, key, { auth: { persistSession: false } })
    const tokenHash = await claimWebMvpSession(db, sessionId, body.sessionToken)
    bindAiCostContext(db, sessionId, 'onju-daily', { ...body, effectiveDate: date })
    await enforceWebMvpRateLimits(db, req, tokenHash, { scope: 'daily', minute: 60, day: 1000 })
    await ensurePreferences(db, sessionId, regionalContext.timeZone)

    if (body.action === 'start_weekly_review') {
      const plan = normalizedPlan(body.plan)
      const planSnapshot = clientPlanSnapshot(body.plan)
      if (!plan || !planSnapshot) return new Response(JSON.stringify({ error: 'invalid_plan' }), { status: 400, headers })
      const dashboard = await readDashboard(db, sessionId, date, regionalContext)
      if (dashboard.weeklyReview) return new Response(JSON.stringify(dashboard), { headers })
      if (dashboard.dayIndex !== 6 || dashboard.weekly.outcomeCount < 3 || (dashboard.weekly.coverageRate ?? 0) < 60) {
        return new Response(JSON.stringify({ error: 'weekly_review_not_ready' }), { status: 409, headers })
      }
      const opening = weeklyReviewOpening(dashboard.weekly)
      const nextWeekStart = addCalendarDays(date, 1)
      const { error } = await db.from('web_mvp_weekly_reviews').insert({
        session_id: sessionId,
        week_start: dashboard.weekly.startDate,
        week_end: dashboard.weekly.endDate,
        next_week_start: nextWeekStart,
        next_week_end: addCalendarDays(nextWeekStart, 6),
        status: 'active',
        evidence_signature: weeklyReviewEvidenceSignature(dashboard.weekly),
        baseline: dashboard.weekly,
        plan_snapshot: planSnapshot,
        messages: [{ role: 'assistant', text: opening.message }],
        recommendation: { choices: opening.choices },
      })
      if (error?.code !== '23505' && error) throw error
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'answer_weekly_review') {
      if (!uuid.test(body.reviewId ?? '') || !Number.isInteger(body.expectedRevision)) return new Response(JSON.stringify({ error: 'invalid_weekly_review' }), { status: 400, headers })
      const answer = cleanMessage(body.answer, 800)
      if (!answer) return new Response(JSON.stringify({ error: 'answer_required' }), { status: 400, headers })
      await enforceWebMvpRateLimits(db, req, tokenHash, { scope: 'weekly_review', minute: 8, day: 40 })
      const [{ data: review, error: reviewError }, { data: agent, error: agentError }] = await Promise.all([
        db.from('web_mvp_weekly_reviews').select('*').eq('id', body.reviewId).eq('session_id', sessionId).maybeSingle(),
        db.from('web_mvp_agent_sessions').select('goal_card,day_bounds,blocks').eq('session_id', sessionId).maybeSingle(),
      ])
      if (reviewError || !review) return new Response(JSON.stringify({ error: 'weekly_review_not_found' }), { status: 404, headers })
      if (agentError || !agent) throw agentError ?? new Error('agent_session_not_found')
      if (!['active', 'ready'].includes(review.status) || Number(review.revision) !== body.expectedRevision) return new Response(JSON.stringify({ error: 'weekly_review_changed' }), { status: 409, headers })
      const messages = Array.isArray(review.messages) ? review.messages.flatMap((message: unknown) => {
        if (!message || typeof message !== 'object') return []
        const item = message as Record<string, unknown>
        return (item.role === 'assistant' || item.role === 'user') && cleanMessage(item.text, 1200) ? [{ role: item.role, text: cleanMessage(item.text, 1200) }] : []
      }) : []
      const baseline = review.baseline && typeof review.baseline === 'object' ? review.baseline as WeeklyReviewInsights : null
      if (!baseline || weeklyReviewEvidenceSignature(baseline) !== review.evidence_signature) return new Response(JSON.stringify({ error: 'weekly_review_changed' }), { status: 409, headers })
      const currentDashboard = await readDashboard(db, sessionId, date, regionalContext)
      if (review.week_end === currentDashboard.weekly.endDate && weeklyReviewEvidenceSignature(currentDashboard.weekly) !== review.evidence_signature) {
        return new Response(JSON.stringify({ error: 'weekly_review_changed' }), { status: 409, headers })
      }
      const apiKey = Deno.env.get('OPENAI_API_KEY')
      if (!apiKey) throw new Error('missing_environment')
      const gateway = createLlmGateway(createOpenAiResponsesAdapter({ apiKey }))
      let decision
      try {
        decision = await runWeeklyReviewTurn({
          answer,
          messages,
          context: {
            weekly: baseline,
            plan: Array.isArray(review.plan_snapshot) ? review.plan_snapshot : [],
            goalCard: agent.goal_card ?? {},
            dayBounds: Array.isArray(agent.day_bounds) ? agent.day_bounds : [],
            blocks: Array.isArray(agent.blocks) ? agent.blocks : [],
            previousCalibration: currentDashboard.weeklyCalibration,
          },
          model: Deno.env.get('ONJU_AGENT_MODEL') || 'gpt-5.6-sol',
          request: request => requestModel(db, gateway, request),
        })
      } catch (cause) {
        console.error(cause)
        if (sessionAccessFailure(cause)) throw cause
        throw new Error('weekly_review_model_failed', { cause })
      }
      const nextMessages = [...messages, { role: 'user' as const, text: answer }, { role: 'assistant' as const, text: decision.assistantMessage }].slice(-12)
      const { data: saved, error } = await db.from('web_mvp_weekly_reviews').update({
        status: decision.status,
        messages: nextMessages,
        recommendation: { ...decision.recommendation, choices: decision.choices },
        revision: Number(review.revision) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', review.id).eq('session_id', sessionId).eq('revision', body.expectedRevision).select('id').maybeSingle()
      if (error) throw error
      if (!saved) return new Response(JSON.stringify({ error: 'weekly_review_changed' }), { status: 409, headers })
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'apply_weekly_review') {
      if (!uuid.test(body.reviewId ?? '') || !Number.isInteger(body.expectedRevision)) return new Response(JSON.stringify({ error: 'invalid_weekly_review' }), { status: 400, headers })
      const plan = normalizedPlan(body.plan)
      const planSnapshot = clientPlanSnapshot(body.plan)
      const evidenceSignature = clean(body.evidenceSignature, 2000)
      if (!plan || !planSnapshot || !evidenceSignature) return new Response(JSON.stringify({ error: 'invalid_plan' }), { status: 400, headers })
      const currentDashboard = await readDashboard(db, sessionId, date, regionalContext)
      const currentReview = currentDashboard.weeklyReview
      if (!currentReview || currentReview.id !== body.reviewId || (currentReview.weekEnd === currentDashboard.weekly.endDate && weeklyReviewEvidenceSignature(currentDashboard.weekly) !== currentReview.evidenceSignature)) {
        return new Response(JSON.stringify({ error: 'weekly_review_changed' }), { status: 409, headers })
      }
      const rows = plan.map(item => ({ ...item, session_id: sessionId }))
      const { data: applied, error } = await db.rpc('web_mvp_apply_weekly_review', {
        p_review_id: body.reviewId,
        p_session_id: sessionId,
        p_revision: body.expectedRevision,
        p_evidence_signature: evidenceSignature,
        p_plan: rows,
        p_client_plan: planSnapshot,
        p_applied_on: currentReview.nextWeekStart,
      })
      if (error) throw error
      if (!applied) return new Response(JSON.stringify({ error: 'weekly_review_changed' }), { status: 409, headers })
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'sync_plan') {
      const plan = normalizedPlan(body.plan)
      const planSnapshot = clientPlanSnapshot(body.plan)
      if (!plan || !planSnapshot) return new Response(JSON.stringify({ error: 'invalid_plan' }), { status: 400, headers })
      const futureStarts = [...new Set(planSnapshot.map(item => item.weekStart).filter(value => value && value > date))]
      const effectiveOn = futureStarts.length === 1 ? futureStarts[0] : date
      const rows = plan.map(item => ({ ...item, session_id: sessionId }))
      const { error } = await db.rpc('web_mvp_sync_routine_plan', { p_session_id: sessionId, p_plan: rows, p_changed_on: effectiveOn })
      if (error) throw error
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'load') return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })

    if (body.action === 'review_daily_adaptation') {
      const validReasons = ['accepted', 'needs_adjustment', 'already_planned', 'not_realistic', 'wrong_cause', 'prefer_current', 'other']
      if (!uuid.test(body.adaptationId ?? '') || !Number.isInteger(body.expectedRevision) || !['apply', 'modify', 'dismiss'].includes(body.decision)) {
        return new Response(JSON.stringify({ error: 'invalid_daily_adaptation' }), { status: 400, headers })
      }
      const selectedAction = clean(body.selectedAction, 240)
      if (body.decision === 'modify' && selectedAction.length < 2) return new Response(JSON.stringify({ error: 'daily_adaptation_action_required' }), { status: 400, headers })
      const { data: adaptation, error: adaptationError } = await db.from('web_mvp_daily_adaptations').select('*').eq('id', body.adaptationId).eq('session_id', sessionId).maybeSingle()
      if (adaptationError || !adaptation) return new Response(JSON.stringify({ error: 'daily_adaptation_not_found' }), { status: 404, headers })
      const currentSignature = await currentDailyAdaptationSignature(db, sessionId, adaptation.source_date)
      if (adaptation.status !== 'proposed' || Number(adaptation.revision) !== body.expectedRevision || currentSignature !== adaptation.evidence_signature) {
        return new Response(JSON.stringify({ error: 'daily_adaptation_changed' }), { status: 409, headers })
      }
      const now = new Date().toISOString()
      const recommendation = adaptation.recommendation && typeof adaptation.recommendation === 'object' ? adaptation.recommendation as Record<string, unknown> : {}
      const applied = body.decision === 'apply' || body.decision === 'modify'
      const decisionMode = body.decision === 'apply' ? 'accepted' : body.decision === 'modify' ? 'modified' : 'dismissed'
      const fallbackReason = body.decision === 'apply' ? 'accepted' : body.decision === 'modify' ? 'needs_adjustment' : 'prefer_current'
      const reason = validReasons.includes(clean(body.reason, 40)) ? clean(body.reason, 40) : fallbackReason
      const { data: saved, error } = await db.from('web_mvp_daily_adaptations').update({
        status: applied ? 'applied' : 'dismissed',
        decision_mode: decisionMode,
        decision_reason: reason,
        decision_note: clean(body.note, 240),
        selected_action: applied ? selectedAction || clean(recommendation.nextAction, 240) : '',
        revision: Number(adaptation.revision) + 1,
        updated_at: now,
        applied_at: applied ? now : null,
        decided_at: now,
      }).eq('id', adaptation.id).eq('session_id', sessionId).eq('revision', body.expectedRevision).eq('status', 'proposed').select('id').maybeSingle()
      if (error) throw error
      if (!saved) return new Response(JSON.stringify({ error: 'daily_adaptation_changed' }), { status: 409, headers })
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'update_preferences') {
      const morningTime = clean(body.morningTime, 5)
      const closingTime = clean(body.closingTime, 5)
      if (!time.test(morningTime) || !time.test(closingTime)) return new Response(JSON.stringify({ error: 'invalid_time' }), { status: 400, headers })
      const { error } = await db.from('web_mvp_checkin_preferences').upsert({
        session_id: sessionId,
        timezone: regionalContext.timeZone,
        morning_enabled: body.morningEnabled !== false,
        morning_time: morningTime,
        closing_enabled: body.closingEnabled !== false,
        closing_time: closingTime,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'session_id' })
      if (error) throw error
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'update_item_grade') {
      if (!uuid.test(body.routineItemId ?? '') || !isRoutineGrade(body.grade)) return new Response(JSON.stringify({ error: 'invalid_grade' }), { status: 400, headers })
      const grade = body.grade as RoutineGrade
      const { data: item, error: itemError } = await db.from('web_mvp_routine_items').select('id,routine_key,title').eq('id', body.routineItemId).eq('session_id', sessionId).eq('active', true).maybeSingle()
      if (itemError || !item) return new Response(JSON.stringify({ error: 'item_not_found' }), { status: 404, headers })
      const key = clean(item.routine_key, 180) || routineIdentity(item.title)
      if (grade === 'strong') {
        const { data: strongRows, error: strongError } = await db.from('web_mvp_routine_items').select('routine_key').eq('session_id', sessionId).eq('active', true).eq('grade', 'strong')
        if (strongError) throw strongError
        const strongKeys = (strongRows ?? []).map(row => clean(row.routine_key, 180)).filter(Boolean)
        if (!canAssignStrongGrade(strongKeys, key)) return new Response(JSON.stringify({ error: 'strong_limit' }), { status: 409, headers })
      }
      const { error } = await db.from('web_mvp_routine_items').update({ grade, grade_updated_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('session_id', sessionId).eq('routine_key', key)
      if (error) throw error
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'update_dependencies') {
      if (!uuid.test(body.routineItemId ?? '') || !Array.isArray(body.dependencyKinds)) return new Response(JSON.stringify({ error: 'invalid_dependencies' }), { status: 400, headers })
      const dependencyKinds = [...new Set(body.dependencyKinds)].filter(isDependencyKind)
      if (dependencyKinds.length !== body.dependencyKinds.length || dependencyKinds.length > 3) return new Response(JSON.stringify({ error: 'invalid_dependencies' }), { status: 400, headers })
      const { data: item, error: itemError } = await db.from('web_mvp_routine_items').select('id,routine_key,title').eq('id', body.routineItemId).eq('session_id', sessionId).eq('active', true).maybeSingle()
      if (itemError || !item) return new Response(JSON.stringify({ error: 'item_not_found' }), { status: 404, headers })
      const key = clean(item.routine_key, 180) || routineIdentity(item.title)
      const { error } = await db.from('web_mvp_routine_items').update({ dependency_kinds: dependencyKinds, updated_at: new Date().toISOString() }).eq('session_id', sessionId).eq('routine_key', key)
      if (error) throw error
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'start_rule_trial') {
      const requestedRoutineKey = clean(body.routineKey, 180)
      const optionId = clean(body.optionId, 80)
      const dashboard = await readDashboard(db, sessionId, date, regionalContext)
      const proposal = dashboard.structureProposal
      const option = findStructureOption(proposal, optionId)
      if (!proposal || proposal.routineKey !== requestedRoutineKey || !option) return new Response(JSON.stringify({ error: 'proposal_changed' }), { status: 409, headers })
      const { error } = await db.rpc('web_mvp_start_rule_trial', {
        p_session_id: sessionId,
        p_routine_key: proposal.routineKey,
        p_signal_type: proposal.signalType,
        p_dependency_kind: proposal.dependencyKind,
        p_strategy_id: option.id,
        p_strategy: option.strategy,
        p_rationale: option.tradeoff,
        p_started_on: addCalendarDays(date, 1),
        p_trial_until: proposal.trialUntil,
      })
      if (error) throw error
      await recordDailyProductEvent(db, sessionId, regionalContext, 'trial_started', `trial:${date}:${option.id}`, { strategy_id: option.id, dependency_kind: proposal.dependencyKind })
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'review_rule_trial') {
      if (!uuid.test(body.trialId ?? '') || !['keep', 'modify', 'stop', 'extend'].includes(body.decision)) return new Response(JSON.stringify({ error: 'invalid_trial_review' }), { status: 400, headers })
      const dashboard = await readDashboard(db, sessionId, date, regionalContext)
      const trial = dashboard.activeTrials.find(entry => entry.id === body.trialId)
      if (!trial) return new Response(JSON.stringify({ error: 'trial_not_found' }), { status: 404, headers })
      if (!trial.review.due) return new Response(JSON.stringify({ error: 'trial_not_due' }), { status: 409, headers })
      const decision = body.decision as 'keep' | 'modify' | 'stop' | 'extend'
      if (trial.review.outcomeCount < 3 && !['extend', 'stop'].includes(decision)) return new Response(JSON.stringify({ error: 'trial_evidence_low' }), { status: 409, headers })
      if (decision === 'extend' && trial.review.recommendation !== 'extend') return new Response(JSON.stringify({ error: 'trial_cannot_extend' }), { status: 409, headers })
      const nextOption = decision === 'modify' ? trial.review.alternativeOptions.find(option => option.id === clean(body.optionId, 80)) : null
      if (decision === 'modify' && !nextOption) return new Response(JSON.stringify({ error: 'invalid_trial_option' }), { status: 400, headers })
      const result = { scheduled: trial.review.scheduled, completed: trial.review.completed, minimum: trial.review.minimum, missed: trial.review.missed, exception: trial.review.exception, unrecorded: trial.review.unrecorded, outcomeCount: trial.review.outcomeCount, adherenceRate: trial.review.adherenceRate, continuityRate: trial.review.continuityRate, recommendation: trial.review.recommendation }
      const nextTrialUntil = decision === 'extend' ? addCalendarDays(trial.trialUntil, 7) : addCalendarDays(date, 14)
      const { error } = await db.rpc('web_mvp_review_rule_trial', { p_trial_id: trial.id, p_session_id: sessionId, p_decision: decision, p_reviewed_on: date, p_result: result, p_next_strategy_id: nextOption?.id ?? '', p_next_strategy: nextOption?.strategy ?? '', p_next_rationale: nextOption?.tradeoff ?? '', p_next_trial_until: nextTrialUntil })
      if (error) throw error
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'complete_item') {
      if (!uuid.test(body.routineItemId ?? '')) return new Response(JSON.stringify({ error: 'invalid_item' }), { status: 400, headers })
      const status: ItemStatus = ['completed', 'minimum', 'missed', 'exception'].includes(body.status) ? body.status : 'completed'
      const { data: item, error: itemError } = await db.from('web_mvp_routine_items').select('*').eq('id', body.routineItemId).eq('session_id', sessionId).eq('active', true).maybeSingle()
      if (itemError || !item) return new Response(JSON.stringify({ error: 'item_not_found' }), { status: 404, headers })
      if (item.day_index !== dayIndexForDate(date) || (item.activated_on && item.activated_on > date) || (item.deactivated_on && item.deactivated_on < date)) {
        return new Response(JSON.stringify({ error: 'item_not_today' }), { status: 409, headers })
      }
      const evidence = clean(body.evidence, 500)
      if (status === 'completed' && item.planning_style === 'progression' && !meaningfulEvidence(evidence)) {
        return new Response(JSON.stringify({ error: 'completion_evidence_required' }), { status: 400, headers })
      }
      let progressItem = item
      if (status === 'completed') {
        try {
          progressItem = await resolveProjectExecutionItem(db, sessionId, item, date)
        } catch (cause) {
          if (cause instanceof Error && cause.message === 'project_dependency_incomplete') return new Response(JSON.stringify({ error: 'project_dependency_incomplete' }), { status: 409, headers })
          throw cause
        }
      }
      const daily = await ensureDailyLog(db, sessionId, date, regionalContext.timeZone)
      const now = new Date().toISOString()
      const { data: savedLog, error } = await db.from('web_mvp_item_logs').upsert({
        session_id: sessionId,
        daily_log_id: daily.id,
        routine_item_id: item.id,
        log_date: date,
        status,
        note: clean(body.note, 240),
        evidence_text: evidence,
        source: 'quick_action',
        recorded_at: now,
        updated_at: now,
      }, { onConflict: 'session_id,routine_item_id,log_date' }).select('*').single()
      if (error) throw error
      if (status === 'completed') await recordProjectProgress(db, sessionId, progressItem, savedLog.id, evidence, now)
      else await clearProjectProgress(db, sessionId, item, savedLog.id)
      if (status === 'completed' || status === 'minimum') await recordDailyProductEvent(db, sessionId, regionalContext, 'first_action_completed', 'first_action', { status, source: 'quick_action' })
      return new Response(JSON.stringify(await readDashboard(db, sessionId, date, regionalContext)), { headers })
    }

    if (body.action === 'start_checkin') {
      if (!isCheckInType(body.checkType)) return new Response(JSON.stringify({ error: 'invalid_checkin_type' }), { status: 400, headers })
      const dashboard = await readDashboard(db, sessionId, date, regionalContext)
      const existing = dashboard.checkIns.find(item => item.type === body.checkType)
      if (existing) return new Response(JSON.stringify({ dashboard, session: existing, message: existing.status === 'completed' ? '오늘 점검은 이미 마쳤어요.' : '' }), { headers })
      const progress = startCheckIn(body.checkType, dashboard.items, regionalContext.locale)
      const { data, error } = await db.from('web_mvp_checkin_sessions').insert({
        session_id: sessionId,
        check_date: date,
        check_type: body.checkType,
        status: progress.status,
        step: progress.step,
        collected: progress.collected,
        pending_question: progress.pendingQuestion,
      }).select('*').single()
      if (error) throw error
      return new Response(JSON.stringify({ dashboard: await readDashboard(db, sessionId, date, regionalContext), session: { ...publicSession(data, regionalContext.locale), choices: progress.choices }, message: '' }), { headers })
    }

    if (body.action === 'answer_checkin') {
      if (!uuid.test(body.checkInId ?? '') || !Number.isInteger(body.expectedStep)) return new Response(JSON.stringify({ error: 'invalid_checkin' }), { status: 400, headers })
      const answer = clean(body.answer)
      if (!answer) return new Response(JSON.stringify({ error: 'answer_required' }), { status: 400, headers })
      const { data: row, error: rowError } = await db.from('web_mvp_checkin_sessions').select('*').eq('id', body.checkInId).eq('session_id', sessionId).eq('check_date', date).maybeSingle()
      if (rowError || !row) return new Response(JSON.stringify({ error: 'checkin_not_found' }), { status: 404, headers })
      if (row.status === 'completed') return new Response(JSON.stringify({ error: 'checkin_already_completed' }), { status: 409, headers })
      if (row.step !== body.expectedStep) return new Response(JSON.stringify({ error: 'checkin_changed' }), { status: 409, headers })
      const dashboard = await readDashboard(db, sessionId, date, regionalContext)
      const type = isCheckInType(row.check_type) ? row.check_type : 'morning'
      const current: CheckInProgress = {
        checkType: type,
        step: row.step,
        status: 'active',
        collected: row.collected && typeof row.collected === 'object' ? row.collected : {},
        pendingQuestion: row.pending_question,
        choices: [],
      }
      const next = advanceCheckIn(current, answer, dashboard.items, regionalContext.locale)
      let progressItem: Record<string, unknown> | null = null
      if (next.itemUpdate?.status === 'completed') {
        const item = await db.from('web_mvp_routine_items').select('*').eq('id', next.itemUpdate.routineId).eq('session_id', sessionId).maybeSingle()
        if (item.error || !item.data) return new Response(JSON.stringify({ error: 'item_not_found' }), { status: 404, headers })
        try {
          progressItem = await resolveProjectExecutionItem(db, sessionId, item.data, date)
        } catch (cause) {
          if (cause instanceof Error && cause.message === 'project_dependency_incomplete') return new Response(JSON.stringify({ error: 'project_dependency_incomplete' }), { status: 409, headers })
          throw cause
        }
      }
      const now = new Date().toISOString()
      const { data: saved, error } = await db.from('web_mvp_checkin_sessions').update({
        status: next.progress.status,
        step: next.progress.step,
        collected: next.progress.collected,
        pending_question: next.progress.pendingQuestion,
        updated_at: now,
        completed_at: next.progress.status === 'completed' ? now : null,
      }).eq('id', row.id).eq('step', body.expectedStep).select('*').maybeSingle()
      if (error) throw error
      if (!saved) return new Response(JSON.stringify({ error: 'checkin_changed' }), { status: 409, headers })
      const daily = await ensureDailyLog(db, sessionId, date, regionalContext.timeZone)
      const dailyChanges: Record<string, unknown> = { updated_at: now }
      if (next.energy !== null) dailyChanges.energy = next.energy
      if (type === 'morning' && typeof next.progress.collected.obstacle === 'string') dailyChanges.blocker = next.progress.collected.obstacle
      if (type === 'closing' && typeof next.progress.collected.reflection === 'string') dailyChanges.adjustment = next.progress.collected.reflection
      const { error: dailyError } = await db.from('web_mvp_daily_logs').update(dailyChanges).eq('id', daily.id)
      if (dailyError) throw dailyError
      const updatedItem = next.itemUpdate ? dashboard.items.find(item => item.id === next.itemUpdate?.routineId) : null
      if (updatedItem && next.itemUpdate) {
        const { data: savedLog, error: logError } = await db.from('web_mvp_item_logs').upsert({
          session_id: sessionId,
          daily_log_id: daily.id,
          routine_item_id: updatedItem.id,
          log_date: date,
          status: next.itemUpdate.status,
          note: '',
          evidence_text: next.itemUpdate.evidence,
          source: 'checkin',
          recorded_at: now,
          updated_at: now,
        }, { onConflict: 'session_id,routine_item_id,log_date' }).select('*').single()
        if (logError) throw logError
        if (next.itemUpdate.status === 'completed') await recordProjectProgress(db, sessionId, progressItem ?? updatedItem, savedLog.id, next.itemUpdate.evidence, now)
        else await clearProjectProgress(db, sessionId, updatedItem, savedLog.id)
      }
      let nextDashboard = await readDashboard(db, sessionId, date, regionalContext)
      if (type === 'closing' && next.progress.status === 'completed') {
        await maybeCreateDailyAdaptation(db, sessionId, date, nextDashboard)
        nextDashboard = await readDashboard(db, sessionId, date, regionalContext)
      }
      const nextSession = nextDashboard.checkIns.find(entry => entry.id === row.id)
      const signal = nextDashboard.weekly.signals[0]
      const statuses = next.progress.collected.itemStatuses && typeof next.progress.collected.itemStatuses === 'object'
        ? Object.values(next.progress.collected.itemStatuses) as ItemStatus[]
        : []
      const strongMissed = dashboard.items.some(item => item.grade === 'strong' && (next.progress.collected.itemStatuses as Record<string, ItemStatus> | undefined)?.[item.id] === 'missed')
      const strongMessage = strongMissed && !signal
        ? '\n\n**강한 규칙 기록**\n오늘 미실행은 그대로 남겼어요. 내일 두 배로 메우는 방식은 사용하지 않습니다.'
        : ''
      const signalMessage = signal
        ? `\n\n**최근 7일 기록에서 확인된 신호**\n${signal.title}\n\n${signal.detail}`
        : ''
      const adaptationMessage = next.progress.status === 'completed' && nextDashboard.dailyAdaptation?.status === 'proposed'
        ? '\n\n**다음 실행에서 바꿀 한 가지**\n오늘 기록을 바탕으로 조정안을 만들었어요. 아래 제안을 확인해 주세요.'
        : ''
      if (next.progress.status === 'completed') await recordDailyProductEvent(db, sessionId, regionalContext, 'daily_checkin_completed', `checkin:${type}:${date}`, { check_type: type })
      return new Response(JSON.stringify({
        dashboard: nextDashboard,
        session: nextSession,
        message: next.progress.status === 'completed' ? `${completionMessage(type, statuses, regionalContext.locale)}${strongMessage}${signalMessage}${adaptationMessage}` : next.itemUpdate ? '이 실행 결과를 기록했어요. 다음 항목을 이어서 확인할게요.' : '말씀하신 내용을 기록했어요.',
      }), { headers })
    }

    return new Response(JSON.stringify({ error: 'invalid_action' }), { status: 400, headers })
  } catch (error) {
    const accessFailure = sessionAccessResponse(error, headers)
    if (accessFailure) return accessFailure
    console.error(error)
    const code = error instanceof Error && ['invalid_session_token', 'session_forbidden', 'rate_limited', 'public_budget_exhausted', 'weekly_review_model_failed'].includes(error.message)
      ? error.message
      : 'onju_daily_failed'
    const status = code === 'rate_limited' || code === 'public_budget_exhausted' ? 429 : code === 'session_forbidden' ? 403 : code === 'invalid_session_token' ? 400 : code === 'weekly_review_model_failed' ? 503 : 500
    return new Response(JSON.stringify({ error: code }), { status, headers })
  }
})
