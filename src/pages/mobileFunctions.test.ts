import { act, createElement as h, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
vi.mock('../data/repos', () => ({ upsertHabitLog: vi.fn(), upsertTodo: vi.fn(), deleteTodo: vi.fn(), upsertDiaryEntry: vi.fn(), deleteDiaryEntry: vi.fn() }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
import { useHabitStore } from '../store/habitStore';
import { useTodoStore } from '../store/todoStore';
import { useUIStore } from '../store/uiStore';
import { today } from '../utils/date';
import { upsertHabitLog, deleteTodo, deleteDiaryEntry } from '../data/repos';
import RoutineTimer from './RoutineTimer';
import TodoNew from './TodoNew';
import TodoTab from '../components/tabs/TodoTab';
import PersonalTab from '../components/tabs/PersonalTab';
import FaithTab from '../components/tabs/FaithTab';
import { useRoutineStore } from '../store/routineStore';
import { useDiaryStore } from '../store/diaryStore';
import Diary from './Diary';
import type { Habit } from '../types';

let root: Root, host: HTMLDivElement;
const habits: Habit[] = ['물 마시기', '몸 풀기'].map((title, i) => ({ id: `h${i}`, title, userId: '', emoji: '🌱', frequency: 'daily', when: '', createdAt: '' }));
async function render(component: React.ReactNode, path = '/') {
  await act(async () => root.render(h(StrictMode, null, h(MemoryRouter, { initialEntries: [path] }, h(Routes, null,
    h(Route, { path: '/', element: component }), h(Route, { path: '/edit/:id', element: component }), h(Route, { path: '/timer/:id', element: component }),
  )))));
}
async function click(label: string) {
  const button = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === label || b.textContent === label);
  expect(button).toBeDefined(); await act(async () => button!.click());
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.clearAllMocks();
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T01:00:00Z'));
  useHabitStore.setState({ habits, habitLogs: [], personalRoutines: [{ id: 'r', title: '아침 준비', userId: '', emoji: '🌱', when: '', habitIds: ['h0', 'h1'], habitDurations: { h0: 10, h1: 10 }, timerEnabled: true, createdAt: '' }] });
  useTodoStore.setState({ todos: [{ id: 't', title: '문서 확인', date: today(), userId: '', completed: false, createdAt: '' }] });
  useUIStore.setState({ dataHydrated: true });
  useDiaryStore.setState({ entries: [] });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });

test('루틴을 재실행해도 기존 완료를 취소하지 않고 건너뛴 습관을 구분한다', async () => {
  useHabitStore.setState({ habitLogs: [{ habitId: 'h0', date: today(), completed: true }] });
  await render(h(RoutineTimer), '/timer/r');
  await act(async () => vi.advanceTimersByTime(10_000));
  expect(useHabitStore.getState().isHabitCompleted('h0')).toBe(true);
  expect(upsertHabitLog).not.toHaveBeenCalled();
  await click('현재 습관 건너뛰기');
  expect(host.textContent).toContain('건너뜀'); expect(useHabitStore.getState().isHabitCompleted('h1')).toBe(false);
});
test('수동 완료 연속 입력은 한 습관만 완료 처리한다', async () => {
  await render(h(RoutineTimer), '/timer/r');
  const complete = host.querySelector<HTMLButtonElement>('[aria-label="현재 습관 완료"]')!;
  await act(async () => { complete.click(); complete.click(); });
  expect(upsertHabitLog).toHaveBeenCalledTimes(1); expect(useHabitStore.getState().isHabitCompleted('h1')).toBe(false);
});
test('지난 할 일은 편집·완료·삭제 버튼을 제공하지 않는다', async () => {
  await render(h(TodoTab, { date: today(), readOnly: true }));
  expect(host.textContent).toContain('문서 확인'); expect(host.querySelector('button')).toBeNull();
});
test('삭제는 취소할 수 있고 확인한 항목만 요청하며 서버 확인까지 유지한다', async () => {
  await render(h(TodoTab, { date: today(), readOnly: false }));
  await click('문서 확인 더보기'); await click('할 일 삭제'); expect(useTodoStore.getState().todos).toHaveLength(1);
  await click('취소'); expect(useTodoStore.getState().todos).toHaveLength(1);
  await click('문서 확인 더보기'); await click('할 일 삭제'); await click('삭제'); expect(useTodoStore.getState().todos).toHaveLength(1); expect(deleteTodo).toHaveBeenCalledWith(expect.objectContaining({id:'t'}));
});
test('존재하지 않는 할 일의 수정 링크는 새 할 일을 만들지 않는다', async () => {
  await render(h(TodoNew), '/edit/missing');
  expect(host.textContent).toContain('할 일을 찾지 못했어요'); expect(host.querySelector('input')).toBeNull();
});

test('한글 조합 Enter는 저장하지 않고 조합 완료 후 Enter만 한 번 저장한다', async () => {
  const update = vi.spyOn(useTodoStore.getState(), 'updateTodo').mockImplementation(() => {});
  await render(h(TodoNew), '/edit/t');
  const input = host.querySelector<HTMLInputElement>('[aria-label="할 일 이름"]')!;
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true }));
  });
  expect(update).not.toHaveBeenCalled();
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  expect(update).toHaveBeenCalledOnce();
  expect(update.mock.calls[0][1]).toBe('문서 확인');
  update.mockRestore();
});
test('서버 복원 후 수정 화면은 저장된 제목을 보여준다', async () => {
  const todos = useTodoStore.getState().todos;
  useTodoStore.setState({ todos: [] }); useUIStore.setState({ dataHydrated: false });
  await render(h(TodoNew), '/edit/t'); expect(host.querySelector('input')).toBeNull();
  await act(async () => { useTodoStore.setState({ todos }); useUIStore.setState({ dataHydrated: true }); });
  expect(host.querySelector<HTMLInputElement>('[aria-label="할 일 이름"]')?.value).toBe('문서 확인');
});
test('지난 날짜 수정 링크를 직접 열어도 읽기 전용이다', async () => {
  useTodoStore.setState({ todos: useTodoStore.getState().todos.map(t => ({ ...t, date: '2020-01-01' })) });
  await render(h(TodoNew), '/edit/t'); expect(host.textContent).toContain('지난 기록은 읽기 전용이에요');
  expect(host.querySelector('input')).toBeNull();
});
test('지난 날짜 개인 루틴·습관의 수정 버튼은 비활성화한다', async () => {
  await render(h<{ date?: string; readOnly?: boolean }>(PersonalTab, { date: '2020-01-01', readOnly: true }));
  const edit = [...host.querySelectorAll<HTMLButtonElement>('button')].filter(b => b.getAttribute('aria-label')?.includes('수정'));
  expect(edit).toHaveLength(3); expect(edit.every(b => b.disabled)).toBe(true);
  expect(host.querySelector('[aria-label="빠른 메뉴 열기"]')).toBeNull();
});
test('빈 신앙 기록을 지난 날짜로 볼 때 추가 버튼을 보여주지 않는다', async () => {
  useRoutineStore.setState({ faithRoutines: [] });
  await render(h<{ date?: string; readOnly?: boolean }>(FaithTab, { date: '2020-01-01', readOnly: true }));
  expect(host.querySelector('button')).toBeNull();
});

test('남은 항목 보기에서는 완료를 숨기고 다른 요일 습관은 별도 관리에만 둔다', async () => {
  useHabitStore.setState({ habits: [...habits, { ...habits[0], id: 'weekend', title: '주말 산책', frequency: 'weekends' }], habitLogs: [{ habitId: 'h0', date: today(), completed: true }] });
  await render(h<{ date?: string; hideCompleted?: boolean }>(PersonalTab, { date: today(), hideCompleted: true }));
  expect(host.querySelector('[aria-label="물 마시기 습관 수정"]')).toBeNull();
  expect(host.querySelector('[aria-label="몸 풀기 습관 수정"]')).not.toBeNull();
  expect(host.querySelector('details')?.textContent).toContain('주말 산책');
  expect(host.querySelector('details')?.textContent).toContain('예정 없음');
});

test('루틴 타이머는 오늘 예정된 습관만 실행한다', async () => {
  useHabitStore.setState({ habits: [habits[0], { ...habits[1], frequency: 'weekends' }] });
  await render(h(RoutineTimer), '/timer/r');
  await click('현재 습관 완료');
  expect(host.textContent).toContain('루틴을 마쳤어요');
  expect(host.textContent).not.toContain('몸 풀기');
  expect(useHabitStore.getState().isHabitCompleted('h1')).toBe(false);
});

test('남은 할 일이 없으면 완료 기록을 다시 펼칠 수 있다', async () => {
  const onShowCompleted = vi.fn();
  useTodoStore.setState({ todos: useTodoStore.getState().todos.map(t => ({ ...t, completed: true })) });
  await render(h(TodoTab, { date: today(), readOnly: false, hideCompleted: true, onShowCompleted }));
  expect(host.textContent).toContain('할 일을 모두 마쳤어요');
  await click('완료 기록 보기'); expect(onShowCompleted).toHaveBeenCalledTimes(1);
});
test('일기 날짜를 바꾸기 전에 미저장 내용을 확인하고 취소하면 보존한다', async () => {
  await render(h(Diary));
  const textarea = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, '오늘 작성 중인 기록');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('이전 날짜'); expect(document.body.textContent).toContain('저장하지 않고 이동할까요?');
  await click('취소'); expect(textarea.value).toBe('오늘 작성 중인 기록');
  await click('저장하기'); expect(useDiaryStore.getState().getEntry(today())?.content).toBe('오늘 작성 중인 기록');
});
test('일기 삭제를 취소하면 보존하고 확인 후에도 서버 응답까지 유지한다', async () => {
  useDiaryStore.setState({ entries: [{ date: today(), mood: 'good', content: '보존할 일기', updatedAt: '' }] });
  await render(h(Diary)); await click('이 날 일기 삭제');
  expect(useDiaryStore.getState().entries).toHaveLength(1);
  await click('취소'); expect(useDiaryStore.getState().entries).toHaveLength(1);
  await click('이 날 일기 삭제'); await click('삭제'); expect(useDiaryStore.getState().entries).toHaveLength(1); expect(deleteDiaryEntry).toHaveBeenCalledWith(expect.objectContaining({date:today()}));
});
test('일기는 서버 기록 복원 전 빈 입력 폼을 열지 않는다', async () => {
  useUIStore.setState({ dataHydrated: false }); await render(h(Diary)); expect(host.querySelector('textarea')).toBeNull();
  await act(async () => { useDiaryStore.setState({ entries: [{ date: today(), mood: 'good', content: '복원된 일기', updatedAt: '' }] }); useUIStore.setState({ dataHydrated: true }); });
  expect(host.querySelector('textarea')?.value).toBe('복원된 일기');
});
