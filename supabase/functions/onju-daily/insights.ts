import type { ItemStatus } from './state.ts'

export const ROUTINE_GRADES = ['observation', 'normal', 'strong', 'excluded'] as const
export type RoutineGrade = typeof ROUTINE_GRADES[number]

export function isRoutineGrade(value: unknown): value is RoutineGrade {
  return typeof value === 'string' && ROUTINE_GRADES.includes(value as RoutineGrade)
}

export type InsightRoutine = {
  id: string
  title: string
  dayIndex: number
  grade?: RoutineGrade
  activatedOn?: string
  deactivatedOn?: string | null
}

export type InsightItemLog = {
  routineItemId: string
  logDate: string
  status: ItemStatus
}

export type InsightDailyLog = {
  logDate: string
  blocker: string
}

export type WeeklySignal = {
  type: 'missed_streak' | 'low_adherence' | 'repeated_blocker'
  title: string
  detail: string
  evidenceCount: number
  routineTitle: string | null
}

export type WeeklyRoutineSummary = {
  routineKey: string
  title: string
  scheduled: number
  completed: number
  minimum: number
  missed: number
  exception: number
  unrecorded: number
  outcomeCount: number
  adherenceRate: number | null
  continuityRate: number | null
}

export type WeeklyInsights = {
  startDate: string
  endDate: string
  scheduled: number
  completed: number
  minimum: number
  missed: number
  observedSkipped: number
  exception: number
  unrecorded: number
  recordedDays: number
  outcomeCount: number
  adherenceRate: number | null
  continuityRate: number | null
  coverageRate: number | null
  days: Array<{
    date: string
    dayIndex: number
    label: string
    isToday: boolean
    scheduled: number
    completed: number
    minimum: number
    missed: number
    observedSkipped: number
    exception: number
    unrecorded: number
  }>
  routines: WeeklyRoutineSummary[]
  signals: WeeklySignal[]
  note: string
}

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일']
const ENGLISH_DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const datePattern = /^\d{4}-\d{2}-\d{2}$/

function toUtcDate(date: string) {
  if (!datePattern.test(date)) throw new Error('invalid_date')
  return new Date(`${date}T12:00:00.000Z`)
}

export function addCalendarDays(date: string, amount: number) {
  const next = toUtcDate(date)
  next.setUTCDate(next.getUTCDate() + amount)
  return next.toISOString().slice(0, 10)
}

export function dayIndexForDate(date: string) {
  return (toUtcDate(date).getUTCDay() + 6) % 7
}

export function rollingWeekDates(today: string) {
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(today, index - 6))
}

export function routineIdentity(title: string) {
  return title
    .toLocaleLowerCase('ko')
    .replace(/\s*[·|]\s*\d+\s*분(?:\s*.*)?$/u, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function canAssignStrongGrade(existingStrongKeys: string[], targetKey: string) {
  const keys = new Set(existingStrongKeys.filter(Boolean))
  return keys.has(targetKey) || keys.size < 2
}

function isActiveOn(routine: InsightRoutine, date: string) {
  return (!routine.activatedOn || routine.activatedOn <= date) && (!routine.deactivatedOn || routine.deactivatedOn >= date)
}

function blockerKey(value: string) {
  const compact = value.toLocaleLowerCase('ko').replace(/[.,!?~。！？]/g, '').replace(/\s+/g, ' ').trim()
  return /^(?:없(?:어|어요|습니다)?|없음|괜찮(?:아|아요)?|모르겠(?:어|어요)?|none|nothing|no|not sure|i don't know)$/.test(compact) ? '' : compact
}

export function buildWeeklyInsights(
  today: string,
  routines: InsightRoutine[],
  logs: InsightItemLog[],
  dailyLogs: InsightDailyLog[],
  locale = 'ko-KR',
): WeeklyInsights {
  const english = locale.toLocaleLowerCase().startsWith('en')
  const dates = rollingWeekDates(today)
  const dateSet = new Set(dates)
  const trackedRoutines = routines.filter(routine => routine.grade !== 'excluded')
  const routineById = new Map(trackedRoutines.map(routine => [routine.id, routine]))
  const validLogs = logs.filter(log => {
    const routine = routineById.get(log.routineItemId)
    return dateSet.has(log.logDate) && !!routine && isActiveOn(routine, log.logDate)
  })
  const logBySlot = new Map(validLogs.map(log => [`${log.logDate}:${log.routineItemId}`, log]))

  const days = dates.map(date => {
    const dayIndex = dayIndexForDate(date)
    const scheduledRoutines = trackedRoutines.filter(routine => routine.dayIndex === dayIndex && isActiveOn(routine, date))
    const slots = scheduledRoutines.map(routine => ({
      grade: routine.grade ?? 'normal',
      status: logBySlot.get(`${date}:${routine.id}`)?.status ?? null,
    }))
    const completed = slots.filter(slot => slot.status === 'completed').length
    const minimum = slots.filter(slot => slot.status === 'minimum').length
    const missed = slots.filter(slot => slot.status === 'missed' && slot.grade !== 'observation').length
    const observedSkipped = slots.filter(slot => slot.status === 'missed' && slot.grade === 'observation').length
    const exception = slots.filter(slot => slot.status === 'exception').length
    return {
      date,
      dayIndex,
      label: (english ? ENGLISH_DAY_LABELS : DAY_LABELS)[dayIndex],
      isToday: date === today,
      scheduled: scheduledRoutines.length,
      completed,
      minimum,
      missed,
      observedSkipped,
      exception,
      unrecorded: slots.filter(slot => slot.status === null).length,
    }
  })

  const scheduled = days.reduce((sum, day) => sum + day.scheduled, 0)
  const completed = days.reduce((sum, day) => sum + day.completed, 0)
  const minimum = days.reduce((sum, day) => sum + day.minimum, 0)
  const missed = days.reduce((sum, day) => sum + day.missed, 0)
  const observedSkipped = days.reduce((sum, day) => sum + day.observedSkipped, 0)
  const exception = days.reduce((sum, day) => sum + day.exception, 0)
  const unrecorded = days.reduce((sum, day) => sum + day.unrecorded, 0)
  const accountableLogs = validLogs.filter(log => {
    const grade = routineById.get(log.routineItemId)?.grade ?? 'normal'
    return grade !== 'observation' && (log.status === 'completed' || log.status === 'minimum' || log.status === 'missed')
  })
  const accountableCompleted = accountableLogs.filter(log => log.status === 'completed').length
  const accountableContinued = accountableLogs.filter(log => log.status === 'completed' || log.status === 'minimum').length
  const outcomeCount = accountableLogs.length
  const recordedDates = new Set([
    ...validLogs.map(log => log.logDate),
    ...dailyLogs.filter(log => dateSet.has(log.logDate)).map(log => log.logDate),
  ])

  const groups = new Map<string, { title: string; routines: InsightRoutine[] }>()
  for (const routine of trackedRoutines.filter(item => item.grade !== 'observation')) {
    const key = routineIdentity(routine.title) || routine.id
    const group = groups.get(key) ?? { title: routine.title, routines: [] }
    group.routines.push(routine)
    groups.set(key, group)
  }

  const signals: WeeklySignal[] = []
  const routineSummaries: WeeklyRoutineSummary[] = []
  for (const [routineKey, group] of groups.entries()) {
    const scheduledSlots = dates.flatMap(date => {
      const dayIndex = dayIndexForDate(date)
      return group.routines.filter(routine => routine.dayIndex === dayIndex && isActiveOn(routine, date)).map(routine => ({
        date,
        status: logBySlot.get(`${date}:${routine.id}`)?.status ?? null,
      }))
    })
    const outcomes = scheduledSlots.filter(slot => slot.status === 'completed' || slot.status === 'minimum' || slot.status === 'missed')
    const groupCompleted = outcomes.filter(slot => slot.status === 'completed').length
    const groupMinimum = outcomes.filter(slot => slot.status === 'minimum').length
    const groupMissed = outcomes.filter(slot => slot.status === 'missed').length
    const groupContinued = outcomes.filter(slot => slot.status === 'completed' || slot.status === 'minimum').length
    routineSummaries.push({
      routineKey,
      title: group.title,
      scheduled: scheduledSlots.length,
      completed: groupCompleted,
      minimum: groupMinimum,
      missed: groupMissed,
      exception: scheduledSlots.filter(slot => slot.status === 'exception').length,
      unrecorded: scheduledSlots.filter(slot => slot.status === null).length,
      outcomeCount: outcomes.length,
      adherenceRate: outcomes.length ? Math.round((groupCompleted / outcomes.length) * 100) : null,
      continuityRate: outcomes.length ? Math.round((groupContinued / outcomes.length) * 100) : null,
    })
    const grade = group.routines.some(routine => routine.grade === 'strong') ? 'strong' : 'normal'
    const missedThreshold = grade === 'strong' ? 2 : 3
    let missedStreak = 0
    for (const slot of [...scheduledSlots].reverse()) {
      if (slot.status !== 'missed') break
      missedStreak += 1
    }
    if (missedStreak >= missedThreshold) {
      signals.push({
        type: 'missed_streak',
        title: english
          ? `${group.title} · ${grade === 'strong' ? 'strong rule · ' : ''}${missedStreak} consecutive misses`
          : `${group.title} · ${grade === 'strong' ? '강한 규칙 ' : ''}${missedStreak}회 연속 미실행`,
        detail: english
          ? grade === 'strong'
            ? 'This strong rule stays recorded as missed today; it will not be carried forward. We’ll identify the repeated cause once during the closing check-in.'
            : 'I won’t reduce this to a willpower problem. It is time to check whether the timing or a prerequisite keeps breaking down.'
          : grade === 'strong'
            ? '강한 규칙은 오늘도 미실행으로 남기고 회수하지 않아요. 반복된 이유는 마감 점검에서 한 번 분명히 확인할게요.'
            : '의지 문제로 단정하지 않을게요. 시간 배치나 그 전에 필요한 조건이 무너졌는지 확인할 시점입니다.',
        evidenceCount: missedStreak,
        routineTitle: group.title,
      })
    } else if (outcomes.length >= 3) {
      const rate = Math.round((groupContinued / outcomes.length) * 100)
      if (rate < 50) {
        signals.push({
          type: 'low_adherence',
          title: english ? `${group.title} · recent adherence ${rate}%` : `${group.title} · 최근 이행률 ${rate}%`,
          detail: english
            ? `You kept the routine going in ${groupContinued} of ${outcomes.length} recorded attempts. Before changing next week’s plan, we’ll identify the obstacle that keeps repeating.`
            : `${outcomes.length}번의 기록 중 ${groupContinued}번 흐름을 이어갔어요. 다음 주 계획을 바꾸기 전에 반복되는 방해 조건부터 확인해 볼게요.`,
          evidenceCount: outcomes.length,
          routineTitle: group.title,
        })
      }
    }
  }

  const blockerCounts = new Map<string, { text: string; count: number }>()
  for (const log of dailyLogs) {
    if (!dateSet.has(log.logDate)) continue
    const key = blockerKey(log.blocker)
    if (!key) continue
    const current = blockerCounts.get(key) ?? { text: log.blocker.trim(), count: 0 }
    current.count += 1
    blockerCounts.set(key, current)
  }
  const repeatedBlocker = [...blockerCounts.values()].sort((a, b) => b.count - a.count)[0]
  if (repeatedBlocker && repeatedBlocker.count >= 3) {
    signals.push({
      type: 'repeated_blocker',
      title: english ? `The same obstacle appeared ${repeatedBlocker.count} times` : `같은 방해 요인이 ${repeatedBlocker.count}번 반복됐어요`,
      detail: english
        ? `“${repeatedBlocker.text}” was recorded repeatedly. Before shrinking the goal, we’ll create options that avoid this condition or change the prerequisite.`
        : `“${repeatedBlocker.text}”이 반복해서 기록됐습니다. 목표를 줄이기보다 이 조건을 피하거나 앞단계를 바꾸는 선택지를 먼저 만들게요.`,
      evidenceCount: repeatedBlocker.count,
      routineTitle: null,
    })
  }

  signals.sort((a, b) => b.evidenceCount - a.evidenceCount)
  const note = english
    ? signals.length
      ? `I found ${signals.length} repeated signal${signals.length === 1 ? '' : 's'} in the last seven days. The judgment is based on accumulated records, not one miss.`
      : !trackedRoutines.some(routine => routine.grade !== 'observation')
        ? 'Observation items only track frequency; they are not judged as success or failure.'
        : outcomeCount < 3
          ? `No judgment yet. After ${3 - outcomeCount} more recorded result${3 - outcomeCount === 1 ? '' : 's'}, we can check for a pattern.`
          : 'There is no repeated signal strong enough to change the structure yet. Keep recording with the current approach.'
    : signals.length
      ? `최근 7일 기록에서 ${signals.length}개의 반복 신호를 찾았어요. 한 번의 실패가 아니라 누적된 기록만 근거로 삼았습니다.`
      : !trackedRoutines.some(routine => routine.grade !== 'observation')
        ? '관찰 항목은 빈도만 모으고 성공과 실패를 판단하지 않아요.'
        : outcomeCount < 3
          ? `아직 판단하지 않아요. 실행 결과가 ${3 - outcomeCount}번 더 쌓이면 반복 여부를 확인할 수 있어요.`
          : '아직 구조를 바꿀 만큼 반복된 신호는 없어요. 지금 방식으로 기록을 이어가면 됩니다.'

  return {
    startDate: dates[0],
    endDate: today,
    scheduled,
    completed,
    minimum,
    missed,
    observedSkipped,
    exception,
    unrecorded,
    recordedDays: recordedDates.size,
    outcomeCount,
    adherenceRate: outcomeCount ? Math.round((accountableCompleted / outcomeCount) * 100) : null,
    continuityRate: outcomeCount ? Math.round((accountableContinued / outcomeCount) * 100) : null,
    coverageRate: scheduled ? Math.round(((completed + minimum + missed + observedSkipped + exception) / scheduled) * 100) : null,
    days,
    routines: routineSummaries,
    signals,
    note,
  }
}
