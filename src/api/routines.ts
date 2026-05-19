import api from './index';
import type { DailyRoutine, RoutineLog } from '../types';

export const fetchRoutines = () =>
  api.get<{ routines: DailyRoutine[] }>('/routines').then(r => r.data.routines);

export const fetchRoutineLogs = (date: string) =>
  api.get<{ logs: RoutineLog[] }>('/routine-logs', { params: { date } }).then(r => r.data.logs);

export const toggleRoutineLog = (routineId: string, date: string) =>
  api.post<RoutineLog>('/routine-logs/toggle', { routineId, date }).then(r => r.data);

export const createRoutine = (data: Partial<DailyRoutine>) =>
  api.post<DailyRoutine>('/routines', data).then(r => r.data);

export const deleteRoutine = (id: string) =>
  api.delete(`/routines/${id}`).then(r => r.data);
