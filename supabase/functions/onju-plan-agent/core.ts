import {
  canonicalPlanText,
  validatePlanSequence,
  type PlanningStyle as PlanQualityStyle,
} from '../_shared/planQuality.ts'
import { containsProgressionSignal, deterministicPlanningStyle } from '../_shared/planningStyle.ts'
import { withOnjuOperatingPolicy } from '../_shared/onjuOperatingPolicy.ts'

export type TimeBlock = { days?: number[]; start?: string; end?: string; title?: string }
export type DayBounds = { days?: number[]; wake?: string; bedtime?: string }
export type PlanItem = {
  actionIndex: number
  planningStyle: PlanningStyle
  weekIndex: number
  weekStart: string
  progressIndex: number
  sequenceIndex: number
  milestoneId: string
  dependsOnSequenceIndex: number | null
  inputArtifact: string
  dayIndex: number
  start: string
  end: string
  title: string
  completionEvidence: string
  tinyStart: string
  fallback: string
  rationale: string
}
type CandidatePlanItem = Omit<PlanItem, 'planningStyle' | 'weekIndex' | 'weekStart' | 'progressIndex' | 'milestoneId'>
type GoalAction = { title: string; frequencyPerWeek: number; durationMinutes: number; preferredDays: number[]; planningStyle?: PlanningStyle }
type GoalInput = {
  category?: unknown
  outcome?: unknown
  targetMetric?: unknown
  durationWeeks?: unknown
  projectPlan?: unknown
  weeklyActions?: unknown
  execution?: { progressStrategy?: unknown; actions?: unknown }
}
type CandidateMilestone = {
  title: string
  deliverable: string
  completionCriterion: string
  dependsOnIndex: number | null
}
export type ProjectMilestone = {
  id: string
  startWeek: number
  endWeek: number
  title: string
  deliverable: string
  completionCriterion: string
  dependsOn: string[]
}
export type ProjectPlan = {
  version: 1
  goalKey: string
  planningStyle: 'progression'
  strategy: string
  weekIndex: number
  currentMilestoneId: string
  weeklyObjective: string
  weeklyDeliverable: string
  weeklyCompletionCriterion: string
  inputFromPrevious: string
  milestones: ProjectMilestone[]
}

export function validStoredProjectPlan(value: unknown, goal?: { outcome?: unknown; durationWeeks?: unknown; targetMetric?: unknown }): value is ProjectPlan {
  if (!value || typeof value !== 'object') return false
  const plan = value as Partial<ProjectPlan>
  const expectedKey = goal ? `${Math.max(0, Math.floor(Number(goal.durationWeeks) || 0))}|${typeof goal.outcome === 'string' ? goal.outcome.trim().toLocaleLowerCase('ko') : ''}|${typeof goal.targetMetric === 'string' ? goal.targetMetric.trim().toLocaleLowerCase('ko') : ''}`.slice(0, 240) : ''
  if (plan.version !== 1 || plan.planningStyle !== 'progression' || !Number.isInteger(plan.weekIndex) || Number(plan.weekIndex) < 1) return false
  const durationWeeks = goal ? Math.max(1, Math.floor(Number(goal.durationWeeks) || 1)) : null
  if (goal && plan.goalKey !== expectedKey) return false
  if (durationWeeks && Number(plan.weekIndex) > durationWeeks) return false
  if (!['goalKey', 'strategy', 'currentMilestoneId', 'weeklyObjective', 'weeklyDeliverable', 'weeklyCompletionCriterion', 'inputFromPrevious'].every(key => typeof plan[key as keyof ProjectPlan] === 'string' && String(plan[key as keyof ProjectPlan]).trim())) return false
  if (!Array.isArray(plan.milestones) || !plan.milestones.length || plan.milestones.length > 4) return false
  if (durationWeeks && plan.milestones.length !== Math.min(4, durationWeeks)) return false
  const validMilestones = plan.milestones.every((milestone, index) => Boolean(milestone)
    && milestone.id === `${milestone.startWeek}-${milestone.endWeek}`
    && Number.isInteger(milestone.startWeek) && Number.isInteger(milestone.endWeek)
    && milestone.startWeek >= 1 && milestone.endWeek >= milestone.startWeek
    && (index === 0 ? milestone.startWeek === 1 : milestone.startWeek === plan.milestones![index - 1].endWeek + 1)
    && (!durationWeeks || milestone.endWeek <= durationWeeks)
    && typeof milestone.title === 'string' && Boolean(milestone.title.trim())
    && typeof milestone.deliverable === 'string' && Boolean(milestone.deliverable.trim())
    && typeof milestone.completionCriterion === 'string' && Boolean(milestone.completionCriterion.trim())
    && Array.isArray(milestone.dependsOn)
    && (index === 0 ? milestone.dependsOn.length === 0 : milestone.dependsOn.length === 1 && milestone.dependsOn[0] === plan.milestones![index - 1].id))
  if (!validMilestones) return false
  if (durationWeeks && plan.milestones.at(-1)?.endWeek !== durationWeeks) return false
  const current = plan.milestones.find(milestone => milestone.startWeek <= Number(plan.weekIndex) && milestone.endWeek >= Number(plan.weekIndex))
  if (!current || current.id !== plan.currentMilestoneId) return false
  for (const field of ['title', 'deliverable', 'completionCriterion'] as const) {
    const values = plan.milestones.map(milestone => safePlanText(milestone[field], 160).toLocaleLowerCase('ko'))
    if (new Set(values).size !== values.length) return false
  }
  return true
}
export type PlanningStyle = Exclude<PlanQualityStyle, 'unknown'>
export type PlanCycleContext = {
  weekNumber?: unknown
  weekStart?: unknown
  advanceProgression?: unknown
  previousPlan?: unknown
  weeklySummary?: unknown
  reviewRecommendation?: unknown
}

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function validPlanSessionId(value: unknown): value is string {
  return typeof value === 'string' && sessionIdPattern.test(value)
}

const itemProperties = {
  actionIndex: { type: 'integer', minimum: 0, maximum: 6 },
  sequenceIndex: { type: 'integer', minimum: 1, maximum: 7 },
  dependsOnSequenceIndex: { type: ['integer', 'null'], minimum: 1, maximum: 7 },
  inputArtifact: { type: 'string', minLength: 2, maxLength: 120 },
  dayIndex: { type: 'integer', minimum: 0, maximum: 6 },
  start: { type: 'string', pattern: '^(?:|(?:[01]\\d|2[0-3]):[0-5]\\d)$' },
  end: { type: 'string', pattern: '^(?:|(?:[01]\\d|2[0-3]):[0-5]\\d)$' },
  title: { type: 'string', minLength: 2, maxLength: 80 },
  completionEvidence: { type: 'string', minLength: 2, maxLength: 120 },
  tinyStart: { type: 'string', minLength: 2, maxLength: 120 },
  fallback: { type: 'string', minLength: 2, maxLength: 120 },
  rationale: { type: 'string', minLength: 4, maxLength: 200 },
}

const milestoneProperties = {
  title: { type: 'string', minLength: 2, maxLength: 80 },
  deliverable: { type: 'string', minLength: 2, maxLength: 120 },
  completionCriterion: { type: 'string', minLength: 2, maxLength: 160 },
  dependsOnIndex: { type: ['integer', 'null'], minimum: 0, maximum: 3 },
}

const projectPlanSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['strategy', 'weeklyObjective', 'weeklyDeliverable', 'weeklyCompletionCriterion', 'milestones'],
  properties: {
    strategy: { type: 'string', minLength: 4, maxLength: 240 },
    weeklyObjective: { type: 'string', minLength: 2, maxLength: 120 },
    weeklyDeliverable: { type: 'string', minLength: 2, maxLength: 160 },
    weeklyCompletionCriterion: { type: 'string', minLength: 2, maxLength: 160 },
    milestones: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'object', additionalProperties: false, required: Object.keys(milestoneProperties), properties: milestoneProperties } },
  },
}

export const weeklyPlanSchema = {
  type: 'object', additionalProperties: false, required: ['assistant_message', 'items', 'warnings', 'project_plan'], properties: {
    assistant_message: { type: 'string' },
    items: { type: 'array', maxItems: 14, items: { type: 'object', additionalProperties: false, required: Object.keys(itemProperties), properties: itemProperties } },
    warnings: { type: 'array', items: { type: 'string' } },
    project_plan: projectPlanSchema,
  },
}

export const weeklyPlanInstructions = withOnjuOperatingPolicy('weekly_plan', `당신은 온주의 주간 실행안 설계 전문가다. 한국시간(Asia/Seoul) 기준으로 완성된 목표 카드의 주간 행동을 사용자가 말한 생활 조건과 목표 진행 주차에 맞춰 제안한다.
- 각 항목의 actionIndex는 planning_actions의 actionIndex와 정확히 연결하고, 행동별 frequencyPerWeek만큼 빠짐없이 만든다.
- 같은 actionIndex의 sequenceIndex는 실제 실행 날짜 순서대로 1부터 시작해 빠짐없이 이어지게 한다.
- progression 항목은 첫 회차의 dependsOnSequenceIndex를 null로 둔다. 그다음 회차는 바로 앞 sequenceIndex를 넣고, inputArtifact에는 바로 앞 회차의 completionEvidence를 같은 문구로 넣어 실제 산출물 연결을 만든다.
- 2주차 이후 progression의 첫 회차는 previousPlan에서 같은 actionIndex의 마지막 completionEvidence를 inputArtifact에 그대로 사용한다. repeat 항목은 dependsOnSequenceIndex를 null, inputArtifact를 '독립 실행'으로 둔다.
- sequenceIndex는 한 주 안의 순서이며 매주 1부터 다시 시작한다. weekIndex, weekStart와 누적 progressIndex는 서버가 검증 후 부여하므로 만들지 않는다.
- 근무, 이동, 반복 일정, 회복 시간과 절대 겹치지 않는다. 기존 블록 전후로 가능하면 15분 여유를 둔다.
- 사용자가 지정한 preferredDays가 있으면 우선하되 충돌하면 다른 날에 분산한다.
- 기상·취침과 일정 시각이 모두 확인된 요일만 정확한 start/end를 제안한다. 시각 정보가 부족한 요일은 start와 end를 모두 빈 문자열로 두고, 시간을 추정하지 않은 채 요일과 실행 행동만 제안한다.
- 생활시간 정보가 없다는 이유로 실행안을 비우지 않는다. 일정이 유동적이면 preferredDays와 분산 원칙을 사용하고 rationale에 '실행 시각은 당일 상황에 맞춰 정한다'고 설명한다.
- 같은 목표 행동을 연속된 날에 과도하게 몰지 말고 회복을 고려한다.
- planningStyle이 repeat이면 매번 독립적으로 반복하는 습관이다. 같은 title과 completionEvidence를 유지해도 되지만 요일과 생활 조건에 맞는 rationale을 쓴다.
- planningStyle이 progression이면 결과물이 누적되는 프로젝트다. 회차 번호나 표현만 바꾸지 말고, 앞 회차의 결과를 다음 회차가 실제로 이어받도록 조사→검증→제작→정리 같은 순서로 나눈다. execution steps와 progressStrategy가 있으면 반드시 반영한다.
- progression 목표라면 project_plan을 만든다. 목표 기간이 4주 이상이면 4개, 더 짧으면 기간 주수만큼의 구체적인 마일스톤을 만든다. 각 마일스톤은 목표에 맞는 서로 다른 산출물과 확인 기준을 가지며 첫 항목의 dependsOnIndex는 null, 이후 항목은 바로 앞 인덱스다. repeat 목표라면 project_plan은 null이다.
- goal_card.projectPlan에 이미 검증된 마일스톤이 있으면 strategy와 milestones의 문구·순서·의존 관계를 그대로 반환한다. 다음 주 생성에서는 전체 경로를 다시 쓰지 않고 weeklyObjective, weeklyDeliverable, weeklyCompletionCriterion만 새 단계에 맞게 갱신한다.
- project_plan의 weeklyDeliverable은 이번 주 daily items를 모두 수행했을 때 실제로 남는 하나의 통합 산출물이어야 한다. weeklyCompletionCriterion은 그 산출물을 확인할 구체적인 기준이다.
- plan_cycle.weekNumber가 2 이상이고 advanceProgression이 true이면 previousPlan의 title과 completionEvidence를 그대로 반복하지 않는다. 지난주 결과물을 이번 주 첫 단계의 입력으로 삼아 목표에 더 가까운 새 산출물을 만든다.
- plan_cycle.advanceProgression이 false이면 완료하지 못한 프로젝트 단계를 억지로 넘기지 않는다. 반복 습관은 주차가 바뀌어도 같은 행동을 유지한다.
- title은 그날 끝낼 구체적인 정상 실행이다. completionEvidence에는 '완료'처럼 추상적으로 쓰지 말고 문장, 목록, 초안, 기록, 전달 결과처럼 사용자가 끝났는지 확인할 수 있는 결과물을 적는다.
- tinyStart는 2분 안에 시작할 행동, fallback은 피곤하거나 시간이 없을 때도 남길 수 있는 최소 결과다. title, completionEvidence, tinyStart, fallback은 모두 비우지 않는다.
- rationale에는 왜 이 요일과 시간인지 한 문장으로 설명한다.
- validation_feedback가 있으면 이전 결과는 폐기하고 지적된 문제를 모두 고친 전체 items를 다시 만든다.
- 목표 카드에 없는 성과나 수치를 새로 만들지 않는다.`)

function goalActions(goal: unknown): GoalAction[] {
  if (!goal || typeof goal !== 'object') return []
  const actions = (goal as GoalInput).weeklyActions
  if (!Array.isArray(actions)) return []
  return actions.flatMap(value => {
    if (!value || typeof value !== 'object') return []
    const action = value as Partial<GoalAction>
    if (typeof action.title !== 'string' || !Number.isInteger(action.frequencyPerWeek) || Number(action.frequencyPerWeek) < 1 || Number(action.frequencyPerWeek) > 7) return []
    return [{
      title: action.title.trim(),
      frequencyPerWeek: Number(action.frequencyPerWeek),
      durationMinutes: Number.isInteger(action.durationMinutes) ? Number(action.durationMinutes) : 0,
      preferredDays: Array.isArray(action.preferredDays) ? action.preferredDays.filter((day): day is number => Number.isInteger(day) && day >= 0 && day <= 6) : [],
      ...(['repeat', 'progression'].includes(String(action.planningStyle)) ? { planningStyle: action.planningStyle as PlanningStyle } : {}),
    }]
  })
}

export function inferPlanningStyle(goal: unknown, actionIndex: number): PlanningStyle {
  if (!goal || typeof goal !== 'object') return 'repeat'
  const input = goal as GoalInput
  const action = goalActions(goal)[actionIndex]
  if (!action) return 'repeat'
  const deterministic = deterministicPlanningStyle(action.title)
  if (deterministic) return deterministic
  if (action.planningStyle) return action.planningStyle
  const guide = Array.isArray(input.execution?.actions) ? input.execution.actions[actionIndex] : null
  const widerContext = [input.category, input.outcome, input.execution?.progressStrategy, guide && typeof guide === 'object' ? JSON.stringify(guide) : '']
    .filter(value => typeof value === 'string')
    .join(' ')
  return containsProgressionSignal(widerContext) ? 'progression' : 'repeat'
}

export function planningActions(goal: unknown) {
  return goalActions(goal).map((action, actionIndex) => ({ ...action, actionIndex, planningStyle: inferPlanningStyle(goal, actionIndex) }))
}

function safePlanText(value: unknown, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function compactWeeklySummary(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const numeric = (key: string) => typeof source[key] === 'number' && Number.isFinite(source[key]) ? source[key] : null
  return {
    startDate: safePlanText(source.startDate, 10),
    endDate: safePlanText(source.endDate, 10),
    scheduled: numeric('scheduled'),
    completed: numeric('completed'),
    minimum: numeric('minimum'),
    missed: numeric('missed'),
    adherenceRate: numeric('adherenceRate'),
    continuityRate: numeric('continuityRate'),
  }
}

function compactRecommendation(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  return {
    causeCategory: safePlanText(source.causeCategory, 40),
    causeSummary: safePlanText(source.causeSummary, 180),
    strategy: safePlanText(source.strategy, 40),
    routineKey: safePlanText(source.routineKey, 180),
    rationale: safePlanText(source.rationale, 240),
  }
}

function cycleContext(goal: unknown, context: PlanCycleContext = {}) {
  const duration = goal && typeof goal === 'object' && Number.isInteger((goal as GoalInput & { durationWeeks?: unknown }).durationWeeks)
    ? Number((goal as GoalInput & { durationWeeks?: unknown }).durationWeeks)
    : 104
  const requestedWeek = Number.isInteger(context.weekNumber) ? Number(context.weekNumber) : 1
  const weekNumber = Math.max(1, Math.min(Math.max(1, duration), requestedWeek))
  const previousPlan = Array.isArray(context.previousPlan) ? context.previousPlan.slice(0, 14).flatMap(value => {
    if (!value || typeof value !== 'object') return []
    const item = value as Record<string, unknown>
    const actionIndex = Number(item.actionIndex)
    if (!Number.isInteger(actionIndex) || actionIndex < 0 || actionIndex > 6) return []
    return [{
      actionIndex,
      planningStyle: ['repeat', 'progression'].includes(String(item.planningStyle)) ? item.planningStyle : inferPlanningStyle(goal, actionIndex),
      weekIndex: Number.isInteger(item.weekIndex) ? Number(item.weekIndex) : Math.max(1, weekNumber - 1),
      progressIndex: Number.isInteger(item.progressIndex) ? Number(item.progressIndex) : Number.isInteger(item.sequenceIndex) ? Number(item.sequenceIndex) : 0,
      sequenceIndex: Number.isInteger(item.sequenceIndex) ? Number(item.sequenceIndex) : 0,
      milestoneId: safePlanText(item.milestoneId, 24),
      dependsOnSequenceIndex: Number.isInteger(item.dependsOnSequenceIndex) ? Number(item.dependsOnSequenceIndex) : null,
      inputArtifact: safePlanText(item.inputArtifact, 120),
      dayIndex: Number.isInteger(item.dayIndex) ? Number(item.dayIndex) : -1,
      title: safePlanText(item.title, 80),
      completionEvidence: safePlanText(item.completionEvidence, 120),
    }]
  }) : []
  return {
    weekNumber,
    weekStart: typeof context.weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(context.weekStart) ? context.weekStart : '',
    advanceProgression: weekNumber > 1 && context.advanceProgression === true,
    previousPlan,
    weeklySummary: compactWeeklySummary(context.weeklySummary),
    reviewRecommendation: compactRecommendation(context.reviewRecommendation),
  }
}

const toMinutes = (value: string) => {
  const [hour, minute] = value.split(':').map(Number)
  return hour * 60 + minute
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) => toMinutes(aStart) < toMinutes(bEnd) && toMinutes(bStart) < toMinutes(aEnd)
const clock = /^([01]\d|2[0-3]):[0-5]\d$/

function isPlanItem(value: unknown): value is CandidatePlanItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Partial<CandidatePlanItem>
  return Number.isInteger(item.actionIndex) && Number(item.actionIndex) >= 0 && Number(item.actionIndex) <= 6
    && Number.isInteger(item.sequenceIndex) && Number(item.sequenceIndex) >= 1 && Number(item.sequenceIndex) <= 7
    && (item.dependsOnSequenceIndex === null || Number.isInteger(item.dependsOnSequenceIndex) && Number(item.dependsOnSequenceIndex) >= 1 && Number(item.dependsOnSequenceIndex) <= 7)
    && typeof item.inputArtifact === 'string' && item.inputArtifact.trim().length >= 2
    && Number.isInteger(item.dayIndex) && Number(item.dayIndex) >= 0 && Number(item.dayIndex) <= 6
    && typeof item.start === 'string' && (!item.start || clock.test(item.start))
    && typeof item.end === 'string' && (!item.end || clock.test(item.end))
    && Boolean(item.start) === Boolean(item.end)
    && ['title', 'completionEvidence', 'tinyStart', 'fallback', 'rationale'].every(field => typeof item[field as keyof CandidatePlanItem] === 'string' && String(item[field as keyof CandidatePlanItem]).trim())
}

const projectPlanGoalKey = (goal: GoalInput) => `${Math.max(0, Math.floor(Number(goal.durationWeeks) || 0))}|${safePlanText(goal.outcome, 180).toLocaleLowerCase('ko')}|${safePlanText(goal.targetMetric, 180).toLocaleLowerCase('ko')}`.slice(0, 240)

const projectRanges = (durationWeeks: number, count: number) => {
  const base = Math.floor(durationWeeks / count)
  const remainder = durationWeeks % count
  let startWeek = 1
  return Array.from({ length: count }, (_, index) => {
    const length = base + (index < remainder ? 1 : 0)
    const range = { startWeek, endWeek: startWeek + length - 1 }
    startWeek = range.endWeek + 1
    return range
  })
}

const isCandidateMilestone = (value: unknown): value is CandidateMilestone => {
  if (!value || typeof value !== 'object') return false
  const milestone = value as Partial<CandidateMilestone>
  return ['title', 'deliverable', 'completionCriterion'].every(key => safePlanText(milestone[key as keyof CandidateMilestone], key === 'completionCriterion' ? 160 : 120).length >= 2)
    && (milestone.dependsOnIndex === null || Number.isInteger(milestone.dependsOnIndex) && Number(milestone.dependsOnIndex) >= 0 && Number(milestone.dependsOnIndex) <= 3)
}

function normalizeProjectPlan(raw: unknown, goal: unknown, cycle: ReturnType<typeof cycleContext>, items: CandidatePlanItem[]) {
  const actions = planningActions(goal)
  const hasProgression = actions.some(action => action.planningStyle === 'progression')
  if (!hasProgression) return { projectPlan: null as ProjectPlan | null, issues: raw === null ? [] : ['반복 목표의 project_plan은 null이어야 함'] }
  if (!raw || typeof raw !== 'object') return { projectPlan: null, issues: ['단계형 목표의 전체 마일스톤이 필요함'] }
  const source = raw as Record<string, unknown>
  const durationWeeks = Math.max(1, Math.floor(Number((goal as GoalInput)?.durationWeeks) || 1))
  const expectedCount = Math.min(4, durationWeeks)
  const storedPlan = validStoredProjectPlan((goal as GoalInput)?.projectPlan, goal as GoalInput)
    ? structuredClone((goal as GoalInput).projectPlan as ProjectPlan)
    : null
  const candidates = Array.isArray(source.milestones) ? source.milestones : []
  const issues: string[] = []
  if (!storedPlan && (candidates.length !== expectedCount || !candidates.every(isCandidateMilestone))) issues.push(`전체 목표를 ${expectedCount}개의 유효한 마일스톤으로 나눠야 함`)
  const milestones = candidates.filter(isCandidateMilestone).slice(0, expectedCount)
  if (!storedPlan) milestones.forEach((milestone, index) => {
    const expectedDependency = index === 0 ? null : index - 1
    if (milestone.dependsOnIndex !== expectedDependency) issues.push(`${index + 1}번째 마일스톤이 바로 앞 산출물에 연결되어야 함`)
  })
  for (const [label, values] of [
    ['마일스톤 이름', milestones.map(item => canonicalPlanText(item.title))],
    ['마일스톤 산출물', milestones.map(item => canonicalPlanText(item.deliverable))],
    ['마일스톤 완료 기준', milestones.map(item => canonicalPlanText(item.completionCriterion))],
  ] as const) {
    if (!storedPlan && new Set(values).size !== values.length) issues.push(`${label}이 단계마다 달라야 함`)
  }
  const strategy = storedPlan?.strategy ?? safePlanText(source.strategy, 240)
  const weeklyObjective = safePlanText(source.weeklyObjective, 120)
  const weeklyDeliverable = safePlanText(source.weeklyDeliverable, 160)
  const weeklyCompletionCriterion = safePlanText(source.weeklyCompletionCriterion, 160)
  if (!strategy || !weeklyObjective || !weeklyDeliverable || !weeklyCompletionCriterion) issues.push('이번 주 목표·산출물·완료 기준과 전체 진행 전략이 필요함')
  if (storedPlan && cycle.advanceProgression && canonicalPlanText(weeklyDeliverable) === canonicalPlanText(storedPlan.weeklyDeliverable)) {
    issues.push('다음 주에는 지난주와 다른 새 주간 산출물이 필요함')
  }
  if (issues.length) return { projectPlan: null, issues: [...new Set(issues)] }
  const ranges = projectRanges(durationWeeks, expectedCount)
  const normalizedMilestones: ProjectMilestone[] = storedPlan?.milestones ?? milestones.map((milestone, index) => {
    const range = ranges[index]
    const id = `${range.startWeek}-${range.endWeek}`
    return {
      id,
      ...range,
      title: safePlanText(milestone.title, 80),
      deliverable: safePlanText(milestone.deliverable, 120),
      completionCriterion: safePlanText(milestone.completionCriterion, 160),
      dependsOn: index ? [`${ranges[index - 1].startWeek}-${ranges[index - 1].endWeek}`] : [],
    }
  })
  const current = normalizedMilestones.find(milestone => milestone.startWeek <= cycle.weekNumber && milestone.endWeek >= cycle.weekNumber) ?? normalizedMilestones.at(-1)!
  const firstProgression = [...items]
    .filter(item => actions[item.actionIndex]?.planningStyle === 'progression')
    .sort((a, b) => a.dayIndex - b.dayIndex || a.sequenceIndex - b.sequenceIndex)[0]
  return {
    projectPlan: {
      version: 1 as const,
      goalKey: projectPlanGoalKey(goal as GoalInput),
      planningStyle: 'progression' as const,
      strategy,
      weekIndex: cycle.weekNumber,
      currentMilestoneId: current.id,
      weeklyObjective,
      weeklyDeliverable,
      weeklyCompletionCriterion,
      inputFromPrevious: firstProgression?.inputArtifact ?? '확정된 목표와 기존 자료',
      milestones: normalizedMilestones,
    },
    issues: [],
  }
}

export function buildWeeklyPlanRequest(input: { model: string; goal: unknown; schedule: TimeBlock[]; dayBounds: DayBounds[]; regionalContext?: { locale: string; timeZone: string; countryCode?: string; weekStartsOn?: number }; cycleContext?: PlanCycleContext; validationFeedback?: string[]; previousItems?: unknown[] }) {
  const cycle = cycleContext(input.goal, input.cycleContext)
  const regionalContext = input.regionalContext ?? { locale: 'ko-KR', timeZone: 'Asia/Seoul' }
  const languageInstruction = regionalContext.locale.toLocaleLowerCase().startsWith('en')
    ? 'Write every user-facing field in natural English.'
    : '모든 사용자 표시 문구를 자연스러운 한국어로 작성한다.'
  const schema = structuredClone(weeklyPlanSchema)
  const actions = planningActions(input.goal)
  if (actions.some(action => action.planningStyle === 'progression')) {
    const durationWeeks = Math.max(1, Math.floor(Number((input.goal as GoalInput)?.durationWeeks) || 1))
    const milestoneCount = Math.min(4, durationWeeks)
    schema.properties.project_plan.properties.milestones.minItems = milestoneCount
    schema.properties.project_plan.properties.milestones.maxItems = milestoneCount
  }
  return {
    model: input.model,
    store: false,
    instructions: `${weeklyPlanInstructions}\n\nRegional requirements:\n- Locale: ${regionalContext.locale}\n- Time zone: ${regionalContext.timeZone}\n- ${languageInstruction}\n- Interpret dates and times in the stated time zone; do not assume Asia/Seoul when another zone is supplied.`,
    input: JSON.stringify({
      goal_card: input.goal,
      planning_actions: actions,
      plan_cycle: cycle,
      known_schedule_context: input.schedule,
      known_day_bounds: input.dayBounds,
      regional_context: regionalContext,
      ...(input.validationFeedback?.length ? { validation_feedback: input.validationFeedback, previous_invalid_items: input.previousItems ?? [] } : {}),
    }),
    text: { format: { type: 'json_schema', name: 'onju_weekly_plan', strict: true, schema } },
  }
}

export function validateWeeklyPlanOutput(parsed: Record<string, unknown>, schedule: TimeBlock[], dayBounds: DayBounds[], goal: unknown = {}, context: PlanCycleContext = {}) {
  const accepted: CandidatePlanItem[] = []
  const rejected: string[] = []
  const issues: string[] = []
  const actions = planningActions(goal)
  const cycle = cycleContext(goal, context)
  for (const candidate of (Array.isArray(parsed.items) ? parsed.items : [])) {
    if (!isPlanItem(candidate)) {
      rejected.push('형식 또는 필수 설명이 올바르지 않은 계획')
      continue
    }
    if (!actions[candidate.actionIndex]) {
      rejected.push('목표 행동과 연결되지 않은 계획')
      continue
    }
    let item = candidate
    const boundary = dayBounds.find(saved => saved.days?.includes(item.dayIndex))
    if (!boundary?.wake || !boundary?.bedtime) item = { ...item, start: '', end: '' }
    const timed = Boolean(item.start && item.end)
    const wake = boundary?.wake ? toMinutes(boundary.wake) : 0
    const bedtime = boundary?.bedtime ? toMinutes(boundary.bedtime) : 0
    const withinDay = !timed || Boolean(boundary) && toMinutes(item.start) >= wake && (bedtime <= wake || toMinutes(item.end) <= bedtime)
    const scheduleConflict = timed && schedule.some(block => block.days?.includes(item.dayIndex) && block.start && block.end && overlaps(item.start, item.end, block.start, block.end))
    const planConflict = accepted.some(saved => saved.dayIndex === item.dayIndex && (saved.actionIndex === item.actionIndex || (timed && saved.start && saved.end && overlaps(item.start, item.end, saved.start, saved.end))))
    if ((timed && item.start >= item.end) || !withinDay || scheduleConflict || planConflict) {
      rejected.push(`${['월', '화', '수', '목', '금', '토', '일'][item.dayIndex]} ${item.start || '시간 미정'} ${item.title}`)
    } else accepted.push(item)
  }
  for (const action of actions) {
    const occurrences = accepted.filter(item => item.actionIndex === action.actionIndex)
    if (occurrences.length !== action.frequencyPerWeek) issues.push(`${action.title}: 주 ${action.frequencyPerWeek}회가 필요하지만 ${occurrences.length}회만 생성됨`)
    const chronological = [...occurrences].sort((a, b) => a.dayIndex - b.dayIndex || a.start.localeCompare(b.start))
    issues.push(...validatePlanSequence(chronological, action.planningStyle, action.title))
    if (action.planningStyle === 'progression') {
      chronological.forEach((item, index) => {
        const expectedDependency = index === 0 ? null : chronological[index - 1].sequenceIndex
        if (item.dependsOnSequenceIndex !== expectedDependency) issues.push(`${action.title}: ${item.sequenceIndex}회차의 선행 회차 연결이 올바르지 않음`)
        if (index > 0 && canonicalPlanText(item.inputArtifact) !== canonicalPlanText(chronological[index - 1].completionEvidence)) {
          issues.push(`${action.title}: ${item.sequenceIndex}회차가 바로 앞 완료 결과를 입력으로 사용해야 함`)
        }
      })
    } else if (chronological.some(item => item.dependsOnSequenceIndex !== null)) {
      issues.push(`${action.title}: 반복 행동에는 선행 회차를 만들지 않아야 함`)
    }
    if (action.planningStyle === 'progression' && cycle.advanceProgression) {
      const previous = cycle.previousPlan.filter(item => item.actionIndex === action.actionIndex)
      const previousTitles = new Set(previous.map(item => canonicalPlanText(item.title)).filter(Boolean))
      const previousEvidence = new Set(previous.map(item => canonicalPlanText(item.completionEvidence)).filter(Boolean))
      if (chronological.some(item => previousTitles.has(canonicalPlanText(item.title)))) {
        issues.push(`${action.title}: 지난주와 같은 단계 이름을 반복하지 말고 다음 단계로 이어가야 함`)
      }
      if (chronological.some(item => previousEvidence.has(canonicalPlanText(item.completionEvidence)))) {
        issues.push(`${action.title}: 지난주와 다른 새 완료 결과를 남겨야 함`)
      }
      const previousLast = [...previous].sort((a, b) => b.progressIndex - a.progressIndex)[0]
      if (previousLast && canonicalPlanText(chronological[0]?.inputArtifact) !== canonicalPlanText(previousLast.completionEvidence)) {
        issues.push(`${action.title}: 이번 주 첫 단계가 지난주 마지막 결과를 입력으로 사용해야 함`)
      }
    }
  }
  const architecture = normalizeProjectPlan(parsed.project_plan, goal, cycle, accepted)
  issues.push(...architecture.issues)
  if (rejected.length) issues.push(`형식·시간 충돌 또는 중복으로 ${rejected.length}개 항목이 제외됨`)
  const warnings = [
    ...(Array.isArray(parsed.warnings) ? parsed.warnings.filter((item): item is string => typeof item === 'string') : []),
    ...(rejected.length ? [`기존 일정과 겹치거나 불완전한 ${rejected.length}개 제안을 제외했어요.`] : []),
  ]
  return {
    assistant_message: typeof parsed.assistant_message === 'string' ? parsed.assistant_message : '',
    items: accepted
      .sort((a, b) => a.dayIndex - b.dayIndex || a.start.localeCompare(b.start))
      .map(item => {
        const action = actions[item.actionIndex]
        const previous = cycle.previousPlan.filter(saved => saved.actionIndex === item.actionIndex)
        const previousProgress = previous.reduce((highest, saved) => Math.max(highest, saved.progressIndex), 0)
        const carriedProgress = previous.find(saved => saved.sequenceIndex === item.sequenceIndex)?.progressIndex ?? item.sequenceIndex
        return {
        actionIndex: item.actionIndex,
        planningStyle: action?.planningStyle ?? 'repeat',
        weekIndex: cycle.weekNumber,
        weekStart: cycle.weekStart,
        progressIndex: action?.planningStyle === 'progression'
          ? cycle.advanceProgression ? previousProgress + item.sequenceIndex : carriedProgress
          : item.sequenceIndex,
        sequenceIndex: item.sequenceIndex,
        milestoneId: architecture.projectPlan?.currentMilestoneId ?? '',
        dependsOnSequenceIndex: item.dependsOnSequenceIndex,
        inputArtifact: item.inputArtifact,
        dayIndex: item.dayIndex,
        start: item.start,
        end: item.end,
        title: item.title,
        completionEvidence: item.completionEvidence,
        tinyStart: item.tinyStart,
        fallback: item.fallback,
        rationale: item.rationale,
      }}),
    projectPlan: architecture.projectPlan,
    warnings,
    rejected,
    issues,
  }
}
