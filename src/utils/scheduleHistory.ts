import type { DailyRoutine, Habit, ScheduleRevision } from '../types';
import { createdLocalDate, today } from './date';
import { isScheduled } from './schedule';

type Item = Habit | DailyRoutine;
function currentRule(item: Item, from: string): ScheduleRevision {
  return { from, title: item.title, emoji: item.emoji, frequency: item.frequency,
    customDays: 'customDays' in item ? item.customDays : undefined,
    active: !item.archivedAt && (!('isActive' in item) || item.isActive), goalId: item.goalId };
}

export function ruleAt(item: Item, date: string): ScheduleRevision | undefined {
  const born = createdLocalDate(item.createdAt);
  if (born > date) return undefined;
  if (!item.scheduleHistory?.length) return currentRule(item, born || '0001-01-01');
  return item.scheduleHistory.filter(r => r.from <= date).sort((a, b) => b.from.localeCompare(a.from))[0];
}

export function withHistory<T extends Item>(item: T, patch: Partial<T>, date = today()): T {
  const next = { ...item, ...patch };
  const before = currentRule(item, date), after = currentRule(next, date);
  if (JSON.stringify(before) === JSON.stringify(after)) return next;
  const baseline = item.scheduleHistory?.length ? item.scheduleHistory : [currentRule(item, createdLocalDate(item.createdAt) || '0001-01-01')];
  // 같은 날 수정은 그날의 최신 규칙으로 합친다. 이전 날짜는 수정하지 않는다.
  return { ...next, scheduleHistory: [...baseline.filter(r => r.from < date), after] };
}

/** A delayed deletion removes only this goal, preserving later schedule edits. */
export function withoutGoalSince<T extends Item>(item: T, goalId: string, date: string, timeZone?: string): T {
  if (item.goalId !== goalId) return item;
  const history = item.scheduleHistory?.length ? item.scheduleHistory : [currentRule(item, createdLocalDate(item.createdAt, timeZone) || '0001-01-01')];
  const atDate = [...history].filter(r => r.from <= date).sort((a, b) => b.from.localeCompare(a.from))[0] ?? currentRule(item, date);
  const detach = (rule: ScheduleRevision) => rule.goalId === goalId ? { ...rule, goalId: undefined } : rule;
  return { ...item, goalId: undefined, scheduleHistory: [
    ...history.filter(r => r.from < date), detach({ ...atDate, from: date }),
    ...history.filter(r => r.from > date).map(detach),
  ] };
}

export function isItemDue(item: Item, date: string) {
  const rule = ruleAt(item, date);
  return !!rule?.active && isScheduled(date, rule.frequency, rule.customDays);
}

export function itemOnDate<T extends Item>(item: T, date: string): T {
  const rule = ruleAt(item, date);
  return rule ? { ...item, title: rule.title, emoji: rule.emoji, frequency: rule.frequency,
    goalId: rule.goalId, ...('isActive' in item ? { isActive: rule.active } : { customDays: rule.customDays }) } as T : item;
}
