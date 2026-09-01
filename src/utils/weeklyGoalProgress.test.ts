import { describe, it, expect } from 'vitest';
import { countWeeklyGoalDone, weeklyGoalRate, avgWeeklyGoalRate } from './weeklyGoalProgress';
import type { RoutineLog, WeeklyGoal } from '../types';

const baseGoal = (over: Partial<WeeklyGoal>): WeeklyGoal => ({
  id: 'g1', userId: '', title: '아침 달리기', weekNumber: 36, year: 2026,
  startDate: '2026-08-31', endDate: '2026-09-06',
  status: 'active', completionRate: 0,
  targetCount: 3, linkedKind: 'habit', linkedId: 'h1',
  linkedRoutineIds: [], createdAt: '2026-08-31T00:00:00Z',
  ...over,
});

const hLog = (date: string, over: Partial<{ completed: boolean; skipped: boolean; substitute: boolean }> = {}) =>
  ({ habitId: 'h1', date, completed: true, ...over });

const rLog = (date: string, completed = true): RoutineLog =>
  ({ id: date, routineId: 'r1', userId: '', date, completed });

describe('countWeeklyGoalDone', () => {
  it('주간 범위 안의 완료 로그만 센다', () => {
    const logs = [hLog('2026-08-30'), hLog('2026-08-31'), hLog('2026-09-06'), hLog('2026-09-07')];
    expect(countWeeklyGoalDone(baseGoal({}), logs, [])).toBe(2);
  });

  it('같은 날 중복 로그는 1회', () => {
    expect(countWeeklyGoalDone(baseGoal({}), [hLog('2026-09-01'), hLog('2026-09-01')], [])).toBe(1);
  });

  it('substitute(대체 수행)는 인정, 미완료는 제외', () => {
    const logs = [
      hLog('2026-09-01', { completed: false, substitute: true }),
      hLog('2026-09-02', { completed: false }),
    ];
    expect(countWeeklyGoalDone(baseGoal({}), logs, [])).toBe(1);
  });

  it('routine 연동은 routineLogs에서 센다', () => {
    const goal = baseGoal({ linkedKind: 'routine', linkedId: 'r1' });
    expect(countWeeklyGoalDone(goal, [], [rLog('2026-09-01'), rLog('2026-09-02', false)])).toBe(1);
  });

  it('연동이 없으면 0', () => {
    expect(countWeeklyGoalDone(baseGoal({ linkedKind: undefined, linkedId: undefined }), [hLog('2026-09-01')], [])).toBe(0);
  });
});

describe('weeklyGoalRate / avgWeeklyGoalRate', () => {
  it('초과 수행은 100으로 캡', () => {
    expect(weeklyGoalRate(baseGoal({ targetCount: 2 }), 5)).toBe(100);
    expect(weeklyGoalRate(baseGoal({ targetCount: 3 }), 2)).toBe(67);
  });

  it('평균 달성률 — 슬롯 해금 80% 판정에 쓰인다', () => {
    const g1 = baseGoal({ id: 'g1', targetCount: 2 });                          // 2/2 = 100
    const g2 = baseGoal({ id: 'g2', targetCount: 5, linkedId: 'h2' });          // 0/5 = 0
    const logs = [hLog('2026-09-01'), hLog('2026-09-02')];
    expect(avgWeeklyGoalRate([g1, g2], logs, [])).toBe(50);
    expect(avgWeeklyGoalRate([], logs, [])).toBe(0);
  });
});
