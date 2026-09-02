import type { RoutineLog, DailyRoutine } from '../types';
import { eachDayOfInterval, format, subDays } from 'date-fns';

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

export function calcStreak(
  routines: DailyRoutine[],
  logs: RoutineLog[],
  today: string
): { current: number; best: number } {
  if (routines.length === 0) return { current: 0, best: 0 };
  let current = 0;
  let best = 0;
  let running = 0;

  for (let i = 0; i < 365; i++) {
    const date = format(subDays(new Date(today), i), 'yyyy-MM-dd');
    const dayLogs = logs.filter(l => l.date === date);
    const done = routines.filter(r => dayLogs.find(l => l.routineId === r.id && l.completed)).length;
    const rate = Math.round((done / routines.length) * 100);

    if (rate >= 50) {
      running++;
      best = Math.max(best, running);
      if (i === 0 || current === i) current = running;
    } else {
      if (i === 0) { break; }
      best = Math.max(best, running);
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
