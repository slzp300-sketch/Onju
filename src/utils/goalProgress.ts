import { isItemDue, ruleAt } from './scheduleHistory';
import { createdLocalDate } from './date';
import { calendarDayNumber, goalPeriodError } from './goalRules';
import { isScheduled } from './schedule';
import type { MonthlyGoal, Habit, DailyRoutine, RoutineLog } from '../types';

interface HabitLog {
  habitId: string;
  date: string;
  completed: boolean;
  skipped?: boolean;
  substitute?: boolean;
}

/** Count whole weeks plus at most six days per revision, even for long periods. */
function scheduledCount(item: Habit | DailyRoutine, goal: MonthlyGoal, end: string): number {
  const start = [goal.startDate, createdLocalDate(item.createdAt)].sort().at(-1)!;
  if (start > end) return 0;
  const points = [...new Set([start, ...(item.scheduleHistory ?? []).map(r => r.from).filter(d => d > start && d <= end)])].sort();
  let count = 0;
  for (let i = 0; i < points.length; i++) {
    const rule = ruleAt(item, points[i]);
    if (!rule?.active || rule.goalId !== goal.id) continue;
    const from = calendarDayNumber(points[i]);
    const through = i + 1 < points.length ? calendarDayNumber(points[i + 1]) - 1 : calendarDayNumber(end);
    const length = through - from + 1;
    if (!Number.isFinite(length) || length <= 0) continue;
    const due = Array.from({ length: 7 }, (_, offset) => isScheduled(new Date((from + offset) * 86400000).toISOString().slice(0, 10), rule.frequency, rule.customDays));
    count += Math.floor(length / 7) * due.filter(Boolean).length + due.slice(0, length % 7).filter(Boolean).length;
  }
  return count;
}

/** 목표에 연동된 항목 (개인 습관 + 신앙 루틴) */
export interface LinkedItem {
  currentlyLinked: boolean;
  id: string;
  title: string;
  emoji?: string;
  kind: 'habit' | 'faith';
  rate: number;            // 전체 진척도 (완료 / 전체 예정일)
  adherence: number;       // 수행률 (완료 / 경과 예정일) — "지키고 있나"
  doneCount: number;       // 완료한 예정일 수
  scheduledTotal: number;  // 목표 기간 전체 예정일 수
  scheduledElapsed: number; // 오늘까지 경과한 예정일 수
}

export function getLinkedItems(
  goal: MonthlyGoal,
  habits: Habit[],
  habitLogs: HabitLog[],
  faithRoutines: DailyRoutine[],
  routineLogs: RoutineLog[],
  todayIso: string,
): LinkedItem[] {
  if (goalPeriodError(goal.startDate, goal.endDate)) return [];

  const items: LinkedItem[] = [];
  for (const item of [...habits, ...faithRoutines]) {
    const scheduledTotal = scheduledCount(item, goal, goal.endDate);
    if (!scheduledTotal && item.goalId !== goal.id) continue;
    const elapsedEnd = goal.endDate < todayIso ? goal.endDate : todayIso;
    const scheduledElapsed = scheduledCount(item, goal, elapsedEnd);
    const isHabit = !('isActive' in item);
    const eligible = (date: string) => date >= goal.startDate && date <= elapsedEnd && isItemDue(item, date) && ruleAt(item, date)?.goalId === goal.id;
    const dates = isHabit
      ? habitLogs.filter(l => l.habitId === item.id && eligible(l.date) && (l.completed || l.skipped || l.substitute)).map(l => l.date)
      : routineLogs.filter(l => l.routineId === item.id && eligible(l.date) && (l.completed || l.skipped)).map(l => l.date);
    const doneCount = new Set(dates).size;
    items.push({ currentlyLinked: item.goalId === goal.id, id: item.id, title: item.title, emoji: item.emoji, kind: isHabit ? 'habit' : 'faith',
      rate: scheduledTotal ? Math.round(doneCount / scheduledTotal * 100) : 0,
      adherence: scheduledElapsed ? Math.round(doneCount / scheduledElapsed * 100) : 0,
      doneCount, scheduledTotal, scheduledElapsed });
  }

  return items;
}

/** 이미 계산된 items로부터 전체 달성률(평균) */
export function rateFromItems(items: LinkedItem[]): number {
  const valid = items.filter(it => it.scheduledTotal > 0);
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((a, it) => a + it.rate, 0) / valid.length);
}

/** 이미 계산된 items로부터 수행률(경과 기준 평균) */
export function adherenceFromItems(items: LinkedItem[]): number {
  const valid = items.filter(it => it.scheduledElapsed > 0);
  if (valid.length === 0) return 0;
  return Math.round(valid.reduce((a, it) => a + it.adherence, 0) / valid.length);
}

/**
 * 목표 전체 달성률 = 연동 항목 개별 달성률의 평균.
 * 각 항목은 자신의 "예정일 수"로 정규화되므로 frequency가 공정하게 반영됨.
 * 예정일이 0인 항목(이 기간에 해당 없음)은 평균에서 제외.
 */
export function getGoalRate(
  goal: MonthlyGoal,
  habits: Habit[],
  habitLogs: HabitLog[],
  faithRoutines: DailyRoutine[],
  routineLogs: RoutineLog[],
  todayIso: string,
): number {
  const items = getLinkedItems(goal, habits, habitLogs, faithRoutines, routineLogs, todayIso)
    .filter(it => it.scheduledTotal > 0);
  if (items.length === 0) return 0;
  const sum = items.reduce((acc, it) => acc + it.rate, 0);
  return Math.round(sum / items.length);
}
