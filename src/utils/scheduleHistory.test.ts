import { afterEach, expect, test, vi } from 'vitest';
import type { Habit, DailyRoutine } from '../types';
import { withHistory, withoutGoalSince, isItemDue, itemOnDate } from './scheduleHistory';
import { getDayCompletion } from './dayCompletion';
import { getLinkedItems } from './goalProgress';
import { habitFromRow, habitToRow, routineFromRow, routineToRow } from '../data/mappers';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { getHabitStat } from './habitStats';
vi.mock('../data/repos', () => ({ upsertHabit: vi.fn(), upsertHabitLog: vi.fn(), upsertRoutine: vi.fn(), upsertRoutineLog: vi.fn() }));
const habit: Habit = { id:'h',userId:'',title:'독서',emoji:'📚',when:'',frequency:'daily',createdAt:'2026-10-01',goalId:'g' };
afterEach(() => vi.useRealTimers());

test('삭제 재시도 후 시간대가 달라도 원래 요청 시간대로 생성일 이력을 보존한다', () => {
  const item = { ...habit, createdAt: '2026-10-01T00:30:00+09:00' };
  const seoul = withoutGoalSince(item, 'g', '2026-10-20', 'Asia/Seoul');
  const la = withoutGoalSince(item, 'g', '2026-10-20', 'America/Los_Angeles');
  expect(seoul.scheduleHistory?.[0]).toMatchObject({ from: '2026-10-01', goalId: 'g' });
  expect(la.scheduleHistory?.[0]).toMatchObject({ from: '2026-09-30', goalId: 'g' });
  expect(itemOnDate(la, '2026-10-19').goalId).toBe('g');
  expect(itemOnDate(la, '2026-10-20').goalId).toBeUndefined();
});

test('요일·이름·목표 수정은 이전 날짜의 예정과 기록을 바꾸지 않는다', () => {
  const edited = withHistory(habit,{frequency:'weekends',title:'새 습관',goalId:'g2'},'2026-10-27');
  expect(itemOnDate(edited,'2026-10-26').title).toBe('독서');
  expect(isItemDue(edited,'2026-10-26')).toBe(true);
  expect(isItemDue(edited,'2026-10-27')).toBe(false);
  const logs = [{habitId:'h',date:'2026-10-26',completed:true}];
  expect(getDayCompletion('2026-10-26',[edited],logs,[],[]).combinedRate).toBe(100);
  const goal = { id:'g',startDate:'2026-10-26',endDate:'2026-10-27' } as Parameters<typeof getLinkedItems>[0];
  expect(getLinkedItems(goal,[edited],logs,[],[],'2026-10-27')[0]).toMatchObject({doneCount:1,scheduledTotal:1,rate:100});
  expect(habitFromRow(habitToRow(edited)).scheduleHistory).toEqual(edited.scheduleHistory);
});

test('보관·복원은 보관 기간을 실패로 만들지 않고 로그·메모를 보존한다', () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T12:00:00'));
  const log = {habitId:'h',date:'2026-10-26',completed:true};
  useHabitStore.setState({habits:[habit],habitLogs:[log]}); useHabitStore.getState().removeHabit('h');
  const archived = useHabitStore.getState().habits[0];
  expect(isItemDue(archived,'2026-10-26')).toBe(true); expect(isItemDue(archived,'2026-10-27')).toBe(false);
  vi.setSystemTime(new Date('2026-10-29T12:00:00')); useHabitStore.getState().restoreHabit('h');
  const restored = useHabitStore.getState().habits[0];
  expect(isItemDue(restored,'2026-10-28')).toBe(false); expect(isItemDue(restored,'2026-10-29')).toBe(true);
  expect(useHabitStore.getState().habitLogs).toEqual([log]);
  const stat = getHabitStat(restored.frequency,undefined,restored.createdAt,[log],d=>isItemDue(restored,d));
  expect(stat.recent.find(d=>d.date==='2026-10-28')?.status).toBe('off');
  const routine: DailyRoutine = {id:'f',userId:'',title:'기도',type:'faith',frequency:'daily',isActive:true,order:0,createdAt:'2026-10-01'};
  const memo = {id:'l',routineId:'f',userId:'',date:'2026-10-26',completed:true,memo:'기도 내용'};
  useRoutineStore.setState({faithRoutines:[routine],logs:[memo]}); useRoutineStore.getState().removeRoutine('f');
  const archivedFaith = useRoutineStore.getState().faithRoutines[0];
  expect(isItemDue(archivedFaith,'2026-10-26')).toBe(true); expect(useRoutineStore.getState().logs).toEqual([memo]);
  expect(routineFromRow(routineToRow(archivedFaith)).archivedAt).toBe('2026-10-29');
});

test('같은 날 여러 수정은 마지막 설정만 쓰고 이전 버전은 유지한다', () => {
  const first = withHistory(habit,{frequency:'weekends'},'2026-10-27');
  const second = withHistory(first,{frequency:'custom',customDays:[2]},'2026-10-27');
  expect(second.scheduleHistory).toHaveLength(2);
  expect(isItemDue(second,'2026-10-26')).toBe(true); expect(isItemDue(second,'2026-10-27')).toBe(true);
});
