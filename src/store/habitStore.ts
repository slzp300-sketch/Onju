import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Habit, PersonalRoutine } from '../types';

interface HabitState {
  habits: Habit[];
  personalRoutines: PersonalRoutine[];

  addHabit: (habit: Habit) => void;
  removeHabit: (id: string) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;

  addPersonalRoutine: (routine: PersonalRoutine) => void;
  removePersonalRoutine: (id: string) => void;
  updatePersonalRoutine: (id: string, patch: Partial<PersonalRoutine>) => void;
}

export const useHabitStore = create<HabitState>()(
  persist(
    (set) => ({
      habits: [],
      personalRoutines: [],

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
    }),
    { name: 'habit-store' }
  )
);
