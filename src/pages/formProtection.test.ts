import { useFormProtection } from '../hooks/useFormProtection';
import { act, createElement as h, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('../data/repos', () => ({ upsertHabit: vi.fn(), upsertPersonalRoutine: vi.fn(), upsertRoutine: vi.fn(), upsertMonthlyGoal: vi.fn(), upsertTodo: vi.fn(), upsertDiaryEntry: vi.fn() }));
vi.mock('../store/authStore', async () => {
  const { create } = await import('zustand'); return { useAuthStore: create(() => ({ user: { id: 'A' } })) };
});
const native = vi.hoisted(() => ({ back: null as (() => void) | null, exit: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: { exitApp: native.exit, addListener: (_event: string, callback: () => void) => {
  native.back = callback; return Promise.resolve({ remove: vi.fn() });
} } }));
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { useHabitStore } from '../store/habitStore';
import { useGoalStore } from '../store/goalStore';
import { useRoutineStore } from '../store/routineStore';
import { useTodoStore } from '../store/todoStore';
import { useDiaryStore } from '../store/diaryStore';
import HabitNew from './HabitNew';
import PersonalRoutineNew from './PersonalRoutineNew';
import FaithRoutineNew from './FaithRoutineNew';
import MonthlyGoalNew from './MonthlyGoalNew';
import TodoNew from './TodoNew';
import Diary from './Diary';
import NativeBackHandler from '../components/NativeBackHandler';
import type { User } from '../types';

let host: HTMLDivElement, root: Root, router: ReturnType<typeof createMemoryRouter>;
const cases = [
  ['습관', HabitNew, '/habits/edit/h'], ['개인 루틴', PersonalRoutineNew, '/personal/edit/r'],
  ['신앙 루틴', FaithRoutineNew, '/faith/edit/f'], ['월간 목표', MonthlyGoalNew, '/goals/edit/g'],
  ['할 일', TodoNew, '/todos/new'], ['일기', Diary, '/diary'],
] as const;
async function render(element: ReactNode, path: string) {
  router = createMemoryRouter([{ path: '/', element: h('p', null, '홈') }, { path: '/goals/monthly', element: h('p', null, '목표 목록') }, { path: path.includes('/edit/') ? path.replace(/\/[^/]+$/, '/:id') : path, element }], { initialEntries: ['/',path] });
  await act(async () => root.render(h(RouterProvider, { router })));
}
async function fill(value: string) {
  const field = host.querySelector<HTMLTextAreaElement | HTMLInputElement>('textarea, input[type="text"]')!;
  expect(field).not.toBeNull();
  await act(async () => {
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return field;
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === text || b.getAttribute('aria-label') === text);
  expect(button).toBeDefined(); await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks(); localStorage.clear();
  useAuthStore.setState({ user: { id: 'A' } as User }); useUIStore.setState({ dataHydrated: true });
  useHabitStore.setState({ habits: [{ id: 'h', title: '기존 습관', emoji: '', frequency: 'daily', when: '', userId: '', createdAt: '' }],
    personalRoutines: [{ id: 'r', title: '기존 루틴', emoji: '', habitIds: ['h','h2'], timerEnabled: false, when: '', userId: '', createdAt: '' }] });
  useRoutineStore.setState({ faithRoutines: [{ id: 'f', title: '기존 신앙', type: 'faith', frequency: 'daily', isActive: true, order: 0, userId: '', createdAt: '' }] });
  useGoalStore.setState({ monthlyGoals: [{ id: 'g', title: '기존 목표', toBeStatement: '기존 목표', startDate: '2026-10-01', endDate: '2026-10-31', month: 10, year: 2026, status: 'active', userId: '', createdAt: '' }] });
  useTodoStore.setState({ todos: [] }); useDiaryStore.setState({ entries: [] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); router?.dispose(); host.remove(); });

test.each(cases)('%s는 브라우저 뒤로가기를 확인하고 취소 시 입력을 보존한다', async (_name, Component, path) => {
  await render(h(Component), path); const field = await fill('작성 중인 내용');
  await act(async () => { await router.navigate(-1); });
  expect(host.textContent).toContain('저장하지 않고 이동할까요?');
  await click('취소'); expect(field.value).toBe('작성 중인 내용');
  await act(async () => { await router.navigate('/'); }); await click('이동하기');
  expect(router.state.location.pathname).toBe('/');
});
test('원래 값으로 되돌린 폼은 이탈 확인을 띄우지 않는다', async () => {
  await render(h(HabitNew), '/habits/edit/h'); await fill('변경'); await fill('기존 습관');
  await act(async () => { await router.navigate(-1); }); expect(host.textContent).toBe('홈');
});
test('할 일 저장은 확인 없이 이동하고 연속 클릭은 한 건만 만든다', async () => {
  await render(h(TodoNew), '/todos/new'); await fill('한 번만 저장');
  const button = [...host.querySelectorAll('button')].find(b => b.textContent?.includes('추가하기'))!;
  await act(async () => { button.click(); button.click(); });
  expect(useTodoStore.getState().todos).toHaveLength(1); expect(router.state.location.pathname).toBe('/');
  expect(host.textContent).not.toContain('저장하지 않고');
});
test('새로고침 이탈은 변경이 있을 때만 막는다', async () => {
  await render(h(TodoNew), '/todos/new');
  let event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(false);
  await fill('보호할 내용'); event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
});
test('다른 계정으로 바뀌면 이전 폼 저장을 차단하고 인증 이동을 막지 않는다', async () => {
  await render(h(TodoNew), '/todos/new'); await fill('A 계정 내용');
  await act(async () => useAuthStore.setState({ user: { id: 'B' } as User }));
  await click('추가하기'); expect(useTodoStore.getState().todos).toHaveLength(0);
  await act(async () => { await router.navigate('/'); }); expect(router.state.location.pathname).toBe('/');
});
test.each(cases.slice(0,4))('%s 수정 데이터 복원 전에는 폼을 열지 않고 없는 항목은 생성을 막는다', async (_name, Component, path) => {
  useUIStore.setState({ dataHydrated: false }); await render(h(Component), path.replace(/\/[^/]+$/, '/missing'));
  expect(host.querySelector('input')).toBeNull();
  await act(async () => useUIStore.setState({ dataHydrated: true }));
  expect(host.textContent).toContain('수정할 항목을 찾지 못했어요'); expect(host.querySelector('input')).toBeNull();
});
test('Android 뒤로가기도 확인창을 열고 확인창에서 한 번 더 누르면 취소한다', async () => {
  await render(h('div', null, h(NativeBackHandler), h(TodoNew)), '/todos/new'); await fill('Android 입력 보호');
  await act(async () => native.back?.()); expect(host.textContent).toContain('저장하지 않고 이동할까요?');
  await act(async () => native.back?.());
  expect(router.state.location.pathname).toBe('/todos/new'); expect(host.querySelector('input')?.value).toBe('Android 입력 보호');
  expect(native.exit).not.toHaveBeenCalled();
});
test('월간 목표 종료일이 시작일보다 빠르면 이유를 표시하고 저장을 막는다', async () => {
  await render(h(MonthlyGoalNew), '/goals/edit/g');
  const input = host.querySelector<HTMLInputElement>('[aria-label="목표 종료일"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'2026-09-01'); input.dispatchEvent(new Event('input',{ bubbles:true })); });
  expect(host.textContent).toContain('종료일을 시작일 이후로');
  expect([...host.querySelectorAll('button')].find(b => b.textContent?.trim()==='수정 완료')?.disabled).toBe(true);
});

function DelayedLeaveForm() {
  const [content,setContent]=useState(''); const navigate=useNavigate(); const protection=useFormProtection({content});
  return h('div',null,h('textarea',{value:content,onChange:(e:React.ChangeEvent<HTMLTextAreaElement>)=>setContent(e.target.value)}),
    h('button',{onClick:()=>protection.requestLeave(()=>{setTimeout(()=>navigate('/'),10);})},'뒤로 가기'),protection.guard);
}
test('뒤로 이동이 다음 이벤트에 처리되어도 이탈 확인을 두 번 요구하지 않는다',async()=>{
  await render(h(DelayedLeaveForm),'/delayed'); await fill('초안'); await click('뒤로 가기'); await click('이동하기');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,30));});
  expect(router.state.location.pathname).toBe('/'); expect(host.textContent).not.toContain('저장하지 않고');
});
