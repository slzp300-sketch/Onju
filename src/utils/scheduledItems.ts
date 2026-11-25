import type { Habit, DailyRoutine } from '../types';
import { isItemDue } from './scheduleHistory';

export function isHabitDue(habit: Habit, date: string) {
  return isItemDue(habit, date);
}
export function isFaithDue(routine: DailyRoutine, date: string) {
  return isItemDue(routine, date);
}
