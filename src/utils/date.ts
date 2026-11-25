import { format, getISOWeek, getISOWeekYear, getDay, startOfWeek, endOfWeek, subWeeks, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { WeeklyReview } from '../types';
import { calendarDayNumber } from './goalRules';

const WEEK_OPTIONS = { weekStartsOn: 1 } as const;

/** 서버의 UTC 생성 시각을 사용자가 기록하는 현지 날짜로 맞춘다. */
export function createdLocalDate(createdAt: string, timeZone?: string): string {
  if (!createdAt || /^\d{4}-\d{2}-\d{2}$/.test(createdAt)) return createdAt;
  const value = new Date(createdAt);
  if (Number.isNaN(value.getTime())) return '';
  return timeZone ? new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value) : format(value, 'yyyy-MM-dd');
}

// 요일 레이블 (0=일 ~ 6=토)
export const ALL_DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

// weekStartDay 기반 date-fns 옵션
function weekOpts(weekStartDay: 0 | 1 = 1) {
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

export function elapsedDays(startDate: string, endDate: string): { elapsed: number; total: number } {
  const start = calendarDayNumber(startDate), end = calendarDayNumber(endDate);
  const total = end - start + 1;
  if (!Number.isFinite(total) || total <= 0) return { elapsed: 0, total: 0 };
  return { elapsed: Math.max(0, Math.min(calendarDayNumber(format(new Date(), 'yyyy-MM-dd')) - start + 1, total)), total };
}

const formatDate = (date: Date) => format(date, 'yyyy-MM-dd');
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
export const currentYear = () => getISOWeekYear(new Date());

// 오늘이 일요일인지 (getDay === 0)
export const isSunday = (date: Date = new Date()): boolean => getDay(date) === 0;

// 이번 주 월~일 범위
export const getCurrentWeekRange = (date: Date = new Date()) => ({
  start: startOfWeek(date, WEEK_OPTIONS),
  end: endOfWeek(date, WEEK_OPTIONS),
});

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

// 주간 리뷰 노출/대상 정보
export interface ReviewPrompt {
  show: boolean;          // 홈에 노출할지
  completed: boolean;     // 대상 주 리뷰 완료 여부
  overdue: boolean;       // 지난주 리뷰를 유예 기간에 처리 중인지
  weekNumber: number;     // 리뷰 대상 주
  year: number;
  weekStart: string;      // YYYY-MM-DD
  weekEnd: string;        // YYYY-MM-DD
  weekRangeText: string;
}

/**
 * 한 주를 닫는 "리뷰 윈도우" 계산.
 * - 일요일: 이번 주를 대상으로 항상 노출 (완료/미완료 모두)
 * - 월요일: 지난주 리뷰가 미완료일 때만 노출 (유예 구간, overdue)
 * - 그 외 요일: 노출하지 않음 (윈도우 종료)
 */
export const getReviewPrompt = (
  reviews: WeeklyReview[],
  date: Date = new Date(),
): ReviewPrompt => {
  const day = getDay(date); // 0=일, 1=월
  const isGrace = day === 1;                       // 월요일 유예
  const targetDate = isGrace ? subWeeks(date, 1) : date;

  const weekNumber = getISOWeek(targetDate);
  const year = getISOWeekYear(targetDate);
  const { start, end } = getCurrentWeekRange(targetDate);
  const completed = isReviewCompleted(reviews, weekNumber, year);

  const show = day === 0 || (isGrace && !completed);

  return {
    show,
    completed,
    overdue: isGrace && !completed,
    weekNumber,
    year,
    weekStart: formatDate(start),
    weekEnd: formatDate(end),
    weekRangeText: getWeekRangeText(targetDate),
  };
};
