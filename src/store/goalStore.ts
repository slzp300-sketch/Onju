import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MonthlyGoal, WeeklyGoal } from '../types';
import {
  upsertMonthlyGoal,
  deleteMonthlyGoal,
  upsertWeeklyGoal,
  deleteWeeklyGoal,
  updateGoalSlots,
} from '../data/repos';
import { useAuthStore } from './authStore';

interface GoalState {
  monthlyGoals: MonthlyGoal[];
  weeklyGoals: WeeklyGoal[];
  goalSlots: number; // 현재 사용 가능한 목표 슬롯 (3~5)
  setMonthlyGoals: (goals: MonthlyGoal[]) => void;
  setWeeklyGoals: (goals: WeeklyGoal[]) => void;
  addMonthlyGoal: (goal: MonthlyGoal) => void;
  addWeeklyGoal: (goal: WeeklyGoal) => void;
  removeWeeklyGoal: (id: string) => void;
  removeMonthlyGoal: (id: string) => void;
  updateMonthlyGoal: (id: string, patch: Partial<MonthlyGoal>) => void;
  updateWeeklyGoal: (id: string, patch: Partial<WeeklyGoal>) => void;
  unlockGoalSlot: () => void; // 달성률 80%+ 시 슬롯 +1 (최대 5)
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set, get) => ({
      monthlyGoals: [],
      weeklyGoals: [],
      goalSlots: 3,
      setMonthlyGoals: (goals) => {
        set({ monthlyGoals: goals });
        for (const g of goals) upsertMonthlyGoal(g);
      },
      setWeeklyGoals: (goals) => {
        set({ weeklyGoals: goals });
        for (const g of goals) upsertWeeklyGoal(g);
      },
      addMonthlyGoal: (goal) => {
        set((s) => ({ monthlyGoals: [...s.monthlyGoals, goal] }));
        upsertMonthlyGoal(goal);
      },
      addWeeklyGoal: (goal) => {
        set((s) => ({ weeklyGoals: [...s.weeklyGoals, goal] }));
        upsertWeeklyGoal(goal);
      },
      removeWeeklyGoal: (id) => {
        set((s) => ({ weeklyGoals: s.weeklyGoals.filter(g => g.id !== id) }));
        deleteWeeklyGoal(id);
      },
      removeMonthlyGoal: (id) => {
        set((s) => ({ monthlyGoals: s.monthlyGoals.filter(g => g.id !== id) }));
        deleteMonthlyGoal(id);
      },
      updateMonthlyGoal: (id, patch) => {
        set((s) => ({ monthlyGoals: s.monthlyGoals.map(g => g.id === id ? { ...g, ...patch } : g) }));
        const found = get().monthlyGoals.find(g => g.id === id);
        if (found) upsertMonthlyGoal(found);
      },
      updateWeeklyGoal: (id, patch) => {
        set((s) => ({ weeklyGoals: s.weeklyGoals.map(g => g.id === id ? { ...g, ...patch } : g) }));
        const found = get().weeklyGoals.find(g => g.id === id);
        if (found) upsertWeeklyGoal(found);
      },
      unlockGoalSlot: () => {
        set((s) => ({ goalSlots: Math.min(5, s.goalSlots + 1) }));
        const userId = useAuthStore.getState().user?.id;
        if (userId) updateGoalSlots(get().goalSlots, userId);
      },
    }),
    { name: 'goal-store' }
  )
);
