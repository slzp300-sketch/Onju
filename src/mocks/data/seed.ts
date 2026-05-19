import type { User, MonthlyGoal, WeeklyGoal, DailyRoutine, RoutineLog } from '../../types';
import { getISOWeek, getYear, format, subDays } from 'date-fns';

const today = new Date();
const currentWeek = getISOWeek(today);
const currentYear = getYear(today);
const todayStr = format(today, 'yyyy-MM-dd');

export const mockUser: User = {
  id: 'user-1',
  name: '김민준',
  email: 'minjun@example.com',
  weeklyGoalSlots: 3,
};

export const mockMonthlyGoals: MonthlyGoal[] = [
  {
    id: 'mg-1',
    userId: 'user-1',
    title: '직장에서 선한 영향력 실천',
    description: '매일 한 가지 긍정적인 행동으로 동료들에게 선한 영향력 흘려보내기',
    month: today.getMonth() + 1,
    year: today.getFullYear(),
    status: 'active',
    createdAt: new Date().toISOString(),
  },
];

export const mockWeeklyGoals: WeeklyGoal[] = [
  {
    id: 'wg-1',
    userId: 'user-1',
    monthlyGoalId: 'mg-1',
    title: '매일 아침 경건의 시간 갖기',
    weekNumber: currentWeek,
    year: currentYear,
    status: 'active',
    completionRate: 71,
    linkedRoutineIds: ['pr-1', 'fr-1'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'wg-2',
    userId: 'user-1',
    title: '동료에게 따뜻한 말 한마디',
    weekNumber: currentWeek,
    year: currentYear,
    status: 'active',
    completionRate: 85,
    linkedRoutineIds: ['pr-2'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'wg-3',
    userId: 'user-1',
    title: '점심 시간 짧은 묵상',
    weekNumber: currentWeek,
    year: currentYear,
    status: 'active',
    completionRate: 57,
    linkedRoutineIds: ['fr-2'],
    createdAt: new Date().toISOString(),
  },
];

export const mockPersonalRoutines: DailyRoutine[] = [
  {
    id: 'pr-1',
    userId: 'user-1',
    title: '오늘의 의도 설정 (1분)',
    type: 'personal',
    weeklyGoalId: 'wg-1',
    frequency: 'daily',
    isActive: true,
    order: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'pr-2',
    userId: 'user-1',
    title: '동료에게 격려 메시지 보내기',
    type: 'personal',
    weeklyGoalId: 'wg-2',
    frequency: 'weekdays',
    isActive: true,
    order: 1,
    createdAt: new Date().toISOString(),
  },
];

export const mockFaithRoutines: DailyRoutine[] = [
  {
    id: 'fr-1',
    userId: 'user-1',
    title: '기도',
    type: 'faith',
    frequency: 'daily',
    isActive: true,
    order: 0,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'fr-2',
    userId: 'user-1',
    title: '말씀',
    type: 'faith',
    frequency: 'daily',
    isActive: true,
    order: 1,
    createdAt: new Date().toISOString(),
  },
];

// 최근 7일 샘플 로그
export const mockRoutineLogs: RoutineLog[] = [
  ...['pr-1', 'pr-2', 'fr-1', 'fr-2'].map((routineId, i) => ({
    id: `log-today-${i}`,
    routineId,
    userId: 'user-1',
    date: todayStr,
    completed: false,
    completedAt: undefined,
  })),
  // 어제
  ...['pr-1', 'fr-1', 'fr-2'].map((routineId, i) => ({
    id: `log-y1-${i}`,
    routineId,
    userId: 'user-1',
    date: format(subDays(today, 1), 'yyyy-MM-dd'),
    completed: true,
    completedAt: new Date().toISOString(),
  })),
  // 2일 전
  ...['pr-1', 'pr-2', 'fr-1', 'fr-2'].map((routineId, i) => ({
    id: `log-y2-${i}`,
    routineId,
    userId: 'user-1',
    date: format(subDays(today, 2), 'yyyy-MM-dd'),
    completed: true,
    completedAt: new Date().toISOString(),
  })),
];

export const mockGroups = [
  {
    id: 'grp-1',
    creatorId: 'user-2',
    title: '새벽 5시 기상 챌린지',
    goal: '4주간 매일 새벽 5시에 기상하여 경건의 시간을 갖고 하루를 주님께 맡기기',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
    maxMembers: 6,
    currentMemberCount: 4,
    status: 'recruiting' as const,
    isPublic: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'grp-2',
    creatorId: 'user-3',
    title: '직장인 말씀 묵상 모임',
    goal: '매일 10분 큐티 후 한 줄 나눔으로 직장 생활 속 말씀의 적용 찾기',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
    maxMembers: 8,
    currentMemberCount: 8,
    status: 'active' as const,
    isPublic: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'grp-3',
    creatorId: 'user-4',
    title: '월요일 감사 기도 모임',
    goal: '매주 월요일 아침 한 가지 감사를 나누며 한 주를 시작하기',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    maxMembers: 5,
    currentMemberCount: 2,
    status: 'recruiting' as const,
    isPublic: true,
    createdAt: new Date().toISOString(),
  },
];
