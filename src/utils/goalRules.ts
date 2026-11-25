import type { MonthlyGoal } from '../types';

/** Calendar dates, independent of the device's UTC offset and DST. */
export function calendarDayNumber(iso: string): number {
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(iso) || iso.startsWith('0000')) return NaN;
  const stamp = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === iso ? stamp / 86400000 : NaN;
}

export function goalPeriodError(start: string, end: string): string | undefined {
  if (!Number.isFinite(calendarDayNumber(start)) || !Number.isFinite(calendarDayNumber(end))) return '시작일과 종료일을 실제 달력 날짜로 입력해주세요.';
  if (start > end) return '종료일을 시작일 이후로 선택해주세요. 같은 날도 가능해요.';
}

/** Existing links survive category/period changes. Only new links follow the new category. */
export function canLinkMonthlyGoal(goal: MonthlyGoal, kind: 'personal' | 'faith', date: string, currentGoalId?: string): boolean {
  return goal.id === currentGoalId || ((goal.category ?? 'personal') === kind && !goalPeriodError(goal.startDate, goal.endDate) && goal.endDate >= date);
}
