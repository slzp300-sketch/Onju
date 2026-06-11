import type {
  DailyRoutine,
  RoutineLog,
  Habit,
  PersonalRoutine,
  MonthlyGoal,
  WeeklyGoal,
  Todo,
  DiaryEntry,
  WeeklyReview,
  SmallGroup,
  GroupWeeklyShare,
} from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
// snake_case 행 ↔ 기존 camelCase 타입 변환.
// insert 시 user_id는 넣지 않는다 — DB 기본값 auth.uid()가 채운다.

const orNull = <T>(v: T | undefined): T | null => (v === undefined ? null : v);

// ── DailyRoutine ──────────────────────────────────────
export function routineToRow(r: DailyRoutine) {
  return {
    id: r.id,
    title: r.title,
    emoji: orNull(r.emoji),
    type: r.type,
    weekly_goal_id: orNull(r.weeklyGoalId),
    monthly_goal_id: orNull(r.monthlyGoalId),
    frequency: r.frequency,
    is_active: r.isActive,
    sort_order: r.order,
    duration_minutes: orNull(r.durationMinutes),
    duration_seconds: orNull(r.durationSeconds),
    time_slot: orNull(r.timeSlot),
    when_text: orNull(r.when),
    two_minute_habit: orNull(r.twoMinuteHabit),
    notification: orNull(r.notification),
    goal_id: orNull(r.goalId),
    created_at: r.createdAt,
  };
}

export function routineFromRow(row: any): DailyRoutine {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    emoji: row.emoji ?? undefined,
    type: row.type,
    weeklyGoalId: row.weekly_goal_id ?? undefined,
    monthlyGoalId: row.monthly_goal_id ?? undefined,
    frequency: row.frequency,
    isActive: row.is_active,
    order: row.sort_order,
    createdAt: row.created_at,
    durationMinutes: row.duration_minutes ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    timeSlot: row.time_slot ?? undefined,
    when: row.when_text ?? undefined,
    twoMinuteHabit: row.two_minute_habit ?? undefined,
    notification: row.notification ?? undefined,
    goalId: row.goal_id ?? undefined,
  };
}

// ── RoutineLog ────────────────────────────────────────
export function routineLogToRow(l: RoutineLog) {
  return {
    id: l.id,
    routine_id: l.routineId,
    date: l.date,
    completed: l.completed,
    skipped: l.skipped ?? false,
    memo: orNull(l.memo),
    completed_at: orNull(l.completedAt),
  };
}

export function routineLogFromRow(row: any): RoutineLog {
  return {
    id: row.id,
    routineId: row.routine_id,
    userId: row.user_id,
    date: row.date,
    completed: row.completed,
    skipped: row.skipped || undefined,
    memo: row.memo ?? undefined,
    completedAt: row.completed_at ?? undefined,
  };
}

// ── Habit ─────────────────────────────────────────────
export function habitToRow(h: Habit) {
  return {
    id: h.id,
    title: h.title,
    emoji: h.emoji,
    frequency: h.frequency,
    custom_days: orNull(h.customDays),
    when_text: h.when,
    goal_id: orNull(h.goalId),
    duration_seconds: orNull(h.durationSeconds),
    mini_routine: orNull(h.miniRoutine),
    two_minute_habit: orNull(h.twoMinuteHabit),
    notification: orNull(h.notification),
    created_at: h.createdAt,
  };
}

export function habitFromRow(row: any): Habit {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    emoji: row.emoji,
    frequency: row.frequency,
    customDays: row.custom_days ?? undefined,
    when: row.when_text,
    goalId: row.goal_id ?? undefined,
    durationSeconds: row.duration_seconds ?? undefined,
    miniRoutine: row.mini_routine ?? undefined,
    twoMinuteHabit: row.two_minute_habit ?? undefined,
    notification: row.notification ?? undefined,
    createdAt: row.created_at,
  };
}

// ── HabitLog (스토어 로컬 타입) ────────────────────────
export interface HabitLogLocal {
  habitId: string;
  date: string;
  completed: boolean;
  skipped?: boolean;
  substitute?: boolean;
}

export function habitLogToRow(l: HabitLogLocal) {
  return {
    habit_id: l.habitId,
    date: l.date,
    completed: l.completed,
    skipped: l.skipped ?? false,
    substitute: l.substitute ?? false,
  };
}

export function habitLogFromRow(row: any): HabitLogLocal {
  return {
    habitId: row.habit_id,
    date: row.date,
    completed: row.completed,
    skipped: row.skipped || undefined,
    substitute: row.substitute || undefined,
  };
}

// ── PersonalRoutine ───────────────────────────────────
export function personalRoutineToRow(r: PersonalRoutine) {
  return {
    id: r.id,
    title: r.title,
    emoji: r.emoji,
    when_text: r.when,
    habit_ids: r.habitIds,
    habit_durations: orNull(r.habitDurations),
    timer_enabled: r.timerEnabled,
    created_at: r.createdAt,
  };
}

export function personalRoutineFromRow(row: any): PersonalRoutine {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    emoji: row.emoji,
    when: row.when_text,
    habitIds: row.habit_ids ?? [],
    habitDurations: row.habit_durations ?? undefined,
    timerEnabled: row.timer_enabled,
    createdAt: row.created_at,
  };
}

// ── MonthlyGoal / WeeklyGoal ──────────────────────────
export function monthlyGoalToRow(g: MonthlyGoal) {
  return {
    id: g.id,
    title: g.title,
    description: orNull(g.description),
    month: g.month,
    year: g.year,
    start_date: g.startDate,
    end_date: g.endDate,
    status: g.status,
    to_be_statement: orNull(g.toBeStatement),
    goal_routines: orNull(g.goalRoutines),
    color: orNull(g.color),
    category: orNull(g.category),
    created_at: g.createdAt,
  };
}

export function monthlyGoalFromRow(row: any): MonthlyGoal {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description ?? undefined,
    month: row.month,
    year: row.year,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    createdAt: row.created_at,
    toBeStatement: row.to_be_statement ?? undefined,
    goalRoutines: row.goal_routines ?? undefined,
    color: row.color ?? undefined,
    category: row.category ?? undefined,
  };
}

export function weeklyGoalToRow(g: WeeklyGoal) {
  return {
    id: g.id,
    monthly_goal_id: orNull(g.monthlyGoalId),
    title: g.title,
    week_number: g.weekNumber,
    year: g.year,
    start_date: g.startDate,
    end_date: g.endDate,
    status: g.status,
    completion_rate: g.completionRate,
    linked_routine_ids: g.linkedRoutineIds,
    created_at: g.createdAt,
  };
}

export function weeklyGoalFromRow(row: any): WeeklyGoal {
  return {
    id: row.id,
    userId: row.user_id,
    monthlyGoalId: row.monthly_goal_id ?? undefined,
    title: row.title,
    weekNumber: row.week_number,
    year: row.year,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    completionRate: row.completion_rate,
    linkedRoutineIds: row.linked_routine_ids ?? [],
    createdAt: row.created_at,
  };
}

// ── Todo ──────────────────────────────────────────────
export function todoToRow(t: Todo) {
  return {
    id: t.id,
    title: t.title,
    emoji: orNull(t.emoji),
    date: t.date,
    completed: t.completed,
    completed_at: orNull(t.completedAt),
    created_at: t.createdAt,
  };
}

export function todoFromRow(row: any): Todo {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    emoji: row.emoji ?? undefined,
    date: row.date,
    completed: row.completed,
    completedAt: row.completed_at ?? undefined,
    createdAt: row.created_at,
  };
}

// ── DiaryEntry ────────────────────────────────────────
export function diaryToRow(e: DiaryEntry) {
  return {
    date: e.date,
    mood: orNull(e.mood),
    content: e.content,
    updated_at: e.updatedAt,
  };
}

export function diaryFromRow(row: any): DiaryEntry {
  return {
    date: row.date,
    mood: row.mood ?? null,
    content: row.content,
    updatedAt: row.updated_at,
  };
}

// ── WeeklyReview ──────────────────────────────────────
export function reviewToRow(r: WeeklyReview) {
  return {
    id: r.id,
    week_number: r.weekNumber,
    year: r.year,
    personal_rate: r.personalRate,
    faith_rate: r.faithRate,
    goal_achieved_count: r.goalAchievedCount,
    goal_total_count: r.goalTotalCount,
    mood: orNull(r.mood),
    goal_ratings: r.goalRatings,
    comment: r.comment,
    intention: r.intention,
    share_to_groups: r.shareToGroups,
    routine_changes: r.routineChanges,
    completed_at: orNull(r.completedAt),
    created_at: r.createdAt,
  };
}

export function reviewFromRow(row: any): WeeklyReview {
  return {
    id: row.id,
    userId: row.user_id,
    weekNumber: row.week_number,
    year: row.year,
    personalRate: row.personal_rate,
    faithRate: row.faith_rate,
    goalAchievedCount: row.goal_achieved_count,
    goalTotalCount: row.goal_total_count,
    mood: row.mood ?? null,
    goalRatings: row.goal_ratings ?? {},
    comment: row.comment,
    intention: row.intention,
    shareToGroups: row.share_to_groups ?? [],
    routineChanges: row.routine_changes ?? [],
    completedAt: row.completed_at ?? null,
    createdAt: row.created_at,
  };
}

// ── SmallGroup ────────────────────────────────────────
export function groupToRow(g: SmallGroup) {
  return {
    id: g.id,
    title: g.title,
    goal: g.goal,
    start_date: g.startDate,
    end_date: g.endDate,
    max_members: g.maxMembers,
    status: g.status,
    is_public: g.isPublic,
    category: orNull(g.category),
    cover_icon: orNull(g.coverIcon),
    color: orNull(g.color),
    rules: orNull(g.rules),
    created_at: g.createdAt,
  };
}

export function groupFromRow(row: any, memberCount = 0): SmallGroup {
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    goal: row.goal,
    startDate: row.start_date,
    endDate: row.end_date,
    maxMembers: row.max_members,
    currentMemberCount: memberCount,
    status: row.status,
    isPublic: row.is_public,
    createdAt: row.created_at,
    category: row.category ?? undefined,
    coverIcon: row.cover_icon ?? undefined,
    color: row.color ?? undefined,
    rules: row.rules ?? undefined,
  };
}

// ── GroupWeeklyShare ──────────────────────────────────
export function shareFromRow(row: any): GroupWeeklyShare {
  return {
    id: row.id,
    groupId: row.group_id,
    userId: row.user_id,
    userName: row.profiles?.name ?? '',
    weekNumber: row.week_number,
    year: row.year,
    personalRate: row.personal_rate,
    faithRate: row.faith_rate,
    comment: row.comment,
    intention: row.intention,
    sharedAt: row.shared_at,
  };
}
