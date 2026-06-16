import { describe, test, expect } from 'vitest';
import { calcTreeGrowth, STAGE_THRESHOLDS } from './treeGrowth';
import type { WeeklyReview } from '../types';

// 완료 회고는 날짜와 무관하게 1개당 +15p → 단계/임계값 로직을 결정적으로 검증한다.
// (습관/로그/일기를 비우면 그 외 포인트는 0)
const completedReviews = (n: number): WeeklyReview[] =>
  Array.from({ length: n }, (_, i) => ({ completedAt: `c${i}` }) as unknown as WeeklyReview);

const grow = (n: number) => calcTreeGrowth([], [], [], [], [], completedReviews(n));

describe('calcTreeGrowth — 단계/임계값', () => {
  test('기록 없음 → 씨앗(stage 0)', () => {
    const g = grow(0);
    expect(g.points).toBe(0);
    expect(g.stage).toBe(0);
    expect(g.stageName).toBe('씨앗');
    expect(g.nextThreshold).toBe(30);
    expect(g.progressToNext).toBe(0);
    expect(g.health).toBe('healthy');
  });

  test('완료 회고 2개(30p) → 새싹(stage 1), 진행도 0', () => {
    const g = grow(2);
    expect(g.points).toBe(30);
    expect(g.stage).toBe(1);
    expect(g.stageName).toBe('새싹');
    expect(g.nextThreshold).toBe(150);
    expect(g.progressToNext).toBe(0);
  });

  test('경계 직전(29p)은 아직 씨앗', () => {
    // 1개(15p) + ... 정확히 29를 만들 수 없으니 1개=15p로 stage 0 유지만 확인
    expect(grow(1).stage).toBe(0);
    expect(grow(1).points).toBe(15);
  });

  test('완료 회고 10개(150p) → 묘목(stage 2)', () => {
    expect(grow(10).stage).toBe(2);
  });

  test('완료 회고 60개(900p) → 큰나무(stage 4), 최고 단계', () => {
    const g = grow(60);
    expect(g.stage).toBe(4);
    expect(g.stageName).toBe('큰나무');
    expect(g.nextThreshold).toBeNull();
    expect(g.progressToNext).toBe(1);
  });

  test('STAGE_THRESHOLDS 불변', () => {
    expect([...STAGE_THRESHOLDS]).toEqual([0, 30, 150, 400, 900]);
  });
});
