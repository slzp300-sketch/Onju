import { http, HttpResponse } from 'msw';
import { mockMonthlyGoals, mockWeeklyGoals } from '../data/seed';
import type { MonthlyGoal, WeeklyGoal } from '../../types';

const monthlyGoals: MonthlyGoal[] = [...mockMonthlyGoals];
const weeklyGoals: WeeklyGoal[] = [...mockWeeklyGoals];

export const goalHandlers = [
  http.get('/api/goals/monthly', ({ request }) => {
    const url = new URL(request.url);
    const month = url.searchParams.get('month');
    const year = url.searchParams.get('year');
    const filtered = monthlyGoals.filter(g =>
      (!month || g.month === Number(month)) &&
      (!year || g.year === Number(year))
    );
    return HttpResponse.json({ goals: filtered });
  }),

  http.post('/api/goals/monthly', async ({ request }) => {
    const body = await request.json() as Partial<MonthlyGoal>;
    const now = new Date();
    const newGoal: MonthlyGoal = {
      id: `mg-${Date.now()}`,
      userId: 'user-1',
      title: body.title ?? '',
      description: body.description,
      month: body.month ?? now.getMonth() + 1,
      year: body.year ?? now.getFullYear(),
      startDate: body.startDate ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
      endDate: body.endDate ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0],
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    monthlyGoals.push(newGoal);
    return HttpResponse.json(newGoal, { status: 201 });
  }),

  http.get('/api/goals/weekly', ({ request }) => {
    const url = new URL(request.url);
    const week = url.searchParams.get('weekNumber');
    const year = url.searchParams.get('year');
    const filtered = weeklyGoals.filter(g =>
      (!week || g.weekNumber === Number(week)) &&
      (!year || g.year === Number(year))
    );
    return HttpResponse.json({ goals: filtered });
  }),

  http.post('/api/goals/weekly', async ({ request }) => {
    const body = await request.json() as Partial<WeeklyGoal>;
    const newGoal: WeeklyGoal = {
      id: `wg-${Date.now()}`,
      userId: 'user-1',
      monthlyGoalId: body.monthlyGoalId,
      title: body.title ?? '',
      weekNumber: body.weekNumber ?? 1,
      year: body.year ?? new Date().getFullYear(),
      startDate: body.startDate ?? new Date().toISOString().split('T')[0],
      endDate: body.endDate ?? new Date().toISOString().split('T')[0],
      status: 'active',
      completionRate: 0,
      linkedRoutineIds: body.linkedRoutineIds ?? [],
      createdAt: new Date().toISOString(),
    };
    weeklyGoals.push(newGoal);
    return HttpResponse.json(newGoal, { status: 201 });
  }),

  http.delete('/api/goals/weekly/:id', ({ params }) => {
    const idx = weeklyGoals.findIndex(g => g.id === params.id);
    if (idx !== -1) weeklyGoals.splice(idx, 1);
    return HttpResponse.json({ success: true });
  }),
];
