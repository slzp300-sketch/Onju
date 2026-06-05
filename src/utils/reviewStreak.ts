import { getISOWeek, getYear } from 'date-fns';
import type { WeeklyReview } from '../types';

/**
 * 주간 리뷰 연속 주차 계산.
 * - 완료된 리뷰를 최신순 정렬 후 연속 주차 카운트
 * - 최근 리뷰가 이번 주 또는 지난주 범위를 벗어나면 0 반환 (끊긴 것으로 판정)
 */
export function calcReviewStreak(reviews: WeeklyReview[]): number {
  const completed = reviews
    .filter(r => r.completedAt !== null)
    .sort((a, b) =>
      a.year !== b.year ? b.year - a.year : b.weekNumber - a.weekNumber
    );

  if (completed.length === 0) return 0;

  const now = new Date();
  const thisWeek = getISOWeek(now);
  const thisYear = getYear(now);

  const { year: ly, weekNumber: lw } = completed[0];
  const isRecent =
    (ly === thisYear && thisWeek - lw <= 1) ||
    (ly === thisYear - 1 && thisWeek === 1 && lw >= 52);

  if (!isRecent) return 0;

  let streak = 1;
  for (let i = 1; i < completed.length; i++) {
    const { year: py, weekNumber: pw } = completed[i - 1];
    const { year: cy, weekNumber: cw } = completed[i];
    const consecutive =
      (py === cy && pw - cw === 1) ||
      (py === cy + 1 && pw === 1 && cw >= 52);
    if (consecutive) streak++;
    else break;
  }
  return streak;
}
