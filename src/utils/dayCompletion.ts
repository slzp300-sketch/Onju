import type { Habit, DailyRoutine, RoutineLog } from '../types';
import { isHabitDue, isFaithDue } from './scheduledItems';
import { eachDayOfInterval, format } from 'date-fns';

interface HabitLog {
  habitId: string;
  date: string;
  completed: boolean;
  skipped?: boolean;
  substitute?: boolean;
}

export type DayState = 'perfect' | 'partial' | 'missed' | 'rest' | 'future';

export interface DayCompletion {
  personalRate: number; // -1 = 예정 없음
  faithRate: number;    // -1 = 예정 없음
  combinedRate: number; // -1 = 예정 없음 (개인+신앙 통합)
  state: DayState;
  personalTotal: number;
  personalDone: number;
  faithTotal: number;
  faithDone: number;
}

/**
 * 그날의 달성 현황 — "예정일 기준" 앱 공통 정의.
 * 완료·대체·쉬어가기 모두 달성으로 인정.
 */
export function getDayCompletion(
  dateIso: string,
  habits: Habit[],
  habitLogs: HabitLog[],
  faithRoutines: DailyRoutine[],
  routineLogs: RoutineLog[],
  isFuture = false,
): DayCompletion {
  const schedHabits = habits.filter(h => isHabitDue(h, dateIso));
  const schedFaith  = faithRoutines.filter(r => isFaithDue(r, dateIso));

  const doneH = schedHabits.filter(h =>
    habitLogs.some(l => l.habitId === h.id && l.date === dateIso && (l.completed || l.skipped || l.substitute))
  ).length;
  const doneF = schedFaith.filter(r =>
    routineLogs.some(l => l.routineId === r.id && l.date === dateIso && (l.completed || l.skipped))
  ).length;

  const totalP = schedHabits.length;
  const totalF = schedFaith.length;
  const total = totalP + totalF;
  const done = doneH + doneF;

  const personalRate = totalP === 0 ? -1 : Math.round((doneH / totalP) * 100);
  const faithRate    = totalF === 0 ? -1 : Math.round((doneF / totalF) * 100);
  const combinedRate = total === 0 ? -1 : Math.round((done / total) * 100);

  const state: DayState =
    isFuture ? 'future'
    : total === 0 ? 'rest'
    : done === total ? 'perfect'
    : done > 0 ? 'partial'
    : 'missed';

  return { personalRate, faithRate, combinedRate, state, personalTotal: totalP, personalDone: doneH, faithTotal: totalF, faithDone: doneF };
}

/** 통계와 같은 일별 기록률의 평균. 미래와 예정 없는 날은 제외한다. */
export function getPeriodCompletion(
  start: Date, end: Date, todayIso: string,
  habits: Habit[], habitLogs: HabitLog[], faithRoutines: DailyRoutine[], routineLogs: RoutineLog[],
) {
  const days = start > end ? [] : eachDayOfInterval({ start, end })
    .map(d => format(d, 'yyyy-MM-dd')).filter(d => d <= todayIso)
    .map(d => getDayCompletion(d, habits, habitLogs, faithRoutines, routineLogs));
  const average = (rates: number[]) => {
    const scheduled = rates.filter(rate => rate >= 0);
    return scheduled.length ? Math.round(scheduled.reduce((a, b) => a + b, 0) / scheduled.length) : 0;
  };
  return { personalRate: average(days.map(d => d.personalRate)), faithRate: average(days.map(d => d.faithRate)), combinedRate: average(days.map(d => d.combinedRate)) };
}
