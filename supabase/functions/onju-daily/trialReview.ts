import { addCalendarDays, dayIndexForDate, routineIdentity } from './insights.ts'
import { structureOptionsFor, type DependencyKind } from './structure.ts'
import type { ItemStatus } from './state.ts'

export type TrialRecord = { id: string; routineKey: string; strategyId: string; strategy: string; dependencyKind: DependencyKind; startedOn: string; trialUntil: string; extensionCount: number }
export type TrialRoutine = { id: string; routineKey: string; title: string; dayIndex: number; activatedOn?: string; deactivatedOn?: string | null }
export type TrialItemLog = { routineItemId: string; logDate: string; status: ItemStatus }
export type TrialRecommendation = 'pending' | 'extend' | 'keep' | 'modify' | 'stop'

function daysBetween(from: string, to: string) {
  const start = new Date(`${from}T12:00:00.000Z`).getTime()
  const end = new Date(`${to}T12:00:00.000Z`).getTime()
  return Math.max(0, Math.round((end - start) / 86_400_000))
}
function calendarDates(from: string, to: string) {
  return Array.from({ length: daysBetween(from, to) + 1 }, (_, index) => addCalendarDays(from, index))
}

export function buildTrialReview(today: string, trial: TrialRecord, routines: TrialRoutine[], logs: TrialItemLog[], locale = 'ko-KR') {
  const english = locale.toLocaleLowerCase().startsWith('en')
  const routineRows = routines.filter(routine => routine.routineKey === trial.routineKey || routineIdentity(routine.title) === trial.routineKey)
  const title = routineRows[0]?.title ?? trial.routineKey
  const lastObservedDate = today < trial.trialUntil ? today : trial.trialUntil
  const dates = lastObservedDate < trial.startedOn ? [] : calendarDates(trial.startedOn, lastObservedDate)
  const routineIds = new Set(routineRows.map(routine => routine.id))
  const logBySlot = new Map(logs.filter(log => routineIds.has(log.routineItemId) && log.logDate >= trial.startedOn && log.logDate <= lastObservedDate).map(log => [`${log.logDate}:${log.routineItemId}`, log.status]))
  const statuses = dates.flatMap(date => routineRows.filter(routine => routine.dayIndex === dayIndexForDate(date) && (!routine.activatedOn || routine.activatedOn <= date) && (!routine.deactivatedOn || routine.deactivatedOn >= date)).map(routine => logBySlot.get(`${date}:${routine.id}`) ?? null))
  const completed = statuses.filter(status => status === 'completed').length
  const minimum = statuses.filter(status => status === 'minimum').length
  const missed = statuses.filter(status => status === 'missed').length
  const exception = statuses.filter(status => status === 'exception').length
  const unrecorded = statuses.filter(status => status === null).length
  const outcomeCount = completed + minimum + missed
  const adherenceRate = outcomeCount ? Math.round((completed / outcomeCount) * 100) : null
  const continuityRate = outcomeCount ? Math.round(((completed + minimum) / outcomeCount) * 100) : null
  const due = today >= trial.trialUntil
  const recommendation: TrialRecommendation = !due ? 'pending' : outcomeCount < 3 && trial.extensionCount < 1 ? 'extend' : outcomeCount < 3 ? 'stop' : continuityRate! >= 70 ? 'keep' : continuityRate! >= 40 ? 'modify' : 'stop'
  const summary = english
    ? recommendation === 'pending'
      ? `${Math.max(0, daysBetween(today, trial.trialUntil))} days remain until the decision date. For now, keep collecting records instead of judging the result.`
      : recommendation === 'extend'
        ? `${3 - outcomeCount} more execution results are needed for a sound judgment. It is safer to observe for seven more days without reaching a conclusion.`
        : recommendation === 'keep'
          ? `Of ${outcomeCount} recorded attempts, ${completed} were fully completed and ${minimum} used the minimum action. There is enough evidence to keep the current structure.`
          : recommendation === 'modify'
            ? `Of ${outcomeCount} recorded attempts, ${completed} were fully completed and ${minimum} used the minimum action. Keep the routine, but change its prerequisite structure and test again.`
            : outcomeCount < 3
              ? 'Even after one extension, there is not enough evidence. Stop this structure and review the schedule itself first.'
              : `Of ${outcomeCount} recorded attempts, ${completed} were fully completed and ${minimum} used the minimum action. Stop this approach and choose a different structure.`
    : recommendation === 'pending'
      ? `결정일까지 ${Math.max(0, daysBetween(today, trial.trialUntil))}일 남았어요. 지금은 결과보다 기록을 모을 때예요.`
      : recommendation === 'extend'
        ? `판단에 필요한 실행 결과가 ${3 - outcomeCount}번 부족해요. 결론을 내리지 않고 7일만 더 관찰하는 편이 안전해요.`
        : recommendation === 'keep'
          ? `${outcomeCount}번의 실행 결과 중 ${completed}번 완전 실행하고 ${minimum}번 최소 실행했어요. 현재 구조를 유지할 근거가 충분합니다.`
          : recommendation === 'modify'
            ? `${outcomeCount}번의 실행 결과 중 ${completed}번 완전 실행하고 ${minimum}번 최소 실행했어요. 루틴은 유지하되 선행 구조를 바꿔 다시 시험하는 편이 좋아요.`
            : outcomeCount < 3
              ? '한 차례 연장 후에도 기록이 충분히 생기지 않았어요. 현재 구조를 멈추고 일정 자체부터 다시 확인하는 편이 좋아요.'
              : `${outcomeCount}번의 실행 결과 중 ${completed}번 완전 실행하고 ${minimum}번 최소 실행했어요. 현재 방식은 중단하고 다른 구조를 선택하는 편이 좋아요.`
  return { elapsedDays: dates.length, totalDays: daysBetween(trial.startedOn, trial.trialUntil) + 1, scheduled: statuses.length, completed, minimum, missed, exception, unrecorded, outcomeCount, adherenceRate, continuityRate, due, recommendation, summary, alternativeOptions: structureOptionsFor(trial.dependencyKind, title, locale).filter(option => option.id !== trial.strategyId) }
}
