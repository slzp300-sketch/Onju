import { describe, test, expect } from 'vitest';
import * as m from './mappers';
import type { Habit, DailyRoutine, MonthlyGoal, Todo } from '../types';

// toRow는 user_id를 일부러 빼고(insert 시 DB 기본값 auth.uid()가 채움),
// fromRow는 row.user_id를 읽는다. 실제 동작을 흉내내어 user_id를 보정한 뒤 모델과 비교한다.
// (로그류는 false→undefined 비대칭이 의도된 동작이라 round-trip 대상에서 제외)

describe('mappers round-trip (toRow → fromRow)', () => {
  test('Habit — 선택 필드 포함', () => {
    const h: Habit = {
      id: 'h1',
      userId: 'u1',
      title: '운동',
      emoji: '💪',
      frequency: 'custom',
      customDays: [1, 3, 5],
      when: '아침 기상 후',
      goalId: 'g1',
      durationSeconds: 600,
      miniRoutine: '10분 스트레칭',
      twoMinuteHabit: '운동복 갈아입기',
      notification: { enabled: true, type: 'push', times: ['07:00', '19:00'] },
      createdAt: '2026-01-01T00:00:00Z',
    };
    expect(m.habitFromRow({ ...m.habitToRow(h), user_id: h.userId })).toEqual(h);
  });

  test('Habit — 선택 필드 생략', () => {
    const h: Habit = {
      id: 'h2',
      userId: 'u1',
      title: '독서',
      emoji: '📖',
      frequency: 'daily',
      when: '밤',
      createdAt: '2026-01-02T00:00:00Z',
    };
    expect(m.habitFromRow({ ...m.habitToRow(h), user_id: h.userId })).toEqual(h);
  });

  test('DailyRoutine — order 리네임 + 배열 frequency + 선택 필드', () => {
    const r: DailyRoutine = {
      id: 'r1',
      userId: 'u1',
      title: '기도',
      emoji: '🙏',
      type: 'faith',
      frequency: [1, 2, 3, 4, 5],
      isActive: true,
      order: 2,
      createdAt: '2026-01-01T00:00:00Z',
      timeSlot: 'morning',
      when: '기상 후',
      notification: { enabled: true, type: 'sound', times: ['06:30'] },
    };
    expect(m.routineFromRow({ ...m.routineToRow(r), user_id: r.userId })).toEqual(r);
  });

  test('MonthlyGoal — goalRoutines + 선택 필드', () => {
    const g: MonthlyGoal = {
      id: 'mg1',
      userId: 'u1',
      title: '건강 회복',
      description: '꾸준한 운동',
      month: 6,
      year: 2026,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      status: 'active',
      createdAt: '2026-06-01T00:00:00Z',
      toBeStatement: '나는 건강을 돌보는 사람이야',
      goalRoutines: [{ id: 'gr1', title: '러닝 30분', when: '아침' }],
      color: '#2f9e60',
      category: 'personal',
    };
    expect(m.monthlyGoalFromRow({ ...m.monthlyGoalToRow(g), user_id: g.userId })).toEqual(g);
  });

  test('Todo', () => {
    const t: Todo = {
      id: 't1',
      userId: 'u1',
      title: '장보기',
      emoji: '🛒',
      date: '2026-06-15',
      completed: false,
      createdAt: '2026-06-14T00:00:00Z',
    };
    expect(m.todoFromRow({ ...m.todoToRow(t), user_id: t.userId })).toEqual(t);
  });
});
