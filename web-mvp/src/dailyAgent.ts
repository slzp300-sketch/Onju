import { withAgentSession } from './agentSession'
import type { PlanItem } from './model'
import { supabase } from './supabaseClient'
import { agentRequestFailure } from './agentApiErrors'
import { loadRegionalContext } from './regionalContext'
import { translator } from './i18n'

export type DailyItemStatus = 'completed' | 'missed' | 'exception'
export type DailyRoutineGrade = 'observation' | 'normal' | 'strong' | 'excluded'
export type DailyDependencyKind = 'wake' | 'sleep' | 'schedule' | 'energy'
export type DailyTrialDecision = 'keep' | 'modify' | 'stop' | 'extend'
export type DailyStructureOption = { id: string; title: string; description: string; tradeoff: string; strategy: string }
export type DailyRoutineItem = {
  id: string
  sourcePlanItemId: string
  dayIndex: number
  title: string
  minimumAction: string
  start: string
  end: string
  grade: DailyRoutineGrade
  dependencyKinds: DailyDependencyKind[]
  activeStrategy: string
  strategyTrialUntil: string | null
  strategyState: 'none' | 'trial' | 'adopted'
}
export type DailyItemLog = {
  id: string
  routineItemId: string
  status: DailyItemStatus
  note: string
  source: 'checkin' | 'quick_action'
  recordedAt: string
}
export type DailyCheckInSession = {
  id: string
  date: string
  type: 'morning' | 'closing'
  status: 'active' | 'completed'
  step: number
  collected: Record<string, string>
  pendingQuestion: string
  choices: string[]
  completedAt: string | null
}
export type DailyWeeklySignal = {
  type: 'missed_streak' | 'low_adherence' | 'repeated_blocker'
  title: string
  detail: string
  evidenceCount: number
  routineTitle: string | null
}
export type DailyWeeklyInsights = {
  startDate: string
  endDate: string
  scheduled: number
  completed: number
  missed: number
  observedSkipped: number
  exception: number
  unrecorded: number
  recordedDays: number
  outcomeCount: number
  adherenceRate: number | null
  coverageRate: number | null
  days: Array<{
    date: string
    dayIndex: number
    label: string
    isToday: boolean
    scheduled: number
    completed: number
    missed: number
    observedSkipped: number
    exception: number
    unrecorded: number
  }>
  signals: DailyWeeklySignal[]
  note: string
}
export type DailyDashboard = {
  date: string
  dayIndex: number
  preferences: {
    timezone: string
    morningEnabled: boolean
    morningTime: string
    closingEnabled: boolean
    closingTime: string
  }
  items: DailyRoutineItem[]
  dailyLog: null | { id: string; energy: number | null; blocker: string; adjustment: string; summary: string; updatedAt: string }
  itemLogs: DailyItemLog[]
  checkIns: DailyCheckInSession[]
  routines: Array<{
    id: string
    key: string
    title: string
    grade: DailyRoutineGrade
    days: number[]
    gradeUpdatedAt: string
    start: string
    dependencyKinds: DailyDependencyKind[]
    activeStrategy: string
    strategyTrialUntil: string | null
    strategyState: 'none' | 'trial' | 'adopted'
  }>
  yesterday: null | {
    date: string
    energy: number | null
    blocker: string
    adjustment: string
    summary: string
    completed: number
    missed: number
    exception: number
  }
  weekly: DailyWeeklyInsights
  structureProposal: null | {
    routineKey: string
    routineTitle: string
    signalType: 'missed_streak' | 'low_adherence'
    dependencyKind: DailyDependencyKind
    dependencyLabel: string
    evidence: string
    diagnosis: string
    trialUntil: string
    options: DailyStructureOption[]
  }
  activeTrials: Array<{
    id: string
    routineKey: string
    routineTitle: string
    signalType: 'missed_streak' | 'low_adherence'
    dependencyKind: DailyDependencyKind
    strategyId: string
    strategy: string
    rationale: string
    startedOn: string
    trialUntil: string
    extensionCount: number
    status: 'active' | 'completed' | 'cancelled'
    review: {
      elapsedDays: number
      totalDays: number
      scheduled: number
      completed: number
      missed: number
      exception: number
      unrecorded: number
      outcomeCount: number
      adherenceRate: number | null
      due: boolean
      recommendation: 'pending' | 'extend' | 'keep' | 'modify' | 'stop'
      summary: string
      alternativeOptions: DailyStructureOption[]
    }
  }>
}
type DailyReply = { dashboard: DailyDashboard; session?: DailyCheckInSession; message?: string }

async function invoke<T>(body: Record<string, unknown>) {
  const regionalContext = loadRegionalContext()
  const t = translator(regionalContext)
  if (!supabase) throw new Error(t('api.supabaseMissing'))
  const { data, error } = await supabase.functions.invoke<T>('onju-daily', {
    body: withAgentSession(String(body.sessionId), { ...body, regionalContext }),
  })
  if (error) {
    try {
      const context = (error as unknown as { context?: Response }).context
      const payload = context ? await context.clone().json() as { error?: string } : null
      if (payload?.error === 'strong_limit') throw new Error(t('today.strongLimit'))
      if (payload?.error === 'proposal_changed') throw new Error(t('api.proposalChanged'))
      if (payload?.error === 'trial_not_due') throw new Error(t('api.trialNotDue'))
      if (payload?.error === 'trial_evidence_low') throw new Error(t('api.trialEvidenceLow'))
      if (payload?.error === 'trial_cannot_extend') throw new Error(t('api.trialCannotExtend'))
    } catch (cause) {
      if (cause instanceof Error && [
        t('today.strongLimit'),
        t('api.proposalChanged'),
        t('api.trialNotDue'),
        t('api.trialEvidenceLow'),
        t('api.trialCannotExtend'),
      ].includes(cause.message)) throw cause
    }
    throw await agentRequestFailure(error, t('api.dailyUnavailable'), regionalContext.locale)
  }
  if (!data) throw new Error(t('api.dailyUnavailable'))
  return data
}

export function syncDailyPlan(sessionId: string, plan: PlanItem[]) {
  return invoke<DailyDashboard>({ action: 'sync_plan', sessionId, plan })
}

export function loadDailyDashboard(sessionId: string) {
  return invoke<DailyDashboard>({ action: 'load', sessionId })
}

export function startDailyCheckIn(sessionId: string, checkType: 'morning' | 'closing') {
  return invoke<DailyReply>({ action: 'start_checkin', sessionId, checkType })
}

export function answerDailyCheckIn(sessionId: string, session: DailyCheckInSession, answer: string) {
  return invoke<DailyReply>({ action: 'answer_checkin', sessionId, checkInId: session.id, expectedStep: session.step, answer })
}

export function completeDailyItem(sessionId: string, routineItemId: string, status: DailyItemStatus = 'completed') {
  return invoke<DailyDashboard>({ action: 'complete_item', sessionId, routineItemId, status })
}

export function updateDailyPreferences(sessionId: string, input: DailyDashboard['preferences']) {
  return invoke<DailyDashboard>({ action: 'update_preferences', sessionId, ...input })
}

export function updateDailyRoutineGrade(sessionId: string, routineItemId: string, grade: DailyRoutineGrade) {
  return invoke<DailyDashboard>({ action: 'update_item_grade', sessionId, routineItemId, grade })
}

export function updateDailyRoutineDependencies(sessionId: string, routineItemId: string, dependencyKinds: DailyDependencyKind[]) {
  return invoke<DailyDashboard>({ action: 'update_dependencies', sessionId, routineItemId, dependencyKinds })
}

export function startDailyRuleTrial(sessionId: string, routineKey: string, optionId: string) {
  return invoke<DailyDashboard>({ action: 'start_rule_trial', sessionId, routineKey, optionId })
}

export function reviewDailyRuleTrial(sessionId: string, trialId: string, decision: DailyTrialDecision, optionId = '') {
  return invoke<DailyDashboard>({ action: 'review_rule_trial', sessionId, trialId, decision, optionId })
}
