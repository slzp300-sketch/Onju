import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Habit, PersonalRoutine } from '../types';
import { withHistory } from '../utils/scheduleHistory';
import { today } from '../utils/date';
import { newId } from '../utils/id';
import { isOutboxOwner } from '../lib/sync/outbox';
import { habitFromRow, personalRoutineFromRow } from '../data/mappers';
import {
  upsertHabit,
  upsertHabitLog,
  upsertPersonalRoutine,
  deletePersonalRoutine,
} from '../data/repos';

const todayKey = () => today();

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
  removeHabit: (id: string, base?: Habit) => void;
  restoreHabit: (id: string) => void;
  updateHabit: (id: string, patch: Partial<Habit>, base?: Habit) => void;

  addPersonalRoutine: (routine: PersonalRoutine) => void;
  removePersonalRoutine: (id: string, reviewed?: PersonalRoutine) => void;
  updatePersonalRoutine: (id: string, patch: Partial<PersonalRoutine>, base?: PersonalRoutine) => void;

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

      addHabit: (habit) => {
        if (get().habits.some(h => h.id === habit.id)) return;
        const next = { ...habit, revision: newId() };
        upsertHabit(next, null, true);
        set((s) => ({ habits: [...s.habits, next] }));
      },
      removeHabit: (id, base) => {
        get().updateHabit(id, { archivedAt: today() }, base);
      },
      restoreHabit: (id) => get().updateHabit(id, { archivedAt: undefined }),
      updateHabit: (id, patch, base) => {
        const previous = base ?? get().habits.find(h => h.id === id);
        if (!previous || previous.id !== id) throw new Error('습관을 다시 확인해주세요.');
        const next = { ...withHistory(previous, patch), id, revision: newId() };
        upsertHabit(next, previous.revision ?? null);
        set(s => ({ habits: s.habits.some(h => h.id === id) ? s.habits.map(h => h.id === id ? next : h) : [...s.habits, next] }));
      },

      addPersonalRoutine: (routine) => {
        if (get().personalRoutines.some(r => r.id === routine.id)) return;
        const next = { ...routine, revision: newId() };
        upsertPersonalRoutine(next, null, true);
        set(s => ({ personalRoutines: [...s.personalRoutines, next] }));
      },
      removePersonalRoutine: (id, reviewed) => {
        const current = get().personalRoutines.find(r => r.id === id);
        if (!current || (reviewed && JSON.stringify(current) !== JSON.stringify(reviewed))) throw new Error('루틴 묶음이 바뀌었어요. 다시 확인해주세요.');
        deletePersonalRoutine(reviewed ?? current);
      },
      updatePersonalRoutine: (id, patch, base) => {
        const previous = base ?? get().personalRoutines.find(r => r.id === id);
        if (!previous || previous.id !== id) throw new Error('루틴 묶음을 다시 확인해주세요.');
        const next = { ...previous, ...patch, id, revision: newId() };
        upsertPersonalRoutine(next, previous.revision ?? null);
        set(s => ({ personalRoutines: [...s.personalRoutines.filter(r => r.id !== id), next] }));
      },

      toggleHabitLog: (habitId, date) => {
        const d = date ?? todayKey();
        const { habitLogs } = get();
        const existing = habitLogs.find(l => l.habitId === habitId && l.date === d);
        const next = existing
          ? { ...existing, completed: !existing.completed, skipped: false, substitute: false }
          : { habitId, date: d, completed: true, skipped: false };
        set({
          habitLogs: existing
            ? habitLogs.map(l => (l === existing ? next : l))
            : [...habitLogs, next],
        });
        upsertHabitLog(next);
      },

      skipHabitLog: (habitId, date) => {
        const d = date ?? todayKey();
        const { habitLogs } = get();
        const existing = habitLogs.find(l => l.habitId === habitId && l.date === d);
        const next = existing
          ? { ...existing, skipped: !existing.skipped, completed: false, substitute: false }
          : { habitId, date: d, completed: false, skipped: true, substitute: false };
        set({
          habitLogs: existing
            ? habitLogs.map(l => (l === existing ? next : l))
            : [...habitLogs, next],
        });
        upsertHabitLog(next);
      },

      substituteHabitLog: (habitId, date) => {
        const d = date ?? todayKey();
        const { habitLogs } = get();
        const existing = habitLogs.find(l => l.habitId === habitId && l.date === d);
        const next = existing
          ? { ...existing, substitute: !existing.substitute, completed: false, skipped: false }
          : { habitId, date: d, completed: false, substitute: true, skipped: false };
        set({
          habitLogs: existing
            ? habitLogs.map(l => (l === existing ? next : l))
            : [...habitLogs, next],
        });
        upsertHabitLog(next);
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

if (typeof window !== 'undefined') window.addEventListener('onju-practice-saved', event => {
  const { ownerId, kind, id, revision, current } = (event as CustomEvent).detail;
  if (kind !== 'habit' || !isOutboxOwner(ownerId)) return;
  useHabitStore.setState(s => ({ habits: s.habits.flatMap(h => h.id !== id || h.revision !== revision ? [h] : current ? [habitFromRow(current)] : []) }));
});

if (typeof window !== 'undefined') window.addEventListener('onju-plan-saved', event => {
  const { ownerId, kind, id, revision, current } = (event as CustomEvent).detail;
  if (kind !== 'bundle' || !isOutboxOwner(ownerId)) return;
  useHabitStore.setState(s => ({ personalRoutines: s.personalRoutines.flatMap(r => r.id !== id || (r.revision ?? null) !== revision ? [r] : current ? [personalRoutineFromRow(current)] : []) }));
});
