import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Habit, PersonalRoutine } from '../types';
import { logicalToday } from '../utils/date';
import { useSettingsStore } from './settingsStore';

const todayKey = () => logicalToday(useSettingsStore.getState().dayStartHour);

interface HabitLog {
  habitId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  skipped?: boolean;    // 쉬어가기
  substitute?: boolean; // 대체 습관으로 완료
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
  skipHabitLog: (habitId: string, date?: string) => void;
  substituteHabitLog: (habitId: string, date?: string) => void;
  isHabitCompleted: (habitId: string, date?: string) => boolean;
  isHabitSkipped: (habitId: string, date?: string) => boolean;
  isHabitSubstituted: (habitId: string, date?: string) => boolean;
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
        const d = date ?? todayKey();
        const { habitLogs } = get();
        const existing = habitLogs.find(l => l.habitId === habitId && l.date === d);
        if (existing) {
          set({ habitLogs: habitLogs.map(l =>
            l.habitId === habitId && l.date === d
              ? { ...l, completed: !l.completed, skipped: false }
              : l
          )});
        } else {
          set({ habitLogs: [...habitLogs, { habitId, date: d, completed: true, skipped: false }] });
        }
      },

      skipHabitLog: (habitId, date) => {
        const d = date ?? todayKey();
        const { habitLogs } = get();
        const existing = habitLogs.find(l => l.habitId === habitId && l.date === d);
        if (existing) {
          set({ habitLogs: habitLogs.map(l =>
            l.habitId === habitId && l.date === d
              ? { ...l, skipped: !l.skipped, completed: false, substitute: false }
              : l
          )});
        } else {
          set({ habitLogs: [...habitLogs, { habitId, date: d, completed: false, skipped: true, substitute: false }] });
        }
      },

      substituteHabitLog: (habitId, date) => {
        const d = date ?? todayKey();
        const { habitLogs } = get();
        const existing = habitLogs.find(l => l.habitId === habitId && l.date === d);
        if (existing) {
          set({ habitLogs: habitLogs.map(l =>
            l.habitId === habitId && l.date === d
              ? { ...l, substitute: !l.substitute, completed: false, skipped: false }
              : l
          )});
        } else {
          set({ habitLogs: [...habitLogs, { habitId, date: d, completed: false, substitute: true, skipped: false }] });
        }
      },

      isHabitCompleted: (habitId, date) => {
        const d = date ?? todayKey();
        const log = get().habitLogs.find(l => l.habitId === habitId && l.date === d);
        return log?.completed ?? false;
      },

      isHabitSkipped: (habitId, date) => {
        const d = date ?? todayKey();
        const log = get().habitLogs.find(l => l.habitId === habitId && l.date === d);
        return log?.skipped ?? false;
      },

      isHabitSubstituted: (habitId, date) => {
        const d = date ?? todayKey();
        const log = get().habitLogs.find(l => l.habitId === habitId && l.date === d);
        return log?.substitute ?? false;
      },
    }),
    { name: 'habit-store' }
  )
);
