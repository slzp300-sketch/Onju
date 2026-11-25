import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const remote = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock('../lib/sync/outbox', () => ({ enqueue: remote.enqueue, pendingRecordIds: () => [], pendingPlanIds: () => [], pendingGoalDeletionIds: () => [] }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../store/authStore', async () => { const { create } = await import('zustand'); return { useAuthStore: create(() => ({ user: { id: 'A' } })) }; });
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { ruleAt } from '../utils/scheduleHistory';
import { getLinkedItems } from '../utils/goalProgress';
import GoalConnect from './GoalConnect';
import Goals from './Goals';
import HabitNew from './HabitNew';
import FaithRoutineNew from './FaithRoutineNew';
import type { MonthlyGoal, Habit, DailyRoutine, WeeklyGoal, User } from '../types';
const goal: MonthlyGoal = { id: 'g', revision: 'r0', userId: '', title: '건강한 나', category: 'personal', month: 10, year: 2026, startDate: '2026-10-01', endDate: '2026-11-01', status: 'active', createdAt: '2026-10-01' };
const habit: Habit = { id: 'h', userId: '', title: '산책', frequency: 'daily', emoji: '', when: '점심', goalId: 'g', createdAt: '2026-10-01' };
const routine: DailyRoutine = { id: 'r', userId: '', title: '기도', type: 'faith', isActive: true, order: 0, frequency: 'daily', goalId: 'g', createdAt: '2026-10-01' };

test('목표 삭제 요청을 보관하지 못하면 목표·연결·로그를 유지하고 확인창을 닫지 않는다',async()=>{
  const before=useHabitStore.getState();await mount('/goals');
  await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('건강한 나'))!.click());
  await click('삭제');remote.enqueue.mockImplementationOnce(()=>{throw new Error('quota or conflict');});await click('목표만 삭제');
  expect(useGoalStore.getState().monthlyGoals.some(g=>g.id==='g')).toBe(true);expect(useHabitStore.getState()).toBe(before);expect(host.querySelector('[role="dialog"]')).not.toBeNull();
});
let root: Root, host: HTMLDivElement, router: ReturnType<typeof createMemoryRouter>;
async function mount(path: string) {
  router = createMemoryRouter([{ path: '/goals/:id/connect', element: h(GoalConnect) }, { path: '/goals', element: h(Goals) }, { path: '/habits/edit/:id', element: h(HabitNew) }, { path: '/faith-routines/edit/:id', element: h(FaithRoutineNew) }, { path: '/', element: h('p', null, '홈') }], { initialEntries: [path] });
  await act(async () => root.render(h(RouterProvider, { router })));
}
async function click(label: string) {
  const b = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === label || b.getAttribute('aria-label') === label);
  expect(b, label).toBeDefined(); await act(async () => b!.click());
}
async function choose(id: string) { await act(async () => { const el = host.querySelector('select')!; el.value = id; el.dispatchEvent(new Event('change', { bubbles: true })); }); }
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-27T12:00:00')); vi.clearAllMocks(); localStorage.clear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); useAuthStore.setState({ user: { id: 'A' } as User }); useUIStore.setState({ dataHydrated: true });
  useGoalStore.setState({ monthlyGoals: [goal, { ...goal, id: 'next', title: '활기찬 나' }, { ...goal, id: 'faith', category: 'faith' }, { ...goal, id: 'past', endDate: '2026-10-26' }], weeklyGoals: [] });
  useHabitStore.setState({ habits: [habit], habitLogs: [{ habitId: 'h', date: '2026-10-26', completed: true }], personalRoutines: [] });
  useRoutineStore.setState({ faithRoutines: [], personalRoutines: [], logs: [] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); router?.dispose(); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

test('해제는 확인 후 오늘부터 적용하고 과거 진척·수행 로그·습관을 보존한다', async () => {
  const logs = useHabitStore.getState().habitLogs;
  await mount('/goals/g/connect'); await click('산책 연결 해제'); await click('취소'); expect(useHabitStore.getState().habits[0].goalId).toBe('g');
  await click('산책 연결 해제'); expect(host.textContent).toContain('2026-10-27'); await click('연결만 해제');
  const item = useHabitStore.getState().habits[0]; expect(item.id).toBe('h'); expect(item.goalId).toBeUndefined(); expect(item.archivedAt).toBeUndefined();
  expect(ruleAt(item, '2026-10-26')?.goalId).toBe('g'); expect(ruleAt(item, '2026-10-27')?.goalId).toBeUndefined(); expect(useHabitStore.getState().habitLogs).toBe(logs);
  expect(getLinkedItems(goal, [item], logs, [], [], '2026-10-27')[0]).toMatchObject({ doneCount: 1, currentlyLinked: false, scheduledTotal: 26 });
});

test.each(['personal', 'faith'] as const)('%s 이동은 같은 분류의 유효 목표만 선택하고 항목 ID·기록·이전 연결을 보존한다', async category => {
  useGoalStore.setState({ monthlyGoals: useGoalStore.getState().monthlyGoals.map(g => g.id === 'g' || g.id === 'next' ? { ...g, category } : g) });
  if (category === 'faith') useRoutineStore.setState({ faithRoutines: [routine] });
  await mount('/goals/g/connect'); await click(`${category === 'faith' ? '기도' : '산책'} 다른 목표로 이동`);
  const options = [...host.querySelectorAll('option')].map(o => o.value); expect(options).not.toContain('g'); expect(options).not.toContain('past'); if (category === 'personal') expect(options).not.toContain('faith');
  await choose('next'); await click('이 목표로 이동');
  const item = category === 'faith' ? useRoutineStore.getState().faithRoutines[0] : useHabitStore.getState().habits[0];
  expect(item.goalId).toBe('next'); expect(ruleAt(item, '2026-10-26')?.goalId).toBe('g'); expect(ruleAt(item, '2026-10-27')?.goalId).toBe('next');
  expect(category === 'faith' ? useRoutineStore.getState().faithRoutines : useHabitStore.getState().habits).toHaveLength(1);
});

test('지난 목표·보관 중 습관도 연결을 정리하되 다시 활성화하지 않는다', async () => {
  useHabitStore.setState({ habits: [{ ...habit, goalId: 'past', archivedAt: '2026-10-25' }] }); await mount('/goals/past/connect');
  expect(host.textContent).toContain('보관 중'); await click('산책 연결 해제'); await click('연결만 해제');
  expect(useHabitStore.getState().habits[0]).toMatchObject({ archivedAt: '2026-10-25' }); expect(useHabitStore.getState().habits[0].goalId).toBeUndefined();
});

test('확인 중 원래 연결·이동 대상이 바뀌면 오래된 선택으로 덮어쓰지 않는다', async () => {
  await mount('/goals/g/connect'); await click('산책 다른 목표로 이동'); await choose('next');
  await act(async () => useGoalStore.setState({ monthlyGoals: useGoalStore.getState().monthlyGoals.filter(g => g.id !== 'next') }));
  expect([...host.querySelectorAll('button')].find(b => b.textContent === '이 목표로 이동')?.disabled).toBe(true);
  await act(async () => useHabitStore.getState().updateHabit('h', { goalId: undefined })); expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(useHabitStore.getState().habits[0].goalId).toBeUndefined();
});

test('목표 삭제는 하나의 큐 요청으로 모든 현재·보관·구버전 연결을 정리하고 로그·주간 목표·다른 목표를 남긴다', async () => {
  useHabitStore.setState({ habits: [habit, { ...habit, id: 'archived', archivedAt: '2026-10-25' }, { ...habit, id: 'other', goalId: 'next' }] });
  useRoutineStore.setState({ faithRoutines: [routine], personalRoutines: [{ ...routine, id: 'legacy', type: 'personal', monthlyGoalId: 'g', goalId: 'next' }], logs: [{ id: 'rl', routineId: 'r', userId: '', date: '2026-10-26', completed: true, memo: '남길 메모' }] });
  useGoalStore.setState({ weeklyGoals: [{ id: 'w', monthlyGoalId: 'g', completionRate: 80 } as WeeklyGoal] });
  const before = { habits: useHabitStore.getState().habitLogs, routines: useRoutineStore.getState().logs };
  await mount('/goals'); const open = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('건강한 나'))!; await act(async () => open.click()); await click('삭제');
  expect(host.textContent).toContain('현재 연결을 2026-10-27부터 해제'); await click('취소'); expect(useGoalStore.getState().monthlyGoals.some(g => g.id === 'g')).toBe(true);
  await click('삭제'); await click('목표만 삭제');
  expect(remote.enqueue).toHaveBeenCalledTimes(1); expect(remote.enqueue).toHaveBeenCalledWith(expect.objectContaining({ type: 'rpc', fn: 'delete_monthly_goal_checked', args: { gid: 'g', request_id: expect.any(String), expected_revision: 'r0', effective_date: '2026-10-27', p_timezone: expect.any(String) } }), { requireDurable: true });
  expect(useGoalStore.getState().monthlyGoals.some(g=>g.id==='g')).toBe(true);expect(useHabitStore.getState().habits[0].goalId).toBe('g');
  await act(async()=>window.dispatchEvent(new CustomEvent('onju-goal-deleted',{detail:{ownerId:'A',goalId:'g',revision:'r0',effectiveDate:'2026-10-27'}})));
  expect(useHabitStore.getState().habits.map(h => h.goalId)).toEqual([undefined, undefined, 'next']); expect(useHabitStore.getState().habits[1].archivedAt).toBe('2026-10-25');
  expect(useRoutineStore.getState().faithRoutines[0].goalId).toBeUndefined(); expect(useRoutineStore.getState().personalRoutines[0]).toMatchObject({ goalId: 'next' }); expect(useRoutineStore.getState().personalRoutines[0].monthlyGoalId).toBeUndefined();
  expect(useGoalStore.getState().weeklyGoals[0]).toMatchObject({ id: 'w', completionRate: 80 }); expect(useGoalStore.getState().weeklyGoals[0].monthlyGoalId).toBeUndefined();
  expect(useHabitStore.getState().habitLogs).toBe(before.habits); expect(useRoutineStore.getState().logs).toBe(before.routines);
  expect(ruleAt(useHabitStore.getState().habits[0], '2026-10-26')?.goalId).toBe('g');
});

test.each(['personal', 'faith'] as const)('%s 오래 열린 수정 화면은 삭제된 목표를 다시 붙이지 않고 연동 안 함으로 저장할 수 있다', async category => {
  if (category === 'faith') { useGoalStore.setState({ monthlyGoals: [{ ...goal, category }] }); useRoutineStore.setState({ faithRoutines: [routine] }); }
  await mount(category === 'faith' ? '/faith-routines/edit/r' : '/habits/edit/h');
  await act(async () => { useGoalStore.getState().removeMonthlyGoal('g'); window.dispatchEvent(new CustomEvent('onju-goal-deleted',{detail:{ownerId:'A',goalId:'g',revision:'r0',effectiveDate:'2026-10-27'}})); }); remote.enqueue.mockClear();
  await click('수정 완료'); expect(remote.enqueue).not.toHaveBeenCalled(); expect(host.textContent).toContain('삭제된 목표');
  await click('연동 안 함'); await click('수정 완료'); expect(remote.enqueue).toHaveBeenCalledTimes(1);
  expect(remote.enqueue.mock.calls[0][0].args.item_values.goal_id).toBeNull();
});

test('삭제 확인 중 목표·연결이 바뀌면 다시 확인하며 최신 목표를 몰래 삭제하지 않는다',async()=>{
  await mount('/goals');await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('건강한 나'))!.click());await click('삭제');
  await act(async()=>useGoalStore.setState(s=>({monthlyGoals:s.monthlyGoals.map(g=>g.id==='g'?{...g,title:'새 이름',revision:'new'}:g)})));
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='목표만 삭제')?.disabled).toBe(true);expect(remote.enqueue).not.toHaveBeenCalled();
});
test('늦은 삭제 확인은 이후 일정·보관 상태·다른 목표 연결과 로그를 보존한다',async()=>{
  const changed={...habit,title:'저녁 산책',archivedAt:'2026-10-26',scheduleHistory:[{from:'2026-10-01',title:'산책',frequency:'daily' as const,active:true,goalId:'g'},{from:'2026-10-26',title:'저녁 산책',frequency:'weekdays' as const,active:false,goalId:'g'}]};
  useHabitStore.setState({habits:[changed,{...habit,id:'moved',goalId:'next'}]});const logs=useHabitStore.getState().habitLogs;
  window.dispatchEvent(new CustomEvent('onju-goal-deleted',{detail:{ownerId:'B',goalId:'g',revision:'r0',effectiveDate:'2026-10-20'}}));expect(useHabitStore.getState().habits[0]).toBe(changed);
  window.dispatchEvent(new CustomEvent('onju-goal-deleted',{detail:{ownerId:'A',goalId:'g',revision:'old',effectiveDate:'2026-10-20'}}));expect(useHabitStore.getState().habits[0]).toBe(changed);
  window.dispatchEvent(new CustomEvent('onju-goal-deleted',{detail:{ownerId:'A',goalId:'g',revision:'r0',effectiveDate:'2026-10-20'}}));
  const after=useHabitStore.getState().habits[0];expect(ruleAt(after,'2026-10-19')?.goalId).toBe('g');expect(ruleAt(after,'2026-10-26')).toMatchObject({title:'저녁 산책',frequency:'weekdays',active:false});
  expect(after.archivedAt).toBe('2026-10-26');expect(after.scheduleHistory).toHaveLength(3);expect(useHabitStore.getState().habits[1].goalId).toBe('next');expect(useHabitStore.getState().habitLogs).toBe(logs);
});
