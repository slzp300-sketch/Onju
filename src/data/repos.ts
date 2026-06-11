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

// write-through 리포지토리: 스토어 액션이 낙관적 set() 후 호출한다.
// 실패는 콘솔 로깅 — 다음 hydrate에서 서버 상태가 우선한다 (P1 한계, 아웃박스는 후속 과제).
function logError(op: string) {
  return ({ error }: { error: { message: string } | null }) => {
    if (error) console.error(`[sync] ${op} 실패:`, error.message);
  };
}

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
  void supabase.from('daily_routines').upsert(m.routineToRow(r)).then(logError('루틴 저장'));

export const deleteRoutine = (id: string) =>
  void supabase.from('daily_routines').delete().eq('id', id).then(logError('루틴 삭제'));

export const upsertRoutineLog = (l: RoutineLog) =>
  void supabase
    .from('routine_logs')
    .upsert(m.routineLogToRow(l), { onConflict: 'user_id,routine_id,date' })
    .then(logError('루틴 기록 저장'));

export const updateRoutineOrders = (routines: DailyRoutine[]) => {
  for (const r of routines) {
    void supabase
      .from('daily_routines')
      .update({ sort_order: r.order })
      .eq('id', r.id)
      .then(logError('루틴 순서 저장'));
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
  void supabase.from('habits').upsert(m.habitToRow(h)).then(logError('습관 저장'));

export const deleteHabit = (id: string) =>
  void supabase.from('habits').delete().eq('id', id).then(logError('습관 삭제'));

export const upsertHabitLog = (l: m.HabitLogLocal) =>
  void supabase
    .from('habit_logs')
    .upsert(m.habitLogToRow(l), { onConflict: 'user_id,habit_id,date' })
    .then(logError('습관 기록 저장'));

export const upsertPersonalRoutine = (r: PersonalRoutine) =>
  void supabase.from('personal_routines').upsert(m.personalRoutineToRow(r)).then(logError('개인 루틴 저장'));

export const deletePersonalRoutine = (id: string) =>
  void supabase.from('personal_routines').delete().eq('id', id).then(logError('개인 루틴 삭제'));

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
  void supabase.from('monthly_goals').upsert(m.monthlyGoalToRow(g)).then(logError('월간 목표 저장'));

export const deleteMonthlyGoal = (id: string) =>
  void supabase.from('monthly_goals').delete().eq('id', id).then(logError('월간 목표 삭제'));

export const upsertWeeklyGoal = (g: WeeklyGoal) =>
  void supabase.from('weekly_goals').upsert(m.weeklyGoalToRow(g)).then(logError('주간 목표 저장'));

export const deleteWeeklyGoal = (id: string) =>
  void supabase.from('weekly_goals').delete().eq('id', id).then(logError('주간 목표 삭제'));

export const updateGoalSlots = (slots: number, userId: string) =>
  void supabase.from('profiles').update({ goal_slots: slots }).eq('id', userId).then(logError('목표 슬롯 저장'));

// ── 할 일 ─────────────────────────────────────────────
export const listTodos = async (): Promise<Todo[]> => {
  const { data, error } = await supabase.from('todos').select('*').order('created_at');
  if (error) throw error;
  return (data ?? []).map(m.todoFromRow);
};

export const upsertTodo = (t: Todo) =>
  void supabase.from('todos').upsert(m.todoToRow(t)).then(logError('할 일 저장'));

export const deleteTodo = (id: string) =>
  void supabase.from('todos').delete().eq('id', id).then(logError('할 일 삭제'));

// ── 일기 ──────────────────────────────────────────────
export const listDiaryEntries = async (): Promise<DiaryEntry[]> => {
  const { data, error } = await supabase.from('diary_entries').select('*');
  if (error) throw error;
  return (data ?? []).map(m.diaryFromRow);
};

export const upsertDiaryEntry = (e: DiaryEntry) =>
  void supabase
    .from('diary_entries')
    .upsert(m.diaryToRow(e), { onConflict: 'user_id,date' })
    .then(logError('일기 저장'));

export const deleteDiaryEntry = (date: string) =>
  void supabase.from('diary_entries').delete().eq('date', date).then(logError('일기 삭제'));

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
  void supabase
    .from('user_settings')
    .upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .then(logError('설정 저장'));

export const fetchGoalSlots = async (userId: string): Promise<number | null> => {
  const { data, error } = await supabase
    .from('profiles')
    .select('goal_slots')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data?.goal_slots ?? null;
};
