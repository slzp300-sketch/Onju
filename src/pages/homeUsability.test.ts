import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('../hooks/useReviews', () => ({ useReviews: () => ({ data: [] }) }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('../store/authStore', async () => {
  const { create } = await import('zustand');
  return { useAuthStore: create(() => ({ user: { id: 'preview-user', name: '체험', email: 'preview@example.invalid' } })) };
});
import Dashboard from './Dashboard';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { useTodoStore } from '../store/todoStore';
import { useGoalStore } from '../store/goalStore';

let root: Root, host: HTMLDivElement;
const day = '2026-10-27';
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 27, 12));
  useHabitStore.setState({ habits: [], habitLogs: [], personalRoutines: [] });
  useRoutineStore.setState({ faithRoutines: [], logs: [] });
  useGoalStore.setState({ monthlyGoals: [] });
  useTodoStore.setState({ todos: [{ id: 'todo', userId: '', title: '확인할 일', date: day, completed: false, createdAt: '' }] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
async function press(button: HTMLButtonElement) { await act(async () => button.click()); await act(async () => vi.advanceTimersByTime(500)); }

test('홈의 성장 정보는 접혀 있고 편집 후 돌아와도 선택한 할 일 탭을 유지한다', async () => {
  function Edit() { const navigate = useNavigate(); return h('button', { onClick: () => navigate(-1) }, '돌아가기'); }
  await act(async () => root.render(h(MemoryRouter, null, h(Routes, null, h(Route, { path: '/', element: h(Dashboard) }), h(Route, { path: '/todos/edit/:id', element: h(Edit) })))));
  expect(host.querySelector('#home-growth-detail')).toBeNull();
  await press([...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(b => b.textContent?.includes('할 일'))!);
  await press(host.querySelector('[aria-label="확인할 일 수정"]')!);
  await press(host.querySelector('button')!);
  expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('할 일');
  expect(host.querySelector('[aria-label="확인할 일 수정"]')).not.toBeNull();
});

test('앱을 열린 채 자정을 넘기면 오늘의 날짜와 할 일 집계가 갱신된다', async () => {
  vi.setSystemTime(new Date(2026, 9, 27, 23, 59, 50));
  await act(async () => root.render(h(MemoryRouter, null, h(Dashboard))));
  expect(host.querySelector('[aria-label="10월 27일 선택됨"]')).not.toBeNull();
  await act(async () => vi.advanceTimersByTime(30_000));
  expect(host.querySelector('[aria-label="10월 28일 선택됨"]')).not.toBeNull();
  expect([...host.querySelectorAll('[role="tab"]')].find(t => t.textContent?.includes('할 일'))?.textContent).toContain('0/0');
});
