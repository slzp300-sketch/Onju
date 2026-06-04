import { format } from 'date-fns';
import type { MonthlyGoal, Habit, DailyRoutine, RoutineLog } from '../types';

interface HabitLog {
  habitId: string;
  date: string;
  completed: boolean;
  skipped?: boolean;
  substitute?: boolean;
}

/** start~end (양끝 포함) 날짜 문자열 배열 */
function dateRange(startIso: string, endIso: string): string[] {
  if (startIso > endIso) return [];
  const days: string[] = [];
  const d = new Date(startIso + 'T12:00:00');
  const end = new Date(endIso + 'T12:00:00');
  while (d <= end) {
    days.push(format(d, 'yyyy-MM-dd'));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** 목표에 연동된 항목 (개인 습관 + 신앙 루틴) */
export interface LinkedItem {
  id: string;
  title: string;
  emoji?: string;
  kind: 'habit' | 'faith';
  rate: number; // 개별 달성률 (완료 횟수 / 전체 기간 일수)
}

export function getLinkedItems(
  goal: MonthlyGoal,
  habits: Habit[],
  habitLogs: HabitLog[],
  faithRoutines: DailyRoutine[],
  routineLogs: RoutineLog[],
  todayIso: string,
): LinkedItem[] {
  const totalDays = dateRange(goal.startDate, goal.endDate).length;
  if (totalDays === 0) return [];

  // 분자 계산 범위: 시작 ~ min(오늘, 종료)
  const endForCount = todayIso < goal.endDate ? todayIso : goal.endDate;
  const elapsed = new Set(dateRange(goal.startDate, endForCount));

  const items: LinkedItem[] = [];

  habits.filter(h => h.goalId === goal.id).forEach(h => {
    const doneCount = habitLogs.filter(
      l => l.habitId === h.id && elapsed.has(l.date) && (l.completed || l.skipped || l.substitute)
    ).length;
    items.push({
      id: h.id, title: h.title, emoji: h.emoji, kind: 'habit',
      rate: Math.round((doneCount / totalDays) * 100),
    });
  });

  faithRoutines.filter(r => r.goalId === goal.id).forEach(r => {
    const doneCount = routineLogs.filter(
      l => l.routineId === r.id && elapsed.has(l.date) && (l.completed || l.skipped)
    ).length;
    items.push({
      id: r.id, title: r.title, emoji: r.emoji, kind: 'faith',
      rate: Math.round((doneCount / totalDays) * 100),
    });
  });

  return items;
}

/**
 * 목표 전체 달성률 = 연동 항목 개별 달성률의 평균 (가중 평균)
 * = 총 완료 횟수 / (연동 항목 수 × 전체 기간 일수) × 100
 */
export function getGoalRate(
  goal: MonthlyGoal,
  habits: Habit[],
  habitLogs: HabitLog[],
  faithRoutines: DailyRoutine[],
  routineLogs: RoutineLog[],
  todayIso: string,
): number {
  const items = getLinkedItems(goal, habits, habitLogs, faithRoutines, routineLogs, todayIso);
  if (items.length === 0) return 0;
  const sum = items.reduce((acc, it) => acc + it.rate, 0);
  return Math.round(sum / items.length);
}
