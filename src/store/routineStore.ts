import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DailyRoutine, RoutineLog } from '../types';
import { format } from 'date-fns';

interface RoutineState {
  personalRoutines: DailyRoutine[];
  faithRoutines: DailyRoutine[];
  logs: RoutineLog[];
  toggleRoutineLog: (routineId: string, date?: string) => void;
  reorderRoutines: (type: 'personal' | 'faith', oldIndex: number, newIndex: number) => void;
  isCompleted: (routineId: string, date?: string) => boolean;
  addRoutine: (routine: DailyRoutine) => void;
  removeRoutine: (id: string) => void;
  deactivateRoutine: (id: string) => void;
  updateRoutine: (id: string, changes: Partial<Pick<DailyRoutine, 'title' | 'frequency'>>) => void;
  setRoutines: (personal: DailyRoutine[], faith: DailyRoutine[]) => void;
}

export const useRoutineStore = create<RoutineState>()(
  persist(
    (set, get) => ({
      personalRoutines: [],
      faithRoutines: [],
      logs: [],

      toggleRoutineLog: (routineId, date) => {
        const today = date ?? format(new Date(), 'yyyy-MM-dd');
        const { logs } = get();
        const existing = logs.find(
          (l) => l.routineId === routineId && l.date === today
        );

        if (existing) {
          set({
            logs: logs.map((l) =>
              l.routineId === routineId && l.date === today
                ? { ...l, completed: !l.completed, completedAt: !l.completed ? new Date().toISOString() : undefined }
                : l
            ),
          });
        } else {
          set({
            logs: [
              ...logs,
              {
                id: `log-${Date.now()}`,
                routineId,
                userId: 'user-1',
                date: today,
                completed: true,
                completedAt: new Date().toISOString(),
              },
            ],
          });
        }
      },

      reorderRoutines: (type, oldIndex, newIndex) => {
        const key = type === 'personal' ? 'personalRoutines' : 'faithRoutines';
        const routines = [...get()[key]];
        const [moved] = routines.splice(oldIndex, 1);
        routines.splice(newIndex, 0, moved);
        set({ [key]: routines.map((r, i) => ({ ...r, order: i })) });
      },

      isCompleted: (routineId, date) => {
        const today = date ?? format(new Date(), 'yyyy-MM-dd');
        const log = get().logs.find(
          (l) => l.routineId === routineId && l.date === today
        );
        return log?.completed ?? false;
      },

      addRoutine: (routine) => {
        if (routine.type === 'personal') {
          set((s) => ({ personalRoutines: [...s.personalRoutines, routine] }));
        } else {
          set((s) => ({ faithRoutines: [...s.faithRoutines, routine] }));
        }
      },

      removeRoutine: (id) => {
        set((s) => ({
          personalRoutines: s.personalRoutines.filter(r => r.id !== id),
          faithRoutines: s.faithRoutines.filter(r => r.id !== id),
        }));
      },

      deactivateRoutine: (id) => {
        const patch = (arr: DailyRoutine[]) =>
          arr.map(r => r.id === id ? { ...r, isActive: false } : r);
        set((s) => ({
          personalRoutines: patch(s.personalRoutines),
          faithRoutines: patch(s.faithRoutines),
        }));
      },

      updateRoutine: (id, changes) => {
        const patch = (arr: DailyRoutine[]) =>
          arr.map(r => r.id === id ? { ...r, ...changes } : r);
        set((s) => ({
          personalRoutines: patch(s.personalRoutines),
          faithRoutines: patch(s.faithRoutines),
        }));
      },

      setRoutines: (personal, faith) => {
        set({ personalRoutines: personal, faithRoutines: faith });
      },
    }),
    { name: 'routine-store' }
  )
);
