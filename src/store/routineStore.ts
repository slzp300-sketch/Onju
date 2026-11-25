import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { DailyRoutine, RoutineLog } from '../types';
import { withHistory } from '../utils/scheduleHistory';
import { today } from '../utils/date';
import { newId } from '../utils/id';
import { isOutboxOwner } from '../lib/sync/outbox';
import { routineLogFromRow, routineFromRow } from '../data/mappers';
import {
  upsertRoutine,
  upsertRoutineLog,
  saveRoutineMemo,
} from '../data/repos';

const todayKey = () => today();

interface RoutineState {
  personalRoutines: DailyRoutine[];
  faithRoutines: DailyRoutine[];
  logs: RoutineLog[];
  toggleRoutineLog: (routineId: string, date?: string) => void;
  skipRoutineLog: (routineId: string, date?: string) => void;
  /** 체크 로그에 기록(말씀·기도 JSON)을 남긴다 — 해당 날짜 로그가 있을 때만 */
  updateLogMemo: (routineId: string, date: string, memo: string, base?: RoutineLog) => void;
  isCompleted: (routineId: string, date?: string) => boolean;
  isSkipped: (routineId: string, date?: string) => boolean;
  addRoutine: (routine: DailyRoutine) => void;
  removeRoutine: (id: string, base?: DailyRoutine) => void;
  restoreRoutine: (id: string) => void;
  deactivateRoutine: (id: string, base?: DailyRoutine) => void;
  updateRoutine: (id: string, changes: Partial<Pick<DailyRoutine, 'isActive' | 'archivedAt' | 'title' | 'frequency' | 'emoji' | 'timeSlot' | 'durationSeconds' | 'when' | 'twoMinuteHabit' | 'notification' | 'goalId'>>, base?: DailyRoutine) => void;
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
            skipped: false,
            completedAt: !existing.completed ? new Date().toISOString() : undefined,
          };

        } else {
          next = {
            id: newId(),
            routineId,
            userId: '',
            date: today,
            completed: true,
            completedAt: new Date().toISOString(),
          };

        }
        next={...next,checkRequestId:newId()};
        if(!existing)next.memoRevision=next.checkRequestId;
        upsertRoutineLog(next);
        set({logs:existing?logs.map(l=>l===existing?next:l):[...logs,next]});
      },

      updateLogMemo: (routineId,date,memo,base) => {
        const current=get().logs.find(l=>l.routineId===routineId && l.date===date),previous=base??current;
        if(!previous || previous.routineId!==routineId || previous.date!==date)throw new Error('메모의 원래 기록을 확인해주세요.');
        const next={...previous,memo:memo||undefined,memoRevision:newId()};
        saveRoutineMemo(next,previous.memoRevision??null);
        set(s=>({logs:current?s.logs.map(l=>l===current?{...l,memo:next.memo,memoRevision:next.memoRevision}:l):[...s.logs,next]}));
      },

      skipRoutineLog: (routineId, date) => {
        const today = date ?? todayKey();
        const { logs } = get();
        const existing = logs.find(l => l.routineId === routineId && l.date === today);
        let next: RoutineLog;
        if (existing) {
          next = { ...existing, skipped: !existing.skipped, completed: false, completedAt: undefined };

        } else {
          next = {
            id: newId(), routineId, userId: '',
            date: today, completed: false, skipped: true,
          };

        }
        next={...next,checkRequestId:newId()};
        if(!existing)next.memoRevision=next.checkRequestId;
        upsertRoutineLog(next);
        set({logs:existing?logs.map(l=>l===existing?next:l):[...logs,next]});
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
        if ([...get().personalRoutines, ...get().faithRoutines].some(r => r.id === routine.id)) return;
        const next = { ...routine, revision: newId() };
        upsertRoutine(next, null, true);
        if (routine.type === 'personal') {
          set((s) => ({ personalRoutines: [...s.personalRoutines, next] }));
        } else {
          set((s) => ({ faithRoutines: [...s.faithRoutines, next] }));
        }
      },

      removeRoutine: (id, base) => get().updateRoutine(id, { archivedAt: today(), isActive: false }, base),
      restoreRoutine: (id) => get().updateRoutine(id, { archivedAt: undefined, isActive: true }),
      deactivateRoutine: (id, base) => get().removeRoutine(id, base),

      updateRoutine: (id, changes, base) => {
        const previous = base ?? [...get().personalRoutines, ...get().faithRoutines].find(r => r.id === id);
        if (!previous || previous.id !== id) throw new Error('루틴을 다시 확인해주세요.');
        const next = { ...withHistory<DailyRoutine>(previous, changes), id, revision: newId() };
        upsertRoutine(next, previous.revision ?? null);
        const patch = (arr: DailyRoutine[], type: DailyRoutine['type']) => arr.some(r => r.id === id)
          ? arr.map(r => r.id === id ? next : r) : next.type === type ? [...arr, next] : arr;
        set(s => ({ personalRoutines: patch(s.personalRoutines, 'personal'), faithRoutines: patch(s.faithRoutines, 'faith') }));
      },

      setRoutines: (personal, faith) => {
        for (const r of [...personal, ...faith]) {
          const existing = [...get().personalRoutines, ...get().faithRoutines].find(item => item.id === r.id);
          if (existing) get().updateRoutine(r.id, r, existing); else get().addRoutine(r);
        }
      },

      deduplicateFaithRoutines: () => {
        const seen = new Set<string>();
        for (const r of get().faithRoutines) {
          if (r.archivedAt || !r.isActive) continue;
          if (seen.has(r.title)) { try { get().removeRoutine(r.id); } catch { /* Keep a conflicted routine until the user compares it. */ } }
          else seen.add(r.title);
        }
      },
    }),
    { name: 'routine-store' }
  )
);

if (typeof window !== 'undefined') window.addEventListener('onju-practice-saved', event => {
  const { ownerId, kind, id, revision, current } = (event as CustomEvent).detail;
  if (kind !== 'routine' || !isOutboxOwner(ownerId)) return;
  const apply = (items: DailyRoutine[]) => items.flatMap(r => r.id !== id || r.revision !== revision ? [r] : current ? [routineFromRow(current)] : []);
  useRoutineStore.setState(s => ({ faithRoutines: apply(s.faithRoutines), personalRoutines: apply(s.personalRoutines) }));
});

if(typeof window!=='undefined')window.addEventListener('onju-record-saved',event=>{
  const {ownerId,kind,id,revision,current}=(event as CustomEvent).detail;
  if(!['memo','check'].includes(kind) || !isOutboxOwner(ownerId))return;
  const remote=current?routineLogFromRow(current):null;
  useRoutineStore.setState(s=>({logs:s.logs.flatMap(l=>{
    if(`${l.routineId}:${l.date}`!==id)return [l];
    if(kind==='memo' && l.memoRevision===revision)return remote?[l.checkRequestId?{...l,id:remote.id,memo:remote.memo,memoRevision:remote.memoRevision}:remote]:l.checkRequestId?[{...l,memo:undefined,memoRevision:undefined}]:[];
    if(kind==='check' && l.checkRequestId===revision && remote)return [{...l,id:remote.id,checkRequestId:undefined,completed:remote.completed,skipped:remote.skipped,completedAt:remote.completedAt,
      ...(l.memoRevision===revision?{memo:remote.memo,memoRevision:remote.memoRevision}:{})}];
    return [l];
  })}));
});
