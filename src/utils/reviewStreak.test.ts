import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { getISOWeek, getYear } from 'date-fns';
import { calcReviewStreak } from './reviewStreak';
import type { WeeklyReview } from '../types';

const review = (year: number, weekNumber: number, completed = true): WeeklyReview =>
  ({
    completedAt: completed ? '2026-01-01T00:00:00Z' : null,
    year,
    weekNumber,
  }) as unknown as WeeklyReview;

describe('calcReviewStreak', () => {
  let W: number;
  let Y: number;

  beforeAll(() => {
    // 연중(연말/연초 경계 회피)으로 고정 → 결정적
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
    const now = new Date();
    W = getISOWeek(now);
    Y = getYear(now);
  });

  afterAll(() => vi.useRealTimers());

  test('빈 배열 → 0', () => {
    expect(calcReviewStreak([])).toBe(0);
  });

  test('미완료 리뷰만 → 0', () => {
    expect(calcReviewStreak([review(Y, W, false)])).toBe(0);
  });

  test('이번 주 1개 → 1', () => {
    expect(calcReviewStreak([review(Y, W)])).toBe(1);
  });

  test('연속 3주 → 3', () => {
    expect(calcReviewStreak([review(Y, W), review(Y, W - 1), review(Y, W - 2)])).toBe(3);
  });

  test('중간에 끊기면 거기서 멈춤', () => {
    expect(calcReviewStreak([review(Y, W), review(Y, W - 2)])).toBe(1);
  });

  test('최근 리뷰가 2주 이상 지났으면 0(끊김)', () => {
    expect(calcReviewStreak([review(Y, W - 3)])).toBe(0);
  });
});
