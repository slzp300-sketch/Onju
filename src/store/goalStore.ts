import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MonthlyGoal, WeeklyGoal } from '../types';

interface GoalState {
  monthlyGoals: MonthlyGoal[];
  weeklyGoals: WeeklyGoal[];
  setMonthlyGoals: (goals: MonthlyGoal[]) => void;
  setWeeklyGoals: (goals: WeeklyGoal[]) => void;
  addMonthlyGoal: (goal: MonthlyGoal) => void;
  addWeeklyGoal: (goal: WeeklyGoal) => void;
  removeWeeklyGoal: (id: string) => void;
  removeMonthlyGoal: (id: string) => void;
  updateMonthlyGoal: (id: string, patch: Partial<MonthlyGoal>) => void;
  updateWeeklyGoal: (id: string, patch: Partial<WeeklyGoal>) => void;
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set) => ({
      monthlyGoals: [],
      weeklyGoals: [],
      setMonthlyGoals: (goals) => set({ monthlyGoals: goals }),
      setWeeklyGoals: (goals) => set({ weeklyGoals: goals }),
      addMonthlyGoal: (goal) => set((s) => ({ monthlyGoals: [...s.monthlyGoals, goal] })),
      addWeeklyGoal: (goal) => set((s) => ({ weeklyGoals: [...s.weeklyGoals, goal] })),
      removeWeeklyGoal: (id) => set((s) => ({ weeklyGoals: s.weeklyGoals.filter(g => g.id !== id) })),
      removeMonthlyGoal: (id) => set((s) => ({ monthlyGoals: s.monthlyGoals.filter(g => g.id !== id) })),
      updateMonthlyGoal: (id, patch) =>
        set((s) => ({ monthlyGoals: s.monthlyGoals.map(g => g.id === id ? { ...g, ...patch } : g) })),
      updateWeeklyGoal: (id, patch) =>
        set((s) => ({ weeklyGoals: s.weeklyGoals.map(g => g.id === id ? { ...g, ...patch } : g) })),
    }),
    { name: 'goal-store' }
  )
);
