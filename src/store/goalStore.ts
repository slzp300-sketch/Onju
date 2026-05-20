import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MonthlyGoal, WeeklyGoal } from '../types';

interface GoalState {
  monthlyGoals: MonthlyGoal[];
  weeklyGoals: WeeklyGoal[];
  setMonthlyGoals: (goals: MonthlyGoal[]) => void;
  setWeeklyGoals: (goals: WeeklyGoal[]) => void;
  addWeeklyGoal: (goal: WeeklyGoal) => void;
  removeWeeklyGoal: (id: string) => void;
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set) => ({
      monthlyGoals: [],
      weeklyGoals: [],
      setMonthlyGoals: (goals) => set({ monthlyGoals: goals }),
      setWeeklyGoals: (goals) => set({ weeklyGoals: goals }),
      addWeeklyGoal: (goal) =>
        set((s) => ({ weeklyGoals: [...s.weeklyGoals, goal] })),
      removeWeeklyGoal: (id) =>
        set((s) => ({ weeklyGoals: s.weeklyGoals.filter(g => g.id !== id) })),
    }),
    { name: 'goal-store' }
  )
);
