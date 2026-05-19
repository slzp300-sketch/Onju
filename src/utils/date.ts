import { format, getISOWeek, getYear, getDay, startOfWeek, endOfWeek, subWeeks, addWeeks } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { WeeklyReview } from '../types';

const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

export const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');
export const formatDisplay = (date: Date) => format(date, 'M월 d일 (E)', { locale: ko });
export const today = () => formatDate(new Date());
export const currentWeek = () => getISOWeek(new Date());
export const currentYear = () => getYear(new Date());

export const thisWeekRange = () => ({
  start: startOfWeek(new Date(), WEEK_OPTIONS),
  end: endOfWeek(new Date(), WEEK_OPTIONS),
});

export const lastWeekRange = () => ({
  start: startOfWeek(subWeeks(new Date(), 1), WEEK_OPTIONS),
  end: endOfWeek(subWeeks(new Date(), 1), WEEK_OPTIONS),
});

// 오늘이 일요일인지 (getDay === 0)
export const isSunday = (date: Date = new Date()): boolean => getDay(date) === 0;

// 이번 주 월~일 범위
export const getCurrentWeekRange = (date: Date = new Date()) => ({
  start: startOfWeek(date, WEEK_OPTIONS),
  end: endOfWeek(date, WEEK_OPTIONS),
});

// 다음 주 첫날 (월요일)
export const getNextWeekMonday = (date: Date = new Date()): Date =>
  addWeeks(startOfWeek(date, WEEK_OPTIONS), 1);

// 루틴 변경 적용 시각 (다음 주 월요일 00:00)
export const getNextWeekApplyTime = (): string =>
  format(getNextWeekMonday(), "yyyy-MM-dd'T'00:00:00");

// "5월 19일(월) ~ 5월 25일(일)" 형태
export const getWeekRangeText = (date: Date = new Date()): string => {
  const { start, end } = getCurrentWeekRange(date);
  return `${format(start, 'M월 d일(EEE)', { locale: ko })} ~ ${format(end, 'M월 d일(EEE)', { locale: ko })}`;
};

// 특정 주 리뷰가 완료됐는지 확인
export const isReviewCompleted = (
  reviews: WeeklyReview[],
  weekNumber: number,
  year: number
): boolean =>
  reviews.some(r => r.weekNumber === weekNumber && r.year === year && r.completedAt !== null);
