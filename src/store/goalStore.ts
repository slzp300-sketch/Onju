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
import { useHabitStore } from './habitStore';
import { useRoutineStore } from './routineStore';
import { withoutGoalSince } from '../utils/scheduleHistory';
import { today } from '../utils/date';
import { goalPeriodError } from '../utils/goalRules';
import { newId } from '../utils/id';
import { monthlyGoalFromRow, weeklyGoalFromRow } from '../data/mappers';

interface GoalState {
  monthlyGoals: MonthlyGoal[];
  weeklyGoals: WeeklyGoal[];
  goalSlots: number; // 현재 사용 가능한 목표 슬롯 (3~5)
  addMonthlyGoal: (goal: MonthlyGoal) => void;
  addWeeklyGoal: (goal: WeeklyGoal) => void;
  removeWeeklyGoal: (id: string, reviewed?: WeeklyGoal) => void;
  removeMonthlyGoal: (id: string, reviewed?: MonthlyGoal) => void;
  updateMonthlyGoal: (id: string, patch: Partial<MonthlyGoal>, base?: MonthlyGoal) => void;
  updateWeeklyGoal: (id: string, patch: Pick<WeeklyGoal, 'targetCount'>, base?: WeeklyGoal) => void;
  unlockGoalSlot: () => void; // 달성률 80%+ 시 슬롯 +1 (최대 5)
}

export const useGoalStore = create<GoalState>()(
  persist(
    (set, get) => ({
      monthlyGoals: [],
      weeklyGoals: [],
      goalSlots: 3,
      addMonthlyGoal: (goal) => {
        if (get().monthlyGoals.some(g => g.id === goal.id)) return;
        const error = goalPeriodError(goal.startDate, goal.endDate);
        if (error) throw new Error(error);
        const next = { ...goal, revision: newId() };
        upsertMonthlyGoal(next, null, true);
        set((s) => ({ monthlyGoals: [...s.monthlyGoals, next] }));
      },
      addWeeklyGoal: (goal) => {
        if (get().weeklyGoals.some(g => g.id === goal.id)) return;
        const next = { ...goal, revision: newId() };
        upsertWeeklyGoal(next, null, true);
        set(s => ({ weeklyGoals: [...s.weeklyGoals, next] }));
      },
      removeWeeklyGoal: (id, reviewed) => {
        const current = get().weeklyGoals.find(g => g.id === id);
        if (!current || (reviewed && JSON.stringify(current) !== JSON.stringify(reviewed))) throw new Error('주간 목표가 바뀌었어요. 다시 확인해주세요.');
        deleteWeeklyGoal(reviewed ?? current);
      },
      removeMonthlyGoal: (id, reviewed) => {
        const current = get().monthlyGoals.find(g => g.id === id);
        if (!current || (reviewed && JSON.stringify(current) !== JSON.stringify(reviewed))) throw new Error('목표 내용이 바뀌었어요. 다시 확인해주세요.');
        // 확인한 버전으로만 요청한다. 서버 확인 전에는 연결·일정 이력을 바꾸지 않는다.
        deleteMonthlyGoal(reviewed ?? current, today());
      },
      updateMonthlyGoal: (id, patch, base) => {
        const current = get().monthlyGoals.find(g => g.id === id);
        if (!current && !base) throw new Error('목표를 찾지 못했어요. 다시 확인해주세요.');
        const previous = base ?? current;
        if (!previous || previous.id !== id) throw new Error('목표를 다시 확인해주세요.');
        const next = { ...previous, ...patch, id, revision: newId() };
        const error = goalPeriodError(next.startDate, next.endDate);
        if (error) throw new Error(error);
        next.month = Number(next.startDate.slice(5, 7)); next.year = Number(next.startDate.slice(0, 4));
        upsertMonthlyGoal(next, previous.revision ?? null);
        set((s) => ({ monthlyGoals: current ? s.monthlyGoals.map(g => g.id === id ? next : g) : [...s.monthlyGoals, next] }));
      },
      updateWeeklyGoal: (id, patch, base) => {
        const previous = base ?? get().weeklyGoals.find(g => g.id === id);
        if (!previous || previous.id !== id) throw new Error('주간 목표를 다시 확인해주세요.');
        if (!Number.isInteger(patch.targetCount) || patch.targetCount < 1 || patch.targetCount > 7) throw new Error('목표 횟수를 확인해주세요.');
        const next = { ...previous, targetCount: patch.targetCount, id, revision: newId() };
        upsertWeeklyGoal(next, previous.revision ?? null);
        set(s => ({ weeklyGoals: [...s.weeklyGoals.filter(g => g.id !== id), next] }));
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

// 늦게 도착한 응답은 같은 계정·같은 로컬 버전에만 적용한다.
if (typeof window !== 'undefined') window.addEventListener('onju-goal-saved', event => {
  const { ownerId, goalId, revision, current } = (event as CustomEvent).detail;
  if (useAuthStore.getState().user?.id !== ownerId) return;
  useGoalStore.setState(s => ({ monthlyGoals: s.monthlyGoals.flatMap(goal => {
    if (goal.id !== goalId || goal.revision !== revision) return [goal];
    return current ? [monthlyGoalFromRow(current)] : [];
  }) }));
});

if (typeof window !== 'undefined') window.addEventListener('onju-goal-deleted', event => {
  const { ownerId, goalId, revision, effectiveDate, timeZone } = (event as CustomEvent).detail;
  if (useAuthStore.getState().user?.id !== ownerId) return;
  const current = useGoalStore.getState().monthlyGoals.find(g => g.id === goalId);
  if (current && (current.revision ?? null) !== revision) return;
  // An already absent goal has no known deletion date; hydration restores its actual history.
  if (effectiveDate) {
    useHabitStore.setState(s => ({ habits: s.habits.map(h => withoutGoalSince(h, goalId, effectiveDate, timeZone)) }));
    const detach = (items: ReturnType<typeof useRoutineStore.getState>['faithRoutines']) => items.map(r => {
      const next = withoutGoalSince(r, goalId, effectiveDate, timeZone);
      return next.monthlyGoalId === goalId ? { ...next, monthlyGoalId: undefined } : next;
    });
    useRoutineStore.setState(s => ({ faithRoutines: detach(s.faithRoutines), personalRoutines: detach(s.personalRoutines) }));
  }
  useGoalStore.setState(s => ({ monthlyGoals: s.monthlyGoals.filter(g => g.id !== goalId),
    weeklyGoals: s.weeklyGoals.map(g => g.monthlyGoalId === goalId ? { ...g, monthlyGoalId: undefined } : g) }));
});

if (typeof window !== 'undefined') window.addEventListener('onju-plan-saved', event => {
  const { ownerId, kind, id, revision, current } = (event as CustomEvent).detail;
  if (kind !== 'weekly' || useAuthStore.getState().user?.id !== ownerId) return;
  useGoalStore.setState(s => ({ weeklyGoals: s.weeklyGoals.flatMap(g => g.id !== id || (g.revision ?? null) !== revision ? [g] : current ? [weeklyGoalFromRow(current)] : []) }));
});
