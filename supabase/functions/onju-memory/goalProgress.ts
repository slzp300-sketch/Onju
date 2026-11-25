export type StoredGoalProgressEntry = {
  id: string
  goalKey: string
  milestoneId: string
  weekIndex: number
  result: string
  evidence: string
  milestoneCompleted: boolean
  createdAt: string
}

type ProgressInput = {
  milestoneId?: unknown
  weekIndex?: unknown
  result?: unknown
  evidence?: unknown
  milestoneCompleted?: unknown
}

type GoalLike = { outcome?: unknown; durationWeeks?: unknown; projectPlan?: unknown }
type PlanLike = { weekIndex?: unknown }

const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''

const goalKey = (goal: GoalLike) => {
  const duration = Math.max(0, Math.floor(Number(goal.durationWeeks) || 0))
  return `${duration}|${clean(goal.outcome, 180).toLocaleLowerCase('ko')}`.slice(0, 240)
}

const validStored = (value: unknown): value is StoredGoalProgressEntry => {
  if (!value || typeof value !== 'object') return false
  const entry = value as StoredGoalProgressEntry
  return typeof entry.id === 'string' && typeof entry.goalKey === 'string'
    && /^\d+-\d+$/.test(entry.milestoneId) && Number.isInteger(entry.weekIndex)
    && typeof entry.result === 'string' && typeof entry.evidence === 'string'
    && typeof entry.milestoneCompleted === 'boolean' && typeof entry.createdAt === 'string'
}

export function appendGoalProgress(input: {
  existing: unknown
  progress: ProgressInput
  goalCard: GoalLike
  plan: PlanLike[]
  id: string
  createdAt: string
}) {
  const durationWeeks = Math.max(0, Math.floor(Number(input.goalCard.durationWeeks) || 0))
  const key = goalKey(input.goalCard)
  const result = clean(input.progress.result, 240)
  const evidence = clean(input.progress.evidence, 600)
  const match = clean(input.progress.milestoneId, 24).match(/^(\d+)-(\d+)$/)
  const weekIndex = Math.floor(Number(input.progress.weekIndex) || 0)
  const currentWeek = Math.max(1, ...input.plan.map(item => Number.isInteger(item?.weekIndex) ? Number(item.weekIndex) : 1))
  if (!durationWeeks || !clean(input.goalCard.outcome, 180) || !result || !evidence || !match || weekIndex !== currentWeek) {
    throw new Error('invalid_goal_progress')
  }
  const startWeek = Number(match[1]), endWeek = Number(match[2])
  const projectPlan = input.goalCard.projectPlan && typeof input.goalCard.projectPlan === 'object' ? input.goalCard.projectPlan as Record<string, unknown> : null
  const milestoneIds = Array.isArray(projectPlan?.milestones) ? projectPlan.milestones.flatMap(value => {
    if (!value || typeof value !== 'object') return []
    const id = clean((value as Record<string, unknown>).id, 24)
    return /^\d+-\d+$/.test(id) ? [id] : []
  }) : []
  if (startWeek < 1 || endWeek < startWeek || endWeek > durationWeeks || startWeek > currentWeek) {
    throw new Error('future_goal_progress')
  }
  if (milestoneIds.length && !milestoneIds.includes(`${startWeek}-${endWeek}`)) throw new Error('invalid_goal_progress')
  const entry: StoredGoalProgressEntry = {
    id: input.id,
    goalKey: key,
    milestoneId: `${startWeek}-${endWeek}`,
    weekIndex,
    result,
    evidence,
    milestoneCompleted: input.progress.milestoneCompleted === true,
    createdAt: input.createdAt,
  }
  const existing = Array.isArray(input.existing) ? input.existing.filter(validStored) : []
  return { entry, entries: [...existing.filter(item => item.id !== entry.id), entry].slice(-100) }
}
