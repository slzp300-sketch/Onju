import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  flush: vi.fn(async () => {}),
  pending: vi.fn(() => 0),
  todos: vi.fn(async (): Promise<unknown[]> => []),
  settings: vi.fn(),
  habits: vi.fn(async ():Promise<unknown[]> => []),
  habitLogs: vi.fn(async ():Promise<unknown[]> => []),
  recordIds: vi.fn(():string[]=>[]),
  diary: vi.fn(async():Promise<unknown[]>=>[]),
  logs: vi.fn(async():Promise<unknown[]>=>[]),
  planIds: vi.fn(():string[] => []),
  bundles: vi.fn(async ():Promise<unknown[]> => []),
  weekly: vi.fn(async ():Promise<unknown[]> => []),
  practiceIds: vi.fn(():string[] => []),
  goalIds: vi.fn(():string[] => []),
  goals: vi.fn(async ():Promise<unknown[]> => []),
}));
vi.mock('./outbox', () => ({ flush: mocks.flush, pendingCount: mocks.pending, pendingGoalIds: mocks.goalIds, pendingPracticeIds: mocks.practiceIds, pendingRecordIds: mocks.recordIds, pendingPlanIds: mocks.planIds, enqueue: vi.fn() }));
vi.mock('../../store/authStore', () => ({ useAuthStore: { getState: () => ({ user: { id: 'u1' } }) } }));
vi.mock('../../data/repos', () => ({
  listRoutines: async () => [], listRoutineLogs: mocks.logs,
  listHabits: mocks.habits, listHabitLogs: mocks.habitLogs, listPersonalRoutines: mocks.bundles,
  listMonthlyGoals: mocks.goals, listWeeklyGoals: mocks.weekly,
  listTodos: mocks.todos, listDiaryEntries: mocks.diary,
  fetchUserSettings: async () => ({ settings: { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } }), fetchGoalSlots: async () => 3,
  upsertUserSettings: mocks.settings,
}));
vi.mock('../../data/groupRepos', () => ({ listMyGroups: async () => [], listMyCheers: async () => ({}) }));
vi.mock('../../store/toastStore', () => ({ toast: { error: vi.fn() } }));

import { hydrateUserData, resetHydration, flushPendingSettings } from './hydrate';
import { useTodoStore } from '../../store/todoStore';
import { useUIStore } from '../../store/uiStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useGoalStore } from '../../store/goalStore';
import type { Todo, MonthlyGoal } from '../../types';

const todo: Todo = { id: 'local', userId: '', title: '로컬 할 일', date: '2026-10-01', completed: false, createdAt: '2026-10-01T00:00:00Z' };

beforeEach(() => {
  resetHydration();
  vi.clearAllMocks();
  mocks.planIds.mockReturnValue([]); mocks.bundles.mockResolvedValue([]); mocks.weekly.mockResolvedValue([]);
  mocks.flush.mockImplementation(async () => {});
  mocks.pending.mockReturnValue(0);
  mocks.recordIds.mockReturnValue([]);mocks.diary.mockResolvedValue([]);mocks.logs.mockResolvedValue([]);
  mocks.todos.mockImplementation(async () => []);
  mocks.habits.mockResolvedValue([]); mocks.habitLogs.mockResolvedValue([]); mocks.practiceIds.mockReturnValue([]); mocks.goalIds.mockReturnValue([]); mocks.goals.mockResolvedValue([]);
  useTodoStore.setState({ todos: [] });
  useUIStore.setState({ dataHydrated: false });
});
afterEach(() => { resetHydration(); vi.useRealTimers(); });

test('리뷰 단계가 이전 서버 조회 중 저장되면 조회 완료 후 최신 상태를 다시 가져온다',async()=>{
  let finish!:(value:Todo[])=>void;
  mocks.todos.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const loading=hydrateUserData('u1');
  await vi.waitFor(()=>expect(mocks.todos).toHaveBeenCalledOnce());
  mocks.todos.mockResolvedValue([todo]);
  window.dispatchEvent(new Event('onju-review-step-saved'));
  finish([]);await loading;
  await vi.waitFor(()=>expect(useTodoStore.getState().todos).toEqual([todo]));
  expect(mocks.todos).toHaveBeenCalledTimes(2);
});

test('리뷰 저장 후 예약된 새 조회도 계정이 바뀌면 이전 계정을 복원하지 않는다',async()=>{
  let finish!:(value:Todo[])=>void;
  mocks.todos.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const loading=hydrateUserData('u1');
  await vi.waitFor(()=>expect(mocks.todos).toHaveBeenCalledOnce());
  window.dispatchEvent(new Event('onju-review-step-saved'));
  resetHydration();await hydrateUserData('u2');finish([todo]);await loading;
  await new Promise(resolve=>setTimeout(resolve,10));
  expect(useTodoStore.getState().todos).toEqual([]);expect(mocks.todos).toHaveBeenCalledTimes(2);
});

test('목표 충돌 입력만 보호하면서 다른 목표·할 일은 서버에서 복원한다',async()=>{
  const goal:MonthlyGoal={id:'g',userId:'',title:'내 미전송 입력',month:10,year:2026,startDate:'2026-10-01',endDate:'2026-10-31',status:'active',createdAt:'2026-10-01'};
  useGoalStore.setState({monthlyGoals:[goal]});mocks.goalIds.mockReturnValue(['g']);mocks.goals.mockResolvedValue([{...goal,title:'서버 변경'},{...goal,id:'other',title:'다른 목표'}]);mocks.todos.mockResolvedValue([todo]);
  await hydrateUserData('u1');expect(useGoalStore.getState().monthlyGoals).toEqual([{...goal,id:'other',title:'다른 목표'},goal]);expect(useTodoStore.getState().todos).toEqual([todo]);
});

test('로그아웃 후 도착한 이전 hydrate는 데이터와 완료 상태를 복원하지 않는다', async () => {
  let finish!: (value: Todo[]) => void;
  mocks.todos.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const old = hydrateUserData('u1');
  await vi.waitFor(() => expect(mocks.todos).toHaveBeenCalledOnce());
  resetHydration();
  finish([todo]);
  await old;
  expect(useTodoStore.getState().todos).toEqual([]);
  expect(useUIStore.getState().dataHydrated).toBe(false);
});

test('이전 hydrate가 늦게 끝나도 새 계정의 결과와 완료 상태를 유지한다', async () => {
  let finish!: (value: Todo[]) => void;
  mocks.todos.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const old = hydrateUserData('u1');
  await vi.waitFor(() => expect(mocks.todos).toHaveBeenCalledOnce());
  resetHydration();
  await hydrateUserData('u2');
  finish([todo]);
  await old;
  expect(useTodoStore.getState().todos).toEqual([]);
  expect(useUIStore.getState().dataHydrated).toBe(true);
});

test('저장 전송을 기다린 뒤 서버 조회를 시작한다', async () => {
  let finish!: () => void;
  mocks.planIds.mockReturnValue([]); mocks.bundles.mockResolvedValue([]); mocks.weekly.mockResolvedValue([]);
  mocks.flush.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const loading = hydrateUserData('u1');
  expect(mocks.todos).not.toHaveBeenCalled();
  finish();
  await loading;
  expect(mocks.todos).toHaveBeenCalledOnce();
});

test('오프라인 쓰기가 남아 있으면 로컬 데이터를 유지하고 재연결 때 복원한다', async () => {
  useTodoStore.setState({ todos: [todo] });
  mocks.pending.mockReturnValue(1);
  await hydrateUserData('u1');
  expect(mocks.todos).not.toHaveBeenCalled();
  expect(useTodoStore.getState().todos).toEqual([todo]);
  mocks.pending.mockReturnValue(0);
  mocks.todos.mockResolvedValue([todo]);
  window.dispatchEvent(new Event('onju-outbox-drained'));
  await vi.waitFor(() => expect(mocks.todos).toHaveBeenCalledOnce());
  expect(useTodoStore.getState().todos).toEqual([todo]);
});

test('조회 중 새 편집이 생기면 이전 서버 결과로 덮어쓰지 않는다', async () => {
  let finish!: (value: Todo[]) => void;
  mocks.todos.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const loading = hydrateUserData('u1');
  await vi.waitFor(() => expect(mocks.todos).toHaveBeenCalledOnce());
  useTodoStore.setState({ todos: [todo] });
  mocks.pending.mockReturnValue(1);
  finish([]);
  await loading;
  expect(useTodoStore.getState().todos).toEqual([todo]);
});

test('조회 실패는 완료로 고정되지 않아 다음 복원에서 다시 조회한다', async () => {
  mocks.todos.mockRejectedValueOnce(new Error('offline'));
  await hydrateUserData('u1');
  await hydrateUserData('u1');
  expect(mocks.todos).toHaveBeenCalledTimes(2);
});

test('이전 계정에서 예약한 설정 저장 타이머는 새 계정에 쓰지 않는다', async () => {
  await hydrateUserData('u1');
  vi.useFakeTimers();
  useSettingsStore.setState({ graceEndHour: 7 });
  resetHydration();
  await hydrateUserData('u2');
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.settings).not.toHaveBeenCalled();
  useSettingsStore.setState({ graceEndHour: 8 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.settings).toHaveBeenCalledWith('u2', expect.anything());
});

test('로그아웃 직전 디바운스 중인 설정을 기존 계정으로 먼저 큐에 보낸다', async () => {
  await hydrateUserData('u1');
  vi.useFakeTimers();
  useSettingsStore.setState({ graceEndHour: 4 });
  flushPendingSettings(); resetHydration();
  await hydrateUserData('u2');
  await vi.advanceTimersByTimeAsync(1000);
  expect(mocks.settings).toHaveBeenCalledExactlyOnceWith('u1', expect.objectContaining({ settings: expect.objectContaining({ graceEndHour: 4 }) }));
});

test('앱을 닫을 때도 디바운스 중인 설정을 기기 큐로 보낸다', async () => {
  await hydrateUserData('u1');
  vi.useFakeTimers();
  useSettingsStore.setState({ graceEndHour: 5 });
  window.dispatchEvent(new Event('pagehide'));
  expect(mocks.settings).toHaveBeenCalledWith('u1', expect.anything());
});


test('충돌한 습관 입력만 남기고 다른 습관과 수행 기록은 서버에서 읽는다',async()=>{
  const {useHabitStore}=await import('../../store/habitStore');const mine={id:'h',userId:'',title:'내 입력',emoji:'',frequency:'daily' as const,when:'',createdAt:'2026-10-01'};
  useHabitStore.setState({habits:[mine],habitLogs:[]});mocks.practiceIds.mockReturnValue(['habit:h']);mocks.habits.mockResolvedValue([{...mine,title:'서버'},{...mine,id:'other'}]);mocks.habitLogs.mockResolvedValue([{habitId:'h',date:'2026-10-26',completed:true}]);
  await hydrateUserData('u1');expect(useHabitStore.getState().habits).toEqual([{...mine,id:'other'},mine]);expect(useHabitStore.getState().habitLogs).toHaveLength(1);
});

test('묶음·주간 목표 충돌과 삭제 대기 입력은 hydrate가 덮지 않고 다른 서버 기록은 가져온다',async()=>{
  const {useHabitStore}=await import('../../store/habitStore');
  const bundle={id:'p',userId:'',title:'내 묶음',emoji:'',when:'',habitIds:['h'],timerEnabled:false,createdAt:'2026-10-01'};
  const goal={id:'w',userId:'',title:'내 횟수',targetCount:5,weekNumber:44,year:2026,startDate:'2026-10-26',endDate:'2026-11-01',status:'active' as const,completionRate:0,linkedRoutineIds:[],createdAt:'2026-10-01'};
  useHabitStore.setState({personalRoutines:[bundle]});useGoalStore.setState({weeklyGoals:[goal]});mocks.planIds.mockReturnValue(['bundle:p','weekly:w']);
  mocks.bundles.mockResolvedValue([{...bundle,title:'서버'}, {...bundle,id:'other'}]);mocks.weekly.mockResolvedValue([{...goal,targetCount:2},{...goal,id:'other'}]);
  await hydrateUserData('u1');expect(useHabitStore.getState().personalRoutines).toEqual([{...bundle,id:'other'},bundle]);expect(useGoalStore.getState().weeklyGoals).toEqual([{...goal,id:'other'},goal]);
});

test('할 일·일기·메모 보류 입력은 유지하면서 서버의 수행 상태와 다른 날 기록을 가져온다',async()=>{
  const {useDiaryStore}=await import('../../store/diaryStore');const {useRoutineStore}=await import('../../store/routineStore');
  const diary={date:'2026-10-28',mood:null,content:'내 일기',updatedAt:'2026-10-28',revision:'mine'};
  const log={id:'l',routineId:'r',userId:'',date:'2026-10-28',completed:false,memo:'내 메모',memoRevision:'mine'};
  useTodoStore.setState({todos:[todo]});useDiaryStore.setState({entries:[diary]});useRoutineStore.setState({logs:[log]});
  mocks.recordIds.mockReturnValue([`todo:${todo.id}`,'diary:2026-10-28','memo:r:2026-10-28']);
  mocks.todos.mockResolvedValue([{...todo,title:'서버 제목'},{...todo,id:'other'}]);mocks.diary.mockResolvedValue([{...diary,content:'서버 일기'},{...diary,date:'2026-10-27'}]);mocks.logs.mockResolvedValue([{...log,memo:'서버 메모',memoRevision:'server',completed:true}]);
  await hydrateUserData('u1');expect(useTodoStore.getState().todos).toEqual([{...todo,id:'other'},todo]);expect(useDiaryStore.getState().entries).toEqual([{...diary,date:'2026-10-27'},diary]);expect(useRoutineStore.getState().logs).toEqual([{...log,completed:true}]);
});
