import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const writes = vi.hoisted(() => ({ enqueue: vi.fn(), deletionIds: vi.fn((): string[] => []) }));
vi.mock('../lib/sync/outbox', () => ({ enqueue: writes.enqueue, pendingRecordIds: () => [], pendingPlanIds: () => [], pendingGoalDeletionIds: writes.deletionIds }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('../store/authStore', async () => { const { create } = await import('zustand'); return { useAuthStore: create(() => ({ user: { id: 'A', weeklyGoalSlots: 3 } })) }; });
import { useAuthStore } from '../store/authStore';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { useUIStore } from '../store/uiStore';
import { withHistory } from '../utils/scheduleHistory';
import { getLinkedItems } from '../utils/goalProgress';
import { readDraft } from '../lib/localDrafts';
import { isGoalDraft, isHabitDraft, isFaithDraft } from '../utils/formDrafts';
import { writeDraft } from '../lib/localDrafts';
import MonthlyGoalNew from './MonthlyGoalNew';
import GoalConnect from './GoalConnect';
import HabitNew from './HabitNew';
import FaithRoutineNew from './FaithRoutineNew';
import Goals from './Goals';
import type { MonthlyGoal, Habit, DailyRoutine, User } from '../types';
const goal: MonthlyGoal={id:'g',userId:'',title:'건강한 나',toBeStatement:'건강한 나',month:10,year:2026,startDate:'2026-10-01',endDate:'2026-10-31',category:'personal',status:'active',createdAt:'2026-10-01',goalRoutines:[{id:'plan1',title:'첫 계획'},{id:'plan2',title:'두 번째 계획'}]};
const habit:Habit={id:'h',userId:'',title:'산책',emoji:'',when:'점심',frequency:'daily',goalId:'g',createdAt:'2026-10-01'};
const faith:DailyRoutine={id:'f',userId:'',title:'기도',type:'faith',isActive:true,order:0,frequency:'daily',goalId:'g',createdAt:'2026-10-01'};
let root:Root,host:HTMLDivElement,router:ReturnType<typeof createMemoryRouter>;
async function mount(path='/goals/monthly/edit/g') {
  router=createMemoryRouter([{path:'/goals/monthly/edit/:id',element:h(MonthlyGoalNew)},{path:'/goals/:id/connect',element:h(GoalConnect)},{path:'/habits/edit/:id',element:h(HabitNew)},{path:'/faith/edit/:id',element:h(FaithRoutineNew)},{path:'/goals',element:h(Goals)},{path:'/',element:h('p',null,'홈')}],{initialEntries:[path]});
  await act(async()=>root.render(h(RouterProvider,{router})));
}
async function reopen(path='/goals/monthly/edit/g') {await act(async()=>root.unmount());router.dispose();root=createRoot(host);await mount(path);}
async function click(label:string) {const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')===label);expect(button,label).toBeDefined();await act(async()=>button!.click());}
async function fill(label:string,value:string) {const el=host.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[aria-label="${label}"]`)!;expect(el).not.toBeNull();await act(async()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-27T12:00:00'));vi.clearAllMocks();localStorage.clear();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  writes.deletionIds.mockReturnValue([]);
  useAuthStore.setState({user:{id:'A',weeklyGoalSlots:3} as User});useUIStore.setState({dataHydrated:true});
  useGoalStore.setState({monthlyGoals:[goal],weeklyGoals:[]});useHabitStore.setState({habits:[habit,withHistory({...habit,id:'archived',title:'지난 습관'},{archivedAt:'2026-10-20'},'2026-10-20')],personalRoutines:[],habitLogs:[{habitId:'h',date:'2026-10-10',completed:true},{habitId:'h',date:'2026-10-26',completed:true},{habitId:'h',date:'2026-10-27',completed:false,skipped:true}]});useRoutineStore.setState({faithRoutines:[],personalRoutines:[],logs:[]});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());router?.dispose();host.remove();vi.useRealTimers();vi.restoreAllMocks();});

test('분류·기간 변경은 영향 확인 후 목표만 저장하고 실천·로그·이력·추가 계획을 보존한다',async()=>{
  const before=useHabitStore.getState();await mount();await click('신앙 목표');await fill('목표 시작일','2026-10-25');await fill('목표 종료일','2026-10-30');
  expect(host.textContent).toContain('현재 연결 2개 유지');expect(host.textContent).toContain('3회 → 2회');await click('수정 완료');expect(host.querySelector('[role="dialog"]')?.textContent).toContain('분류·기간 변경을 적용할까요');expect(writes.enqueue).not.toHaveBeenCalled();
  await click('취소');expect(useGoalStore.getState().monthlyGoals[0]).toBe(goal);await click('수정 완료');await click('확인하고 저장');
  expect(useGoalStore.getState().monthlyGoals[0]).toMatchObject({category:'faith',startDate:'2026-10-25',endDate:'2026-10-30',goalRoutines:goal.goalRoutines});
  expect(useHabitStore.getState()).toBe(before);expect(writes.enqueue).toHaveBeenCalledTimes(1);expect(writes.enqueue.mock.calls[0][0]).toMatchObject({type:'rpc',fn:'save_monthly_goal',args:{creating:false,expected_revision:null,goal_values:{category:'faith',start_date:'2026-10-25',end_date:'2026-10-30'}}});
  expect(readDraft('A','monthly-goal:g',isGoalDraft)).toBeNull();
});

test('확인 중 기록이 바뀌면 오래된 계산으로 승인하지 않고 다시 확인한다',async()=>{
  await mount();await fill('목표 종료일','2026-10-29');await click('수정 완료');
  await act(async()=>useHabitStore.setState({habitLogs:[...useHabitStore.getState().habitLogs,{habitId:'h',date:'2026-10-25',completed:true}]}));
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('확인 중 목표나 기록');expect([...host.querySelectorAll('button')].find(b=>b.textContent==='확인하고 저장')?.disabled).toBe(true);
  await click('취소');await click('수정 완료');await click('확인하고 저장');expect(writes.enqueue).toHaveBeenCalledTimes(1);
});

test('분류 변경 뒤 다른 유형의 기존 항목도 연결 관리에 남고 원래 홈 탭으로 이동한다',async()=>{
  useGoalStore.setState({monthlyGoals:[{...goal,category:'faith'}]});await mount('/goals/g/connect');
  expect(host.textContent).toContain('연결된 실천 2개');expect(host.textContent).toContain('산책');expect(host.textContent).toContain('이전 분류의 연결 유지');expect(host.textContent).toContain('새 신앙 루틴 만들기');
  await click('산책 다른 목표로 이동');expect(host.textContent).toContain('옮길 수 있는 개인 목표가 없어요');await click('취소');await click('개인 습관 실천하기');expect(router.state.location.state).toMatchObject({homeTab:'personal'});
});

test.each(['personal','faith'] as const)('%s 수정 초안 복원은 분류·기간이 바뀐 기존 연결을 해제하지 않는다',async category=>{
  const path=category==='personal'?'/habits/edit/h':'/faith/edit/f';const label=category==='personal'?'습관 이름':'루틴 이름';
  if(category==='faith'){useGoalStore.setState({monthlyGoals:[{...goal,category:'faith'}]});useRoutineStore.setState({faithRoutines:[faith]});}
  await mount(path);await fill(label,'이어서 작성한 실천');
  await act(async()=>useGoalStore.getState().updateMonthlyGoal('g',{category:category==='personal'?'faith':'personal',endDate:'2026-10-20'}));
  await reopen(path);await click('초안 복원');expect(host.textContent).toContain('기존 연결을 유지할 수 있어요');await click('수정 완료');
  const item=category==='personal'?useHabitStore.getState().habits[0]:useRoutineStore.getState().faithRoutines[0];expect(item).toMatchObject({goalId:'g',title:'이어서 작성한 실천'});
  expect(readDraft('A',category==='personal'?'habit:h':'faith-routine:f',category==='personal'?isHabitDraft:isFaithDraft)).toBeNull();
});

test('미래로 옮긴 목표는 시작 전·진척 0으로 표시하고 지난 기록과 기존 연결을 유지한다',async()=>{
  const before=useHabitStore.getState();await mount();await fill('목표 종료일','2026-11-30');await fill('목표 시작일','2026-11-01');expect(host.textContent).toContain('시작 전 목표가 돼요');await click('수정 완료');await click('확인하고 저장');
  expect(host.textContent).toContain('시작 전');expect(host.textContent).not.toContain('D+-1');expect(useGoalStore.getState().monthlyGoals[0]).toMatchObject({month:11,year:2026});expect(useHabitStore.getState()).toBe(before);
  const items=getLinkedItems(useGoalStore.getState().monthlyGoals[0],before.habits,before.habitLogs,[],[],'2026-10-27');expect(items).toHaveLength(2);expect(items.every(i=>i.doneCount===0)).toBe(true);
});

test('목표 초안은 영향 확인을 다시 거치며 잘못된 달력 날짜는 저장하지 않는다',async()=>{
  await mount();await click('신앙 목표');await fill('목표 종료일','2026-10-29');await reopen();await click('초안 복원');await click('수정 완료');expect(writes.enqueue).not.toHaveBeenCalled();await click('취소');
  const draft=readDraft('A','monthly-goal:g',isGoalDraft)!;writeDraft('A','monthly-goal:g',{...draft.values,startDate:'2026-02-30'});await reopen();await click('초안 복원');expect(host.textContent).toContain('실제 달력 날짜');expect([...host.querySelectorAll('button')].find(b=>b.textContent==='수정 완료')?.disabled).toBe(true);expect(writes.enqueue).not.toHaveBeenCalled();
});

test('계정 전환 또는 목표 삭제 뒤 남은 확인창으로 이전 목표를 저장하지 않는다',async()=>{
  await mount();await click('신앙 목표');await click('수정 완료');await act(async()=>{useAuthStore.setState({user:{id:'B'} as User});useGoalStore.setState({monthlyGoals:[]});});
  expect(host.querySelector('[role="dialog"]')).toBeNull();expect(host.textContent).toContain('항목을 찾지 못했어요');expect(writes.enqueue).not.toHaveBeenCalled();
});

test('스토어 직접 수정도 역전 기간·없는 목표를 쓰지 않고 이전 데이터를 남긴다',async()=>{
  expect(()=>useGoalStore.getState().updateMonthlyGoal('g',{startDate:'2026-11-01'})).toThrow('종료일');expect(()=>useGoalStore.getState().updateMonthlyGoal('deleted',{title:'재생성 금지'})).toThrow('찾지 못');expect(useGoalStore.getState().monthlyGoals[0]).toBe(goal);expect(writes.enqueue).not.toHaveBeenCalled();
});

test('오래 열린 편집 화면과 복원 초안은 시작 당시 버전으로 저장해 다른 기기의 변경을 감지한다',async()=>{
  const original={...goal,revision:'r0'};useGoalStore.setState({monthlyGoals:[original]});await mount();await fill('되고 싶은 모습','이 기기의 입력');
  await act(async()=>useGoalStore.setState({monthlyGoals:[{...original,revision:'r1',title:'다른 기기',goalRoutines:[{id:'other',title:'다른 계획'}]}]}));
  await reopen();await click('초안 복원');await click('수정 완료');
  expect(writes.enqueue.mock.calls[0][0]).toMatchObject({args:{expected_revision:'r0',goal_values:{title:'이 기기의 입력',goal_routines:goal.goalRoutines}}});
});
test('목표 저장의 기기 보관 실패 시 입력과 기준 버전 초안을 유지한다',async()=>{
  useGoalStore.setState({monthlyGoals:[{...goal,revision:'r0'}]});await mount();await fill('되고 싶은 모습','남길 입력');writes.enqueue.mockImplementationOnce(()=>{throw new Error('quota');});await click('수정 완료');
  expect(router.state.location.pathname).toContain('/edit/');expect(useGoalStore.getState().monthlyGoals[0].title).toBe(goal.title);
  expect(readDraft('A','monthly-goal:g',isGoalDraft)?.values).toMatchObject({toBeStatement:'남길 입력',baseGoal:{revision:'r0'}});
});
test('저장 응답은 같은 계정의 해당 로컬 버전에만 반영한다',()=>{
  useGoalStore.setState({monthlyGoals:[{...goal,revision:'newer-local'}]});
  window.dispatchEvent(new CustomEvent('onju-goal-saved',{detail:{ownerId:'A',goalId:'g',revision:'older-local',current:null}}));expect(useGoalStore.getState().monthlyGoals).toHaveLength(1);
  window.dispatchEvent(new CustomEvent('onju-goal-saved',{detail:{ownerId:'B',goalId:'g',revision:'newer-local',current:null}}));expect(useGoalStore.getState().monthlyGoals).toHaveLength(1);
  window.dispatchEvent(new CustomEvent('onju-goal-saved',{detail:{ownerId:'A',goalId:'g',revision:'newer-local',current:null}}));expect(useGoalStore.getState().monthlyGoals).toEqual([]);
});

test('다른 기기가 삭제한 목표도 남은 편집 초안을 열어 복구 요청으로 보낼 수 있다',async()=>{
  useGoalStore.setState({monthlyGoals:[{...goal,revision:'r0'}]});await mount();await fill('되고 싶은 모습','삭제 후에도 남길 초안');
  await act(async()=>useGoalStore.setState({monthlyGoals:[]}));await reopen();expect(host.textContent).toContain('이 기기의 입력은 남아');await click('초안 복원');await click('수정 완료');
  expect(writes.enqueue.mock.calls[0][0]).toMatchObject({fn:'save_monthly_goal',args:{gid:'g',creating:false,expected_revision:'r0',goal_values:{title:'삭제 후에도 남길 초안'}}});
});

test('다른 탭의 삭제 대기 중에는 열린 편집의 저장을 잠그고 작성 내용은 유지한다',async()=>{
  await mount();await fill('목표 종료일','2026-11-01');
  await act(async()=>{writes.deletionIds.mockReturnValue(['g']);window.dispatchEvent(new Event('onju-outbox-changed'));});
  expect(host.textContent).toContain('삭제 결과를 확인');expect([...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='수정 완료')?.disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>('[aria-label="목표 종료일"]')?.value).toBe('2026-11-01');expect(writes.enqueue).not.toHaveBeenCalled();
  await act(async()=>{writes.deletionIds.mockReturnValue([]);window.dispatchEvent(new Event('onju-outbox-changed'));});
  expect([...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='수정 완료')?.disabled).toBe(false);
});
