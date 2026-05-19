import type { WeeklyGoal, User } from '../types';

export function checkSlotUnlock(
  lastWeekGoals: WeeklyGoal[],
  currentSlots: number
): { shouldUnlock: boolean; newSlotCount: number; currentRate: number } {
  if (lastWeekGoals.length === 0) {
    return { shouldUnlock: false, newSlotCount: currentSlots, currentRate: 0 };
  }

  const avgRate =
    lastWeekGoals.reduce((sum, g) => sum + g.completionRate, 0) /
    lastWeekGoals.length;

  const shouldUnlock = avgRate >= 80 && currentSlots < 5;

  return {
    shouldUnlock,
    newSlotCount: shouldUnlock ? currentSlots + 1 : currentSlots,
    currentRate: Math.round(avgRate),
  };
}

export function getAvailableSlots(user: User, currentWeekGoalCount: number) {
  return {
    total: user.weeklyGoalSlots,
    used: currentWeekGoalCount,
    remaining: user.weeklyGoalSlots - currentWeekGoalCount,
    isMaxed: user.weeklyGoalSlots >= 5,
  };
}
