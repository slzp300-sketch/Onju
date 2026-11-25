import { expect, test } from 'vitest';
import type { Habit, DailyRoutine } from '../types';
import { isHabitDue, isFaithDue } from './scheduledItems';
import { calcStreak } from './completion';
import { getDayCompletion, getPeriodCompletion } from './dayCompletion';
import { createdLocalDate } from './date';

const habit: Habit = { id: 'h', userId: '', title: '물', emoji: '🌱', when: '', frequency: 'weekdays', createdAt: '2026-10-19' };
const faith: DailyRoutine = { id: 'f', userId: '', title: '기도', type: 'faith', frequency: 'weekends', isActive: true, order: 0, createdAt: '2026-10-19' };
const log = (date: string) => ({ habitId: 'h', date, completed: true });

test('생성 전·예정 아닌 요일·비활성 신앙은 오늘의 예정 수에 들어가지 않는다', () => {
  expect(isHabitDue(habit, '2026-10-18')).toBe(false);
  expect(isHabitDue(habit, '2026-10-24')).toBe(false);
  expect(isHabitDue({ ...habit, frequency: 'custom', customDays: [2] }, '2026-10-27')).toBe(true);
  expect(isFaithDue({ ...faith, isActive: false }, '2026-10-24')).toBe(false);
  expect(getDayCompletion('2026-10-27', [habit], [log('2026-10-27')], [faith], [])).toMatchObject({ state: 'perfect', personalDone: 1, personalTotal: 1, faithTotal: 0 });
});

test('현지 자정 직후 만든 습관을 전날 미완료로 세지 않는다', () => {
  const created = new Date(2026, 9, 27, 0, 5).toISOString();
  expect(createdLocalDate(created)).toBe('2026-10-27');
  expect(isHabitDue({ ...habit, createdAt: created }, '2026-10-26')).toBe(false);
});

test('개인 습관만 있어도 연속 기록을 집계하고 주말은 끊지 않는다', () => {
  expect(calcStreak([], [], '2026-10-27', [habit], ['2026-10-23', '2026-10-26', '2026-10-27'].map(log))).toEqual({ current: 3, best: 3 });
});

test('오늘 아직 기록하지 않았어도 어제까지의 연속 기록을 유지한다', () => {
  expect(calcStreak([], [], '2026-10-27', [habit], ['2026-10-23', '2026-10-26'].map(log))).toEqual({ current: 2, best: 2 });
});

test('연속이 끊긴 뒤에도 이전 최고 기록을 찾는다', () => {
  expect(calcStreak([], [], '2026-10-27', [habit], ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-27'].map(log))).toEqual({ current: 1, best: 3 });
});

test('완료·쉼·대체의 기존 기록 규칙과 개인/신앙 통합 분모를 유지한다', () => {
  expect(getDayCompletion('2026-10-27', [habit, { ...habit, id: 'h2' }], [{ ...log('2026-10-27'), completed: false, substitute: true }], [{ ...faith, frequency: 'daily' }], [{ id: 'l', routineId: 'f', userId: '', date: '2026-10-27', completed: false, skipped: true }])).toMatchObject({ combinedRate: 67, personalDone: 1, faithDone: 1 });
});

test('회고는 현재 습관 로그를 쓰고 미래·생성 전·예정 없는 날을 평균에서 제외한다', () => {
  expect(getPeriodCompletion(new Date(2026, 9, 26), new Date(2026, 10, 1), '2026-10-27', [{ ...habit, createdAt: '2026-10-27' }], [log('2026-10-27')], [faith], [])).toEqual({ personalRate: 100, faithRate: 0, combinedRate: 100 });
});
