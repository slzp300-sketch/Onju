import { http, HttpResponse } from 'msw';
import { mockGroups } from '../data/seed';
import type { SmallGroup, MemberGroupProgress } from '../../types';

const groups: SmallGroup[] = [...mockGroups];

const mockMembers: MemberGroupProgress[] = [
  { userId: 'user-1', userName: '김민준', todayPersonalRate: 50, todayFaithRate: 100, weeklyRate: 71, streak: 3 },
  { userId: 'user-2', userName: '이서연', todayPersonalRate: 100, todayFaithRate: 100, weeklyRate: 92, streak: 7 },
  { userId: 'user-3', userName: '박지훈', todayPersonalRate: 0, todayFaithRate: 50, weeklyRate: 55, streak: 1 },
  { userId: 'user-4', userName: '최유나', todayPersonalRate: 100, todayFaithRate: 100, weeklyRate: 88, streak: 5 },
];

export const groupHandlers = [
  http.get('/api/groups', ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const page = Number(url.searchParams.get('page') ?? 1);
    const limit = Number(url.searchParams.get('limit') ?? 10);

    const filtered = status ? groups.filter(g => g.status === status) : groups;
    const start = (page - 1) * limit;
    const items = filtered.slice(start, start + limit);

    return HttpResponse.json({
      groups: items,
      total: filtered.length,
      hasNextPage: start + limit < filtered.length,
      nextPage: start + limit < filtered.length ? page + 1 : null,
    });
  }),

  http.get('/api/groups/:id', ({ params }) => {
    const group = groups.find(g => g.id === params.id);
    if (!group) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    return HttpResponse.json({ group });
  }),

  http.post('/api/groups', async ({ request }) => {
    const body = await request.json() as Partial<SmallGroup>;
    const newGroup: SmallGroup = {
      id: `grp-${Date.now()}`,
      creatorId: 'user-1',
      title: body.title ?? '',
      goal: body.goal ?? '',
      startDate: body.startDate ?? new Date().toISOString(),
      endDate: body.endDate ?? new Date().toISOString(),
      maxMembers: body.maxMembers ?? 6,
      currentMemberCount: 1,
      status: 'recruiting',
      isPublic: body.isPublic ?? true,
      createdAt: new Date().toISOString(),
    };
    groups.push(newGroup);
    return HttpResponse.json(newGroup, { status: 201 });
  }),

  http.post('/api/groups/:id/join', ({ params }) => {
    const group = groups.find(g => g.id === params.id);
    if (!group) return HttpResponse.json({ error: 'Not found' }, { status: 404 });
    if (group.currentMemberCount >= group.maxMembers) {
      return HttpResponse.json({ error: '정원이 가득 찼습니다' }, { status: 400 });
    }
    group.currentMemberCount += 1;
    return HttpResponse.json({ success: true, group });
  }),

  http.get('/api/groups/:id/members', () => {
    return HttpResponse.json({ members: mockMembers });
  }),
];
