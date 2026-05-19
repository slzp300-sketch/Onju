import { http, HttpResponse } from 'msw';
import { mockPersonalRoutines, mockFaithRoutines, mockRoutineLogs } from '../data/seed';
import type { DailyRoutine, RoutineLog } from '../../types';

const routines: DailyRoutine[] = [...mockPersonalRoutines, ...mockFaithRoutines];
const logs: RoutineLog[] = [...mockRoutineLogs];

export const routineHandlers = [
  http.get('/api/routines', () => {
    return HttpResponse.json({ routines });
  }),

  http.post('/api/routines', async ({ request }) => {
    const body = await request.json() as Partial<DailyRoutine>;
    const newRoutine: DailyRoutine = {
      id: `r-${Date.now()}`,
      userId: 'user-1',
      title: body.title ?? '',
      type: body.type ?? 'personal',
      frequency: body.frequency ?? 'daily',
      isActive: true,
      order: routines.filter(r => r.type === body.type).length,
      createdAt: new Date().toISOString(),
    };
    routines.push(newRoutine);
    return HttpResponse.json(newRoutine, { status: 201 });
  }),

  http.delete('/api/routines/:id', ({ params }) => {
    const idx = routines.findIndex(r => r.id === params.id);
    if (idx !== -1) routines.splice(idx, 1);
    return HttpResponse.json({ success: true });
  }),

  http.get('/api/routine-logs', ({ request }) => {
    const url = new URL(request.url);
    const date = url.searchParams.get('date');
    const filtered = date ? logs.filter(l => l.date === date) : logs;
    return HttpResponse.json({ logs: filtered });
  }),

  http.post('/api/routine-logs/toggle', async ({ request }) => {
    const body = await request.json() as { routineId: string; date: string };
    const existing = logs.find(l => l.routineId === body.routineId && l.date === body.date);

    if (existing) {
      existing.completed = !existing.completed;
      existing.completedAt = existing.completed ? new Date().toISOString() : undefined;
      return HttpResponse.json(existing);
    }

    const newLog: RoutineLog = {
      id: `log-${Date.now()}`,
      routineId: body.routineId,
      userId: 'user-1',
      date: body.date,
      completed: true,
      completedAt: new Date().toISOString(),
    };
    logs.push(newLog);
    return HttpResponse.json(newLog);
  }),
];
