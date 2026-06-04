import { format, getDay } from 'date-fns';
import type { MonthlyGoal, Habit, DailyRoutine, RoutineLog, HabitFrequency } from '../types';

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

/**
 * 해당 날짜가 습관/루틴의 "예정일"인지 판정.
 * getDay(): 0=일 ~ 6=토 (customDays/number[]도 동일 인덱스 사용)
 */
function isScheduled(
  dateIso: string,
  frequency: HabitFrequency | DailyRoutine['frequency'],
  customDays?: number[],
): boolean {
  const dow = getDay(new Date(dateIso + 'T12:00:00')); // 0=일 ~ 6=토
  if (Array.isArray(frequency)) return frequency.includes(dow);
  switch (frequency) {
    case 'daily':    return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekends': return dow === 0 || dow === 6;
    case 'custom':   return (customDays ?? []).includes(dow);
    default:         return true;
  }
}

/** 기간 내 예정일만 추출 */
function scheduledDays(
  days: string[],
  frequency: HabitFrequency | DailyRoutine['frequency'],
  customDays?: number[],
): string[] {
  return days.filter(d => isScheduled(d, frequency, customDays));
}

/** 목표에 연동된 항목 (개인 습관 + 신앙 루틴) */
export interface LinkedItem {
  id: string;
  title: string;
  emoji?: string;
  kind: 'habit' | 'faith';
  rate: number;          // 개별 달성률 (예정일 기준)
  doneCount: number;     // 완료한 예정일 수
  scheduledTotal: number; // 목표 기간 전체 예정일 수
}

/** 유효 시작일 = max(목표 시작일, 항목 생성일) — 연동 전 기간은 분모에서 제외 */
function effectiveStart(goalStart: string, createdAt: string): string {
  const createdIso = createdAt.slice(0, 10); // ISO datetime → yyyy-MM-dd
  return createdIso > goalStart ? createdIso : goalStart;
}

export function getLinkedItems(
  goal: MonthlyGoal,
  habits: Habit[],
  habitLogs: HabitLog[],
  faithRoutines: DailyRoutine[],
  routineLogs: RoutineLog[],
  todayIso: string,
): LinkedItem[] {
  if (dateRange(goal.startDate, goal.endDate).length === 0) return [];

  const items: LinkedItem[] = [];

  habits.filter(h => h.goalId === goal.id).forEach(h => {
    const start = effectiveStart(goal.startDate, h.createdAt);
    // 분모: 유효 시작 ~ 목표 종료 중 예정일
    const scheduledTotal = scheduledDays(dateRange(start, goal.endDate), h.frequency, h.customDays).length;
    // 분자: 유효 시작 ~ min(오늘, 종료) 중 완료한 예정일
    const endForCount = todayIso < goal.endDate ? todayIso : goal.endDate;
    const elapsed = new Set(dateRange(start, endForCount));
    const doneCount = habitLogs.filter(
      l => l.habitId === h.id && elapsed.has(l.date) && isScheduled(l.date, h.frequency, h.customDays)
        && (l.completed || l.skipped || l.substitute)
    ).length;
    items.push({
      id: h.id, title: h.title, emoji: h.emoji, kind: 'habit',
      rate: scheduledTotal === 0 ? 0 : Math.round((doneCount / scheduledTotal) * 100),
      doneCount, scheduledTotal,
    });
  });

  faithRoutines.filter(r => r.goalId === goal.id).forEach(r => {
    const start = effectiveStart(goal.startDate, r.createdAt);
    const scheduledTotal = scheduledDays(dateRange(start, goal.endDate), r.frequency).length;
    const endForCount = todayIso < goal.endDate ? todayIso : goal.endDate;
    const elapsed = new Set(dateRange(start, endForCount));
    const doneCount = routineLogs.filter(
      l => l.routineId === r.id && elapsed.has(l.date) && isScheduled(l.date, r.frequency)
        && (l.completed || l.skipped)
    ).length;
    items.push({
      id: r.id, title: r.title, emoji: r.emoji, kind: 'faith',
      rate: scheduledTotal === 0 ? 0 : Math.round((doneCount / scheduledTotal) * 100),
      doneCount, scheduledTotal,
    });
  });

  return items;
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
