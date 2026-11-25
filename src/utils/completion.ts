import { getDayCompletion } from './dayCompletion';
import type { RoutineLog, DailyRoutine, Habit } from '../types';
import { eachDayOfInterval, format, subDays } from 'date-fns';

/** @preserved 보존된 routineRecommendation에서 사용하는 과거 계산 방식 */
export function calcCompletionRate(
  routines: DailyRoutine[],
  logs: RoutineLog[],
  startDate: Date,
  endDate: Date
): number {
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  let total = 0;
  let completed = 0;

  days.forEach((day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    routines.forEach((routine) => {
      total++;
      const log = logs.find(
        (l) => l.routineId === routine.id && l.date === dateStr
      );
      if (log?.completed) completed++;
    });
  });

  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

/** 최근 365일, 개인 습관+신앙의 예정 항목 절반 이상 기록한 날의 연속.
 * 예정이 없는 날은 끊지 않고 오늘 미완료는 아직 기회가 있어 제외한다. */
export function calcStreak(
  routines: DailyRoutine[], logs: RoutineLog[], today: string,
  habits: Habit[] = [], habitLogs: { habitId: string; date: string; completed: boolean; skipped?: boolean; substitute?: boolean }[] = [],
): { current: number; best: number } {
  let current = 0, best = 0, running = 0;
  let countingCurrent = true;
  for (let i = 0; i < 365; i++) {
    const date = format(subDays(new Date(today + 'T12:00:00'), i), 'yyyy-MM-dd');
    const result = getDayCompletion(date, habits, habitLogs, routines, logs);
    if (result.state === 'rest') continue;
    if (result.combinedRate >= 50) {
      running++;
      best = Math.max(best, running);
      if (countingCurrent) current++;
    } else if (i !== 0) {
      countingCurrent = false;
      running = 0;
    }
  }
  return { current, best };
}

/** @preserved 보존 중인 통계 스펙 후보(HeatMap·MonthlyCalendar)가 사용 */
export function getTodayRates(
  personalRoutines: DailyRoutine[],
  faithRoutines: DailyRoutine[],
  logs: RoutineLog[],
  today: string
) {
  const getTodayRate = (routines: DailyRoutine[]) => {
    if (routines.length === 0) return 0;
    const done = routines.filter((r) =>
      logs.find((l) => l.routineId === r.id && l.date === today && l.completed)
    ).length;
    return Math.round((done / routines.length) * 100);
  };

  return {
    personal: getTodayRate(personalRoutines),
    faith: getTodayRate(faithRoutines),
  };
}
