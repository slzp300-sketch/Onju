import api from './index';
import type { MonthlyGoal, WeeklyGoal } from '../types';

export const fetchMonthlyGoals = (month: number, year: number) =>
  api.get<{ goals: MonthlyGoal[] }>('/goals/monthly', { params: { month, year } }).then(r => r.data.goals);

export const fetchWeeklyGoals = (weekNumber: number, year: number) =>
  api.get<{ goals: WeeklyGoal[] }>('/goals/weekly', { params: { weekNumber, year } }).then(r => r.data.goals);

export const createMonthlyGoal = (data: Partial<MonthlyGoal>) =>
  api.post<MonthlyGoal>('/goals/monthly', data).then(r => r.data);

export const createWeeklyGoal = (data: Partial<WeeklyGoal>) =>
  api.post<WeeklyGoal>('/goals/weekly', data).then(r => r.data);

export const deleteWeeklyGoal = (id: string) =>
  api.delete(`/goals/weekly/${id}`).then(r => r.data);
