import type { RoutineLog, WeeklyGoal } from '../types';

interface HabitLogLike {
  habitId: string;
  date: string;         // YYYY-MM-DD
  completed: boolean;
  skipped?: boolean;
  substitute?: boolean; // 미니 습관으로 대체 수행
}

/**
 * 주간 목표의 수행 횟수 — 연동된 습관/루틴의 체크 로그에서 자동 계산.
 * 같은 날 중복 로그는 1회로 센다. 습관의 대체 수행(substitute)은 수행으로 인정.
 */
export function countWeeklyGoalDone(
  goal: WeeklyGoal,
  habitLogs: HabitLogLike[],
  routineLogs: RoutineLog[],
): number {
  if (!goal.linkedKind || !goal.linkedId) return 0;
  const inWeek = (date: string) => date >= goal.startDate && date <= goal.endDate;
  const days = new Set<string>();
  if (goal.linkedKind === 'habit') {
    for (const l of habitLogs) {
      if (l.habitId === goal.linkedId && inWeek(l.date) && (l.completed || l.substitute)) {
        days.add(l.date);
      }
    }
  } else {
    for (const l of routineLogs) {
      if (l.routineId === goal.linkedId && inWeek(l.date) && l.completed) {
        days.add(l.date);
      }
    }
  }
  return days.size;
}

/** 목표 1개의 달성률 (0~100, 초과 수행은 100으로 캡) */
export function weeklyGoalRate(goal: WeeklyGoal, done: number): number {
  if (goal.targetCount <= 0) return 0;
  return Math.min(100, Math.round((done / goal.targetCount) * 100));
}

/** 여러 목표의 평균 달성률 — 슬롯 해금 판정 기준. 목표가 없으면 0. */
export function avgWeeklyGoalRate(
  goals: WeeklyGoal[],
  habitLogs: HabitLogLike[],
  routineLogs: RoutineLog[],
): number {
  if (goals.length === 0) return 0;
  const sum = goals.reduce(
    (acc, g) => acc + weeklyGoalRate(g, countWeeklyGoalDone(g, habitLogs, routineLogs)),
    0,
  );
  return Math.round(sum / goals.length);
}
