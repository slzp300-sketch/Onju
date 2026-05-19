import type { RoutineLog, DailyRoutine } from '../types';
import { eachDayOfInterval, format, subDays, getDay, startOfMonth, endOfMonth } from 'date-fns';

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

export function calcRoutineRate(
  routine: DailyRoutine,
  logs: RoutineLog[],
  startDate: Date,
  endDate: Date
): number {
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  let total = 0;
  let completed = 0;
  days.forEach((day) => {
    total++;
    const dateStr = format(day, 'yyyy-MM-dd');
    const log = logs.find(l => l.routineId === routine.id && l.date === dateStr);
    if (log?.completed) completed++;
  });
  return total === 0 ? 0 : Math.round((completed / total) * 100);
}

export function getRoutineStats(
  routines: DailyRoutine[],
  logs: RoutineLog[],
  startDate: Date,
  endDate: Date
): { routine: DailyRoutine; rate: number }[] {
  return routines
    .map(r => ({ routine: r, rate: calcRoutineRate(r, logs, startDate, endDate) }))
    .sort((a, b) => b.rate - a.rate);
}

export function getWeekdayStats(
  routines: DailyRoutine[],
  logs: RoutineLog[],
  month: number,
  year: number
): Record<number, { personal: number; faith: number }> {
  const start = startOfMonth(new Date(year, month - 1));
  const end = endOfMonth(start);
  const days = eachDayOfInterval({ start, end });

  const byWeekday: Record<number, { personalRates: number[]; faithRates: number[] }> = {};
  for (let i = 0; i < 7; i++) byWeekday[i] = { personalRates: [], faithRates: [] };

  const personal = routines.filter(r => r.type === 'personal');
  const faith = routines.filter(r => r.type === 'faith');

  days.forEach((day) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayLogs = logs.filter(l => l.date === dateStr);
    const { personal: pRate, faith: fRate } = getTodayRates(personal, faith, dayLogs, dateStr);
    const weekday = getDay(day);
    byWeekday[weekday].personalRates.push(pRate);
    byWeekday[weekday].faithRates.push(fRate);
  });

  const avg = (arr: number[]) => arr.length === 0 ? 0 : Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
  const result: Record<number, { personal: number; faith: number }> = {};
  for (let i = 0; i < 7; i++) {
    result[i] = {
      personal: avg(byWeekday[i].personalRates),
      faith: avg(byWeekday[i].faithRates),
    };
  }
  return result;
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
      if (i === 0) { running = 0; break; }
      best = Math.max(best, running);
      running = 0;
    }
  }

  return { current, best };
}

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
