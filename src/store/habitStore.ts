import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { format } from 'date-fns';
import type { Habit, PersonalRoutine } from '../types';

interface HabitLog {
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
}

interface HabitState {
  habits: Habit[];
  personalRoutines: PersonalRoutine[];
  habitLogs: HabitLog[];

  addHabit: (habit: Habit) => void;
  removeHabit: (id: string) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;

  addPersonalRoutine: (routine: PersonalRoutine) => void;
  removePersonalRoutine: (id: string) => void;
  updatePersonalRoutine: (id: string, patch: Partial<PersonalRoutine>) => void;

  toggleHabitLog: (habitId: string, date?: string) => void;
  isHabitCompleted: (habitId: string, date?: string) => boolean;
}

export const useHabitStore = create<HabitState>()(
  persist(
    (set, get) => ({
      habits: [],
      personalRoutines: [],
      habitLogs: [],

      addHabit: (habit) =>
        set((s) => ({ habits: [...s.habits, habit] })),
      removeHabit: (id) =>
        set((s) => ({ habits: s.habits.filter((h) => h.id !== id) })),
      updateHabit: (id, patch) =>
        set((s) => ({ habits: s.habits.map((h) => (h.id === id ? { ...h, ...patch } : h)) })),

      addPersonalRoutine: (routine) =>
        set((s) => ({ personalRoutines: [...s.personalRoutines, routine] })),
      removePersonalRoutine: (id) =>
        set((s) => ({ personalRoutines: s.personalRoutines.filter((r) => r.id !== id) })),
      updatePersonalRoutine: (id, patch) =>
        set((s) => ({
          personalRoutines: s.personalRoutines.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        })),

      toggleHabitLog: (habitId, date) => {
        const d = date ?? format(new Date(), 'yyyy-MM-dd');
        const { habitLogs } = get();
        const existing = habitLogs.find(l => l.habitId === habitId && l.date === d);
        if (existing) {
          set({ habitLogs: habitLogs.map(l => l.habitId === habitId && l.date === d ? { ...l, completed: !l.completed } : l) });
        } else {
          set({ habitLogs: [...habitLogs, { habitId, date: d, completed: true }] });
        }
      },

      isHabitCompleted: (habitId, date) => {
        const d = date ?? format(new Date(), 'yyyy-MM-dd');
        const log = get().habitLogs.find(l => l.habitId === habitId && l.date === d);
        return log?.completed ?? false;
      },
    }),
    { name: 'habit-store' }
  )
);
