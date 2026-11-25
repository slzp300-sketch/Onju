import { supabase } from '../lib/supabase';
import type {
  DailyRoutine,
  RoutineLog,
  Habit,
  PersonalRoutine,
  MonthlyGoal,
  WeeklyGoal,
  Todo,
  DiaryEntry,
} from '../types';
import * as m from './mappers';
import { enqueue, type WriteOp } from '../lib/sync/outbox';
import { localTimeZone } from '../utils/timeZone';
import { newId } from '../utils/id';
import { practiceWrite } from './practiceWrites';
import { planWrite } from './planWrites';
import { recordWrite, checkWrite, type RecordMode } from './recordWrites';

// write-through 리포지토리: 스토어 액션이 낙관적 set() 후 호출한다.
// 쓰기는 아웃박스 큐를 통해 유실 없이 재시도된다. 읽기(list*/fetch*)는 직접 supabase.

// ── 루틴 ──────────────────────────────────────────────
export const listRoutines = async (): Promise<DailyRoutine[]> => {
  const { data, error } = await supabase.from('daily_routines').select('*').order('sort_order');
  if (error) throw error;
  return (data ?? []).map(m.routineFromRow);
};

export const listRoutineLogs = async (): Promise<RoutineLog[]> => {
  const { data, error } = await supabase.from('routine_logs').select('*');
  if (error) throw error;
  return (data ?? []).map(m.routineLogFromRow);
};

export const upsertRoutine = (r: DailyRoutine, expectedRevision: string | null = null, creating = false) =>
  enqueue(practiceWrite(r, expectedRevision, creating), { requireDurable: true });


export const upsertRoutineLog = (l: RoutineLog) => enqueue(checkWrite(l), { requireDurable:true });
export const saveRoutineMemo = (l: RoutineLog, base: string | null) => enqueue(recordWrite('memo',l,base), { requireDurable:true });

// ── 습관 ──────────────────────────────────────────────
export const listHabits = async (): Promise<Habit[]> => {
  const { data, error } = await supabase.from('habits').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(m.habitFromRow);
};

export const listHabitLogs = async (): Promise<m.HabitLogLocal[]> => {
  const { data, error } = await supabase.from('habit_logs').select('*');
  if (error) throw error;
  return (data ?? []).map(m.habitLogFromRow);
};

export const listPersonalRoutines = async (): Promise<PersonalRoutine[]> => {
  const { data, error } = await supabase.from('personal_routines').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(m.personalRoutineFromRow);
};

export const upsertHabit = (h: Habit, expectedRevision: string | null = null, creating = false) =>
  enqueue(practiceWrite(h, expectedRevision, creating), { requireDurable: true });


export const upsertHabitLog = (l: m.HabitLogLocal) =>
  enqueue({
    type: 'upsert',
    table: 'habit_logs',
    values: m.habitLogToRow(l),
    onConflict: 'user_id,habit_id,date',
  });

export const upsertPersonalRoutine = (r: PersonalRoutine, base: string | null = null, creating = false) =>
  enqueue(planWrite(r, base, creating), { requireDurable: true });

export const deletePersonalRoutine = (r: PersonalRoutine) =>
  enqueue(planWrite(r, r.revision ?? null, false, true), { requireDurable: true });

// ── 목표 ──────────────────────────────────────────────
export const listMonthlyGoals = async (): Promise<MonthlyGoal[]> => {
  const { data, error } = await supabase.from('monthly_goals').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(m.monthlyGoalFromRow);
};

export const listWeeklyGoals = async (): Promise<WeeklyGoal[]> => {
  const { data, error } = await supabase.from('weekly_goals').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(m.weeklyGoalFromRow);
};

export const upsertMonthlyGoal = (g: MonthlyGoal, expectedRevision: string | null = null, creating = false) =>
  enqueue({ type: 'rpc', fn: 'save_monthly_goal', args: { gid: g.id, request_id: g.revision,
    expected_revision: expectedRevision, creating, goal_values: m.monthlyGoalToRow(g) } }, { requireDurable: true });

export const monthlyGoalDeletion = (goal: MonthlyGoal, effectiveDate: string): WriteOp => ({
  type: 'rpc', fn: 'delete_monthly_goal_checked',
  args: { gid: goal.id, request_id: newId(), expected_revision: goal.revision ?? null, effective_date: effectiveDate, p_timezone: localTimeZone() },
  goalSnapshot: { ...m.monthlyGoalToRow(goal), revision: goal.revision },
});
export const deleteMonthlyGoal = (goal: MonthlyGoal, effectiveDate: string) =>
  enqueue(monthlyGoalDeletion(goal, effectiveDate), { requireDurable: true });

export const upsertWeeklyGoal = (g: WeeklyGoal, base: string | null = null, creating = false) =>
  enqueue(planWrite(g, base, creating), { requireDurable: true });

export const deleteWeeklyGoal = (g: WeeklyGoal) =>
  enqueue(planWrite(g, g.revision ?? null, false, true), { requireDurable: true });

export const updateGoalSlots = (slots: number, userId: string) =>
  enqueue({ type: 'update', table: 'profiles', values: { goal_slots: slots }, match: { id: userId } });

// ── 할 일 ─────────────────────────────────────────────
export const listTodos = async (): Promise<Todo[]> => {
  const { data, error } = await supabase.from('todos').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(m.todoFromRow);
};

export const upsertTodo = (t: Todo, base: string | null = null, mode: RecordMode = 'edit') =>
  enqueue(recordWrite('todo',t,base,mode), { requireDurable:true });
export const deleteTodo = (t: Todo) => enqueue(recordWrite('todo',t,t.revision??null,'delete'), { requireDurable:true });

// ── 일기 ──────────────────────────────────────────────
export const listDiaryEntries = async (): Promise<DiaryEntry[]> => {
  const { data, error } = await supabase.from('diary_entries').select('*');
  if (error) throw error;
  return (data ?? []).map(m.diaryFromRow);
};

export const upsertDiaryEntry = (e: DiaryEntry, base: string | null = null, creating = false) =>
  enqueue(recordWrite('diary',e,base,creating?'create':'edit'), { requireDurable:true });
export const deleteDiaryEntry = (e: DiaryEntry) => enqueue(recordWrite('diary',e,e.revision??null,'delete'), { requireDurable:true });

// ── 설정류 (jsonb 통째 upsert) ─────────────────────────
export interface UserSettingsRow {
  settings: Record<string, unknown>;
  streak: Record<string, unknown>;
  notifications: Record<string, unknown>;
}

export const fetchUserSettings = async (): Promise<UserSettingsRow | null> => {
  const { data, error } = await supabase.from('user_settings').select('*').maybeSingle();
  if (error) throw error;
  return data as UserSettingsRow | null;
};

export const upsertUserSettings = (userId: string, patch: Partial<UserSettingsRow>) =>
  enqueue({
    type: 'upsert',
    table: 'user_settings',
    values: { user_id: userId, ...patch, updated_at: new Date().toISOString() },
    onConflict: 'user_id',
  });

export const fetchGoalSlots = async (userId: string): Promise<number | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('goal_slots')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.goal_slots ?? null;
};
