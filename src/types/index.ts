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
  type: RoutineType;
  weeklyGoalId?: string;
  monthlyGoalId?: string;
  frequency: 'daily' | 'weekdays' | 'weekends' | number[];
  isActive: boolean;
  order: number;
  createdAt: string;
  durationMinutes?: number;
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
