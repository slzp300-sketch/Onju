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
import { enqueue } from '../lib/sync/outbox';

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

export const upsertRoutine = (r: DailyRoutine) =>
  enqueue({ type: 'upsert', table: 'daily_routines', values: m.routineToRow(r) });

export const deleteRoutine = (id: string) =>
  enqueue({ type: 'delete', table: 'daily_routines', match: { id } });

export const upsertRoutineLog = (l: RoutineLog) =>
  enqueue({
    type: 'upsert',
    table: 'routine_logs',
    values: m.routineLogToRow(l),
    onConflict: 'user_id,routine_id,date',
  });

export const updateRoutineOrders = (routines: DailyRoutine[]) => {
  for (const r of routines) {
    enqueue({ type: 'update', table: 'daily_routines', values: { sort_order: r.order }, match: { id: r.id } });
  }
};

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

export const upsertHabit = (h: Habit) =>
  enqueue({ type: 'upsert', table: 'habits', values: m.habitToRow(h) });

export const deleteHabit = (id: string) =>
  enqueue({ type: 'delete', table: 'habits', match: { id } });

export const upsertHabitLog = (l: m.HabitLogLocal) =>
  enqueue({
    type: 'upsert',
    table: 'habit_logs',
    values: m.habitLogToRow(l),
    onConflict: 'user_id,habit_id,date',
  });

export const upsertPersonalRoutine = (r: PersonalRoutine) =>
  enqueue({ type: 'upsert', table: 'personal_routines', values: m.personalRoutineToRow(r) });

export const deletePersonalRoutine = (id: string) =>
  enqueue({ type: 'delete', table: 'personal_routines', match: { id } });

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

export const upsertMonthlyGoal = (g: MonthlyGoal) =>
  enqueue({ type: 'upsert', table: 'monthly_goals', values: m.monthlyGoalToRow(g) });

export const deleteMonthlyGoal = (id: string) =>
  enqueue({ type: 'delete', table: 'monthly_goals', match: { id } });

export const upsertWeeklyGoal = (g: WeeklyGoal) =>
  enqueue({ type: 'upsert', table: 'weekly_goals', values: m.weeklyGoalToRow(g) });

export const deleteWeeklyGoal = (id: string) =>
  enqueue({ type: 'delete', table: 'weekly_goals', match: { id } });

export const updateGoalSlots = (slots: number, userId: string) =>
  enqueue({ type: 'update', table: 'profiles', values: { goal_slots: slots }, match: { id: userId } });

// ── 할 일 ─────────────────────────────────────────────
export const listTodos = async (): Promise<Todo[]> => {
  const { data, error } = await supabase.from('todos').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(m.todoFromRow);
};

export const upsertTodo = (t: Todo) =>
  enqueue({ type: 'upsert', table: 'todos', values: m.todoToRow(t) });

export const deleteTodo = (id: string) =>
  enqueue({ type: 'delete', table: 'todos', match: { id } });

// ── 일기 ──────────────────────────────────────────────
export const listDiaryEntries = async (): Promise<DiaryEntry[]> => {
  const { data, error } = await supabase.from('diary_entries').select('*');
  if (error) throw error;
  return (data ?? []).map(m.diaryFromRow);
};

export const upsertDiaryEntry = (e: DiaryEntry) =>
  enqueue({
    type: 'upsert',
    table: 'diary_entries',
    values: m.diaryToRow(e),
    onConflict: 'user_id,date',
  });

export const deleteDiaryEntry = (date: string) =>
  enqueue({ type: 'delete', table: 'diary_entries', match: { date } });

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
