import api from './index';
import type { WeeklyReview, GroupWeeklyShare } from '../types';

export const fetchReviews = () =>
  api.get<{ reviews: WeeklyReview[] }>('/reviews').then(r => r.data.reviews);

export const fetchReviewByWeek = (weekNumber: number, year: number) =>
  api.get<{ review: WeeklyReview | null }>('/reviews', { params: { weekNumber, year } })
    .then(r => r.data.review);

export const createReview = (data: Partial<WeeklyReview>) =>
  api.post<{ review: WeeklyReview }>('/reviews', data).then(r => r.data.review);

export const completeReview = (id: string, data: Partial<WeeklyReview>) =>
  api.patch<{ review: WeeklyReview }>(`/reviews/${id}`, data).then(r => r.data.review);

export const fetchWeeklyShares = (groupId: string, weekNumber?: number) =>
  api.get<{ shares: GroupWeeklyShare[] }>(`/groups/${groupId}/weekly-shares`, {
    params: weekNumber ? { weekNumber } : undefined,
  }).then(r => r.data.shares);

export const createWeeklyShare = (groupId: string, data: Partial<GroupWeeklyShare>) =>
  api.post<{ share: GroupWeeklyShare }>(`/groups/${groupId}/weekly-shares`, data)
    .then(r => r.data.share);
