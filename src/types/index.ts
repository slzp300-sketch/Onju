export type GoalStatus = 'active' | 'completed' | 'failed';
export type RoutineType = 'personal' | 'faith';
export type GroupStatus = 'recruiting' | 'active' | 'completed';
export type GroupRole = 'creator' | 'member';
export type GroupCategory = 'faith' | 'growth' | 'work' | 'health' | 'etc';

export interface User {
  id: string;
  name: string;
  email: string;
  profileImage?: string;
  weeklyGoalSlots: number; // 3~5, 기본값 3
}

export interface GoalRoutineItem {
  id: string;
  title: string;          // 습관명 (예: "러닝 30분")
  when?: string;          // 언제 (예: "출근 전 6시")
  where?: string;         // 어디서 (예: "공원")
  miniRoutine?: string;   // 미니습관 (예: "10분 스트레칭")
  twoMinuteHabit?: string; // 2분 습관 (예: "운동복으로 갈아입기")
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
  // 새 필드
  toBeStatement?: string;        // "나는 X하는 사람이야"
  goalRoutines?: GoalRoutineItem[]; // 루틴으로 쪼개기
  color?: string;                // 카드 색상 (hex)
  category?: 'personal' | 'faith'; // 개인 / 신앙
}

/**
 * 주간 목표 — "이번 주 몇 번". 습관·루틴 1개를 연동한 횟수 목표.
 * 주중 진행률은 체크 로그에서 자동 계산하고(utils/weeklyGoalProgress),
 * completionRate는 주간 리뷰 완료 시점에 확정 기록된다.
 */
export interface WeeklyGoal {
  id: string;
  userId: string;
  monthlyGoalId?: string;
  title: string;
  emoji?: string;
  weekNumber: number;
  year: number;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  status: GoalStatus;
  completionRate: number; // 0-100 (리뷰 시 확정)
  targetCount: number;    // 주간 목표 횟수 (1~7)
  linkedKind?: 'habit' | 'routine';
  linkedId?: string;
  linkedRoutineIds: string[]; // legacy
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
  durationSeconds?: number;   // 타이머 초 단위
  timeSlot?: TimeSlot;
  when?: string;              // 언제 할지 텍스트
  twoMinuteHabit?: string;    // 2분 트리거
  notification?: HabitNotification; // 개별 알림
  goalId?: string;            // 연동된 월간 목표 ID
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
  // 생성 시 구체 구성 (선택)
  category?: GroupCategory;
  coverIcon?: string;   // 커버 아이콘 키 (groupMeta COVER_ICONS)
  color?: string;       // 액센트 hex
  rules?: string[];     // 약속 목록
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
  goalId?: string;         // 연동된 월간 목표 ID
  durationSeconds?: number; // 타이머 시간 (초)
  miniRoutine?: string;    // 대체 습관 (예: 10분 스트레칭)
  twoMinuteHabit?: string; // 2분 트리거 (예: 운동복 갈아입기)
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

// 하루 일기 (날짜당 1개)
export type DiaryMood = 'great' | 'good' | 'neutral' | 'down' | 'bad';

export interface DiaryEntry {
  date: string; // YYYY-MM-DD (날짜를 키로 사용)
  mood: DiaryMood | null;
  content: string;
  updatedAt: string;
}

// 루틴 조정 내역
export interface RoutineChange {
  routineId: string;
  action: 'keep' | 'edit' | 'delete' | 'add';
  changes?: {
    title?: string;
    frequency?: DailyRoutine['frequency'];
    weeklyGoalId?: string | null;
    when?: string;
    twoMinuteHabit?: string;
    emoji?: string;
  };
  newRoutine?: Omit<DailyRoutine, 'id' | 'userId' | 'createdAt'>;
  appliedAt?: string;
}

// 습관 조정 내역
export interface HabitChange {
  habitId: string;
  action: 'keep' | 'edit' | 'delete';
  changes?: {
    title?: string;
    frequency?: HabitFrequency;
    customDays?: number[];
    when?: string;
    miniRoutine?: string;
    twoMinuteHabit?: string;
  };
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

// 루틴 공유 — 모임 스코프, 공유 시점 스냅샷 (원본과 분리)
export interface SharedRoutine {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  sourceRoutineId?: string;
  title: string;
  emoji?: string;
  when: string;
  kind: RoutineType;
  steps: string[];        // 스텝 제목 스냅샷
  adoptCount: number;
  cheerCount: number;
  cheeredByMe: boolean;
  weeklyProofCount: number; // 최근 7일 이 루틴 인증 횟수 (✓⁺ 신뢰 지표)
  createdAt: string;
}

// 루틴 인증 — 체크 직후 10분 안의 즉석 무보정 사진 1장
export type ProofReaction = 'heart' | 'fire' | 'clap';

export interface RoutineProof {
  id: string;
  groupId: string;
  userId: string;
  userName: string;
  routineId?: string;
  routineTitle: string;
  routineEmoji?: string;
  photoPath: string;
  photoUrl?: string;      // 서명 URL (조회 시 발급)
  note: string;
  proofDate: string;      // YYYY-MM-DD
  createdAt: string;
  reactions: Record<ProofReaction, number>;
  myReactions: Record<ProofReaction, boolean>;
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
