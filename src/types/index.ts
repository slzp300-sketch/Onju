export type GoalStatus = 'active' | 'completed' | 'failed';
export type RoutineType = 'personal' | 'faith';
export type GroupStatus = 'recruiting' | 'active' | 'completed';
export type GroupRole = 'creator' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  profileImage?: string;
  weeklyGoalSlots: number; // 3~5, 기본값 3
}

export interface MonthlyGoal {
  id: string;
  userId: string;
  title: string;
  description?: string;
  month: number;
  year: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status: GoalStatus;
  createdAt: string;
}

export interface WeeklyGoal {
  id: string;
  userId: string;
  monthlyGoalId?: string;
  title: string;
  weekNumber: number;
  year: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status: GoalStatus;
  completionRate: number; // 0-100
  linkedRoutineIds: string[];
  createdAt: string;
}

export type TimeSlot = 'morning' | 'afternoon' | 'evening';

export interface DailyRoutine {
  id: string;
  userId: string;
  title: string;
  emoji?: string;
  type: RoutineType;
  weeklyGoalId?: string;
  monthlyGoalId?: string;
  frequency: 'daily' | 'weekdays' | 'weekends' | number[];
  isActive: boolean;
  order: number;
  createdAt: string;
  durationMinutes?: number;
  durationSeconds?: number;   // 타이머 초 단위 (durationMinutes보다 우선)
  timeSlot?: TimeSlot;
}

export interface FaithRoutineTemplate {
  id: string;
  title: string;
  description: string;
  isDefault: boolean;
  category: 'prayer' | 'bible' | 'reflection' | 'custom';
  icon: string;
}

export interface RoutineLog {
  id: string;
  routineId: string;
  userId: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  skipped?: boolean; // 쉬어가기 (completed와 상호배타)
  memo?: string;
  completedAt?: string;
}

export interface SmallGroup {
  id: string;
  creatorId: string;
  title: string;
  goal: string;
  startDate: string;
  endDate: string;
  maxMembers: number;
  currentMemberCount: number;
  status: GroupStatus;
  isPublic: boolean;
  createdAt: string;
}

export interface GroupMembership {
  id: string;
  groupId: string;
  userId: string;
  user: Pick<User, 'id' | 'name' | 'profileImage'>;
  role: GroupRole;
  joinedAt: string;
  sharedGoalIds: string[];
  sharedRoutineIds: string[];
}

export interface MemberGroupProgress {
  userId: string;
  userName: string;
  profileImage?: string;
  todayPersonalRate: number;
  todayFaithRate: number;
  weeklyRate: number;
  streak: number;
}

export interface SlotUnlockHistory {
  userId: string;
  weekNumber: number;
  year: number;
  completionRate: number;
  unlockedAt: string;
  newSlotCount: number;
}

export type CheerType = 'heart' | 'fire' | 'pray';

export interface Cheer {
  id: string;
  fromUserId: string;
  toUserId: string;
  groupId: string;
  type: CheerType;
  date: string; // YYYY-MM-DD
  createdAt: string;
}

export type BadgeType =
  | 'streak_3' | 'streak_7' | 'streak_14' | 'streak_30'
  | 'faith_streak_7'
  | 'slot_max'
  | 'perfect_week'
  | 'group_complete';

export interface UserBadge {
  type: BadgeType;
  earnedAt: string;
}

export interface BibleVerse {
  book: string;
  chapter: number;
  verse: number;
  text: string;
  reflection?: string;
}

// 습관 반복 주기
export type HabitFrequency = 'daily' | 'weekdays' | 'weekends' | 'custom';
export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export interface HabitNotification {
  enabled: boolean;
  type: 'push' | 'sound';
  times: string[]; // ["HH:mm", ...] 복수 알림 시간
}

// 습관 (개별 단위)
export interface Habit {
  id: string;
  userId: string;
  title: string;
  emoji: string;
  frequency: HabitFrequency;
  customDays?: number[]; // 0=일 ~ 6=토, frequency==='custom'일 때
  when: string; // 사용자 입력 텍스트 ("아침 기상 후", "출근 전" 등)
  durationSeconds?: number; // 타이머 시간 (초)
  notification?: HabitNotification;
  createdAt: string;
}

// 개인 루틴 (습관 2개 이상의 묶음)
export interface PersonalRoutine {
  id: string;
  userId: string;
  title: string;
  emoji: string;
  when: string;
  habitIds: string[]; // 순서 있는 습관 ID 목록
  habitDurations?: Record<string, number>; // habitId → 분
  timerEnabled: boolean;
  createdAt: string;
}

export interface Todo {
  id: string;
  userId: string;
  title: string;
  emoji?: string;
  date: string; // YYYY-MM-DD
  completed: boolean;
  completedAt?: string;
  createdAt: string;
}

// 루틴 조정 내역
export interface RoutineChange {
  routineId: string;
  action: 'keep' | 'edit' | 'delete' | 'add';
  changes?: {
    title?: string;
    frequency?: DailyRoutine['frequency'];
    weeklyGoalId?: string | null;
  };
  newRoutine?: Omit<DailyRoutine, 'id' | 'userId' | 'createdAt'>;
  appliedAt?: string;
}

// 주간 리뷰
export interface WeeklyReview {
  id: string;
  userId: string;
  weekNumber: number;
  year: number;
  personalRate: number;
  faithRate: number;
  goalAchievedCount: number;
  goalTotalCount: number;
  mood: 'hard' | 'normal' | 'easy' | null;
  goalRatings: Record<string, 1 | 2 | 3 | 4 | 5>;
  comment: string;
  intention: string;
  shareToGroups: string[];
  routineChanges: RoutineChange[];
  completedAt: string | null;
  createdAt: string;
}

// 소모임 주간 나눔
export interface GroupWeeklyShare {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  weekNumber: number;
  year: number;
  personalRate: number;
  faithRate: number;
  comment: string;
  intention: string;
  sharedAt: string;
}
