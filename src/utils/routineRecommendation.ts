import type { DailyRoutine, RoutineLog, WeeklyReview } from '../types';
import { calcCompletionRate } from './completion';
import { getCurrentWeekRange } from './date';

export type RecommendationType =
  | 'reduce_frequency'
  | 'change_time'
  | 'take_break'
  | 'increase_challenge'
  | 'keep_going';

export interface RoutineRecommendation {
  routineId: string;
  type: RecommendationType;
  message: string;
}

// 과거 리뷰에서 특정 루틴의 달성률을 역산하는 헬퍼
// reviews에 루틴별 데이터가 없으므로 logs를 직접 활용
function getPastRoutineRates(
  routine: DailyRoutine,
  logs: RoutineLog[],
  pastReviews: WeeklyReview[]
): number[] {
  return pastReviews.slice(0, 2).map(review => {
    // review 주의 날짜 범위를 ISO week으로 재구성
    const jan4 = new Date(review.year, 0, 4);
    const weekStart = new Date(jan4);
    weekStart.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7) + (review.weekNumber - 1) * 7);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    return calcCompletionRate([routine], logs, weekStart, weekEnd);
  });
}

export function getRoutineRecommendations(
  routines: DailyRoutine[],
  logs: RoutineLog[],
  pastReviews: WeeklyReview[]
): RoutineRecommendation[] {
  const { start, end } = getCurrentWeekRange();

  return routines.filter(r => r.isActive).map(routine => {
    const thisWeekRate = calcCompletionRate([routine], logs, start, end);
    const recentRates = getPastRoutineRates(routine, logs, pastReviews);

    const consecutiveLow = recentRates.length >= 2 &&
      recentRates.every(r => r < 50) && thisWeekRate < 50;
    const consecutiveHigh = recentRates.length >= 2 &&
      recentRates.every(r => r === 100) && thisWeekRate === 100;

    if (consecutiveLow) {
      return {
        routineId: routine.id,
        type: 'take_break',
        message: '3주 연속 달성률이 낮아요. 잠시 쉬거나 목표를 낮춰보세요.',
      };
    }
    if (thisWeekRate < 50) {
      return {
        routineId: routine.id,
        type: 'change_time',
        message: '이번 주 달성률이 50% 미만이에요. 시간대를 바꿔보는 건 어떨까요?',
      };
    }
    if (thisWeekRate < 70) {
      return {
        routineId: routine.id,
        type: 'reduce_frequency',
        message: '빈도를 줄여서 꾸준히 해보세요.',
      };
    }
    if (consecutiveHigh) {
      return {
        routineId: routine.id,
        type: 'increase_challenge',
        message: '3주 연속 완벽해요! 난이도를 높여볼까요?',
      };
    }
    return {
      routineId: routine.id,
      type: 'keep_going',
      message: '잘 하고 있어요. 이대로 유지해요.',
    };
  });
}
