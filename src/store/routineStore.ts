import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DailyRoutine, RoutineLog } from '../types';
import { today } from '../utils/date';
import { newId } from '../utils/id';
import {
  upsertRoutine,
  deleteRoutine,
  upsertRoutineLog,
  updateRoutineOrders,
} from '../data/repos';

const todayKey = () => today();

interface RoutineState {
  personalRoutines: DailyRoutine[];
  faithRoutines: DailyRoutine[];
  logs: RoutineLog[];
  toggleRoutineLog: (routineId: string, date?: string) => void;
  skipRoutineLog: (routineId: string, date?: string) => void;
  reorderRoutines: (type: 'personal' | 'faith', oldIndex: number, newIndex: number) => void;
  isCompleted: (routineId: string, date?: string) => boolean;
  isSkipped: (routineId: string, date?: string) => boolean;
  addRoutine: (routine: DailyRoutine) => void;
  removeRoutine: (id: string) => void;
  deactivateRoutine: (id: string) => void;
  updateRoutine: (id: string, changes: Partial<Pick<DailyRoutine, 'title' | 'frequency' | 'emoji' | 'timeSlot' | 'durationSeconds' | 'when' | 'twoMinuteHabit' | 'notification' | 'goalId'>>) => void;
  setRoutines: (personal: DailyRoutine[], faith: DailyRoutine[]) => void;
  deduplicateFaithRoutines: () => void;
}

export const useRoutineStore = create<RoutineState>()(
  persist(
    (set, get) => ({
      personalRoutines: [],
      faithRoutines: [],
      logs: [],

      toggleRoutineLog: (routineId, date) => {
        const today = date ?? todayKey();
        const { logs } = get();
        const existing = logs.find(
          (l) => l.routineId === routineId && l.date === today
        );

        let next: RoutineLog;
        if (existing) {
          next = {
            ...existing,
            completed: !existing.completed,
            completedAt: !existing.completed ? new Date().toISOString() : undefined,
          };
          set({ logs: logs.map((l) => (l === existing ? next : l)) });
        } else {
          next = {
            id: newId(),
            routineId,
            userId: '',
            date: today,
            completed: true,
            completedAt: new Date().toISOString(),
          };
          set({ logs: [...logs, next] });
        }
        upsertRoutineLog(next);
      },

      reorderRoutines: (type, oldIndex, newIndex) => {
        const key = type === 'personal' ? 'personalRoutines' : 'faithRoutines';
        const routines = [...get()[key]];
        const [moved] = routines.splice(oldIndex, 1);
        routines.splice(newIndex, 0, moved);
        const reordered = routines.map((r, i) => ({ ...r, order: i }));
        set({ [key]: reordered });
        updateRoutineOrders(reordered);
      },

      skipRoutineLog: (routineId, date) => {
        const today = date ?? todayKey();
        const { logs } = get();
        const existing = logs.find(l => l.routineId === routineId && l.date === today);
        let next: RoutineLog;
        if (existing) {
          next = { ...existing, skipped: !existing.skipped, completed: false, completedAt: undefined };
          set({ logs: logs.map(l => (l === existing ? next : l)) });
        } else {
          next = {
            id: newId(), routineId, userId: '',
            date: today, completed: false, skipped: true,
          };
          set({ logs: [...logs, next] });
        }
        upsertRoutineLog(next);
      },

      isCompleted: (routineId, date) => {
        const today = date ?? todayKey();
        const log = get().logs.find(
          (l) => l.routineId === routineId && l.date === today
        );
        return log?.completed ?? false;
      },

      isSkipped: (routineId, date) => {
        const today = date ?? todayKey();
        const log = get().logs.find(l => l.routineId === routineId && l.date === today);
        return log?.skipped ?? false;
      },

      addRoutine: (routine) => {
        if (routine.type === 'personal') {
          set((s) => ({ personalRoutines: [...s.personalRoutines, routine] }));
        } else {
          set((s) => ({ faithRoutines: [...s.faithRoutines, routine] }));
        }
        upsertRoutine(routine);
      },

      removeRoutine: (id) => {
        set((s) => ({
          personalRoutines: s.personalRoutines.filter(r => r.id !== id),
          faithRoutines: s.faithRoutines.filter(r => r.id !== id),
        }));
        deleteRoutine(id);
      },

      deactivateRoutine: (id) => {
        const patch = (arr: DailyRoutine[]) =>
          arr.map(r => r.id === id ? { ...r, isActive: false } : r);
        set((s) => ({
          personalRoutines: patch(s.personalRoutines),
          faithRoutines: patch(s.faithRoutines),
        }));
        const found = [...get().personalRoutines, ...get().faithRoutines].find(r => r.id === id);
        if (found) upsertRoutine(found);
      },

      updateRoutine: (id, changes) => {
        const patch = (arr: DailyRoutine[]) =>
          arr.map(r => r.id === id ? { ...r, ...changes } : r);
        set((s) => ({
          personalRoutines: patch(s.personalRoutines),
          faithRoutines: patch(s.faithRoutines),
        }));
        const found = [...get().personalRoutines, ...get().faithRoutines].find(r => r.id === id);
        if (found) upsertRoutine(found);
      },

      setRoutines: (personal, faith) => {
        set({ personalRoutines: personal, faithRoutines: faith });
        for (const r of [...personal, ...faith]) upsertRoutine(r);
      },

      deduplicateFaithRoutines: () => {
        set((s) => {
          const seen = new Set<string>();
          const removed: DailyRoutine[] = [];
          const deduped = s.faithRoutines.filter(r => {
            if (seen.has(r.title)) { removed.push(r); return false; }
            seen.add(r.title);
            return true;
          });
          for (const r of removed) deleteRoutine(r.id);
          return deduped.length === s.faithRoutines.length ? s : { faithRoutines: deduped };
        });
      },
    }),
    { name: 'routine-store' }
  )
);
