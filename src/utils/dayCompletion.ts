import type { Habit, DailyRoutine, RoutineLog } from '../types';
import { isScheduled } from './goalProgress';

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
  const schedHabits = habits.filter(h => isScheduled(dateIso, h.frequency, h.customDays));
  const schedFaith  = faithRoutines.filter(r => isScheduled(dateIso, r.frequency));

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

  return { personalRate, faithRate, combinedRate, state };
}
