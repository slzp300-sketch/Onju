import { format, getISOWeek, getYear, getDay, startOfWeek, endOfWeek, subWeeks, addWeeks, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { WeeklyReview } from '../types';

const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

// 요일 레이블 (0=일 ~ 6=토)
export const ALL_DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

// weekStartDay 기반 date-fns 옵션
export function weekOpts(weekStartDay: 0 | 1 = 1) {
  return { weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6 };
}

// 특정 주의 7일 반환 (weekStartDay 기준)
export function getWeekDays(date: Date = new Date(), weekStartDay: 0 | 1 = 1): Date[] {
  const start = startOfWeek(date, weekOpts(weekStartDay));
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// weekStartDay: 0=일, 1=월, ... 6=토
export function getWeekRangeFor(date: Date, weekStartDay: number): { start: Date; end: Date } {
  const opts = { weekStartsOn: weekStartDay as 0 | 1 | 2 | 3 | 4 | 5 | 6 };
  return {
    start: startOfWeek(date, opts),
    end: endOfWeek(date, opts),
  };
}

export function formatDateRange(startDate: string, endDate: string): string {
  const s = new Date(startDate);
  const e = new Date(endDate);
  return `${format(s, 'M/d')} ~ ${format(e, 'M/d')}`;
}

export function elapsedDays(startDate: string, endDate: string): { elapsed: number; total: number } {
  const today = new Date();
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalMs = end.getTime() - start.getTime();
  const elapsedMs = Math.min(today.getTime() - start.getTime(), totalMs);
  const total = Math.round(totalMs / 86400000) + 1;
  const elapsed = Math.max(0, Math.round(elapsedMs / 86400000) + 1);
  return { elapsed: Math.min(elapsed, total), total };
}

export const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');
export const formatDisplay = (date: Date) => format(date, 'M월 d일 (E)', { locale: ko });
export const today = () => formatDate(new Date());

// 어제 날짜 (YYYY-MM-DD)
export const yesterday = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
};

/**
 * 지금이 "전날 체크 유예 구간"인지.
 * graceEndHour=6 이면 자정~새벽 6시 사이엔 어제 기록을 마저 체크할 수 있음.
 * graceEndHour=0(자정)이면 유예 없음.
 */
export const isWithinGrace = (graceEndHour: number): boolean =>
  graceEndHour > 0 && new Date().getHours() < graceEndHour;

/**
 * 해당 날짜를 지금 수정(체크)할 수 있는지.
 * - 오늘이면 항상 가능
 * - 어제이면 유예 구간(graceEndHour 이전) 동안 가능
 * - 그 외(더 과거)는 불가 (읽기 전용)
 */
export const isEditableDay = (dateIso: string, graceEndHour: number): boolean => {
  if (dateIso === today()) return true;
  if (isWithinGrace(graceEndHour) && dateIso === yesterday()) return true;
  return false;
};
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
export const getWeekRangeText = (date: Date = new Date(), weekStartDay: 0 | 1 = 1): string => {
  const opts = weekOpts(weekStartDay);
  const start = startOfWeek(date, opts);
  const end = endOfWeek(date, opts);
  return `${format(start, 'M월 d일(EEE)', { locale: ko })} ~ ${format(end, 'M월 d일(EEE)', { locale: ko })}`;
};

// 특정 주 리뷰가 완료됐는지 확인
export const isReviewCompleted = (
  reviews: WeeklyReview[],
  weekNumber: number,
  year: number
): boolean =>
  reviews.some(r => r.weekNumber === weekNumber && r.year === year && r.completedAt !== null);
