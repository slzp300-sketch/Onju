import { http, HttpResponse } from 'msw';
import { getISOWeek, getYear } from 'date-fns';
import type { WeeklyReview, GroupWeeklyShare } from '../../types';

const today = new Date();

// 초기 목 데이터 — 최근 4주치 완료 리뷰
const mockReviews: WeeklyReview[] = [
  {
    id: 'rv-1',
    userId: 'user-1',
    weekNumber: getISOWeek(today) - 3,
    year: getYear(today),
    personalRate: 71,
    faithRate: 85,
    goalAchievedCount: 1,
    goalTotalCount: 2,
    mood: 'normal',
    goalRatings: { 'wg-1': 3, 'wg-2': 4 },
    comment: '말씀 묵상이 직장 생활에 큰 힘이 됐어요.',
    intention: '동료에게 먼저 인사하기',
    shareToGroups: [],
    routineChanges: [],
    completedAt: new Date(Date.now() - 21 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 21 * 86400000).toISOString(),
  },
  {
    id: 'rv-2',
    userId: 'user-1',
    weekNumber: getISOWeek(today) - 2,
    year: getYear(today),
    personalRate: 85,
    faithRate: 100,
    goalAchievedCount: 2,
    goalTotalCount: 2,
    mood: 'easy',
    goalRatings: { 'wg-1': 5, 'wg-2': 5 },
    comment: '두 가지 목표 모두 잘 지켰어요. 감사해요.',
    intention: '퇴근 후 짧은 기도 시간 갖기',
    shareToGroups: ['grp-1'],
    routineChanges: [],
    completedAt: new Date(Date.now() - 14 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
  {
    id: 'rv-3',
    userId: 'user-1',
    weekNumber: getISOWeek(today) - 1,
    year: getYear(today),
    personalRate: 57,
    faithRate: 71,
    goalAchievedCount: 1,
    goalTotalCount: 2,
    mood: 'hard',
    goalRatings: { 'wg-1': 2, 'wg-2': 4 },
    comment: '야근이 많았던 한 주였어요. 그래도 기도는 지켰어요.',
    intention: '업무 시작 전 5분 묵상',
    shareToGroups: [],
    routineChanges: [],
    completedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
];

const mockWeeklyShares: GroupWeeklyShare[] = [
  {
    id: 'ws-1',
    groupId: 'grp-1',
    userId: 'user-2',
    userName: '이서연',
    weekNumber: getISOWeek(today) - 1,
    year: getYear(today),
    personalRate: 92,
    faithRate: 100,
    comment: '말씀 묵상이 직장 생활에 큰 힘이 됐어요.',
    intention: '점심 시간 5분 기도',
    sharedAt: new Date(Date.now() - 7 * 86400000).toISOString(),
  },
];

export const reviewHandlers = [
  // 내 리뷰 목록 조회
  http.get('/api/reviews', ({ request }) => {
    const url = new URL(request.url);
    const weekNumber = url.searchParams.get('weekNumber');
    const year = url.searchParams.get('year');

    if (weekNumber && year) {
      const found = mockReviews.find(
        r => r.weekNumber === Number(weekNumber) && r.year === Number(year)
      );
      return HttpResponse.json({ review: found ?? null });
    }
    return HttpResponse.json({ reviews: [...mockReviews].reverse() });
  }),

  // 리뷰 생성/완료
  http.post('/api/reviews', async ({ request }) => {
    const body = await request.json() as Partial<WeeklyReview>;
    const review: WeeklyReview = {
      id: `rv-${Date.now()}`,
      userId: 'user-1',
      weekNumber: getISOWeek(new Date()),
      year: getYear(new Date()),
      personalRate: 0,
      faithRate: 0,
      goalAchievedCount: 0,
      goalTotalCount: 0,
      mood: null,
      goalRatings: {},
      comment: '',
      intention: '',
      shareToGroups: [],
      routineChanges: [],
      completedAt: null,
      createdAt: new Date().toISOString(),
      ...body,
    };
    mockReviews.push(review);
    return HttpResponse.json({ review }, { status: 201 });
  }),

  // 리뷰 완료 처리 (PATCH)
  http.patch('/api/reviews/:id', async ({ params, request }) => {
    const body = await request.json() as Partial<WeeklyReview>;
    const idx = mockReviews.findIndex(r => r.id === params.id);
    if (idx === -1) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    mockReviews[idx] = { ...mockReviews[idx], ...body };
    return HttpResponse.json({ review: mockReviews[idx] });
  }),

  // 소모임 주간 나눔 조회
  http.get('/api/groups/:id/weekly-shares', ({ params, request }) => {
    const url = new URL(request.url);
    const weekNumber = url.searchParams.get('weekNumber');
    const shares = mockWeeklyShares.filter(s => {
      if (s.groupId !== params.id) return false;
      if (weekNumber && s.weekNumber !== Number(weekNumber)) return false;
      return true;
    });
    return HttpResponse.json({ shares });
  }),

  // 소모임 주간 나눔 등록
  http.post('/api/groups/:id/weekly-shares', async ({ params, request }) => {
    const body = await request.json() as Partial<GroupWeeklyShare>;
    const share: GroupWeeklyShare = {
      id: `ws-${Date.now()}`,
      groupId: params.id as string,
      userId: 'user-1',
      userName: '김민준',
      weekNumber: getISOWeek(new Date()),
      year: getYear(new Date()),
      personalRate: 0,
      faithRate: 0,
      comment: '',
      intention: '',
      sharedAt: new Date().toISOString(),
      ...body,
    };
    mockWeeklyShares.push(share);
    return HttpResponse.json({ share }, { status: 201 });
  }),
];
