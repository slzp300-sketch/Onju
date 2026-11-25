import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
vi.mock('../data/repos',()=>({upsertPersonalRoutine:vi.fn(),upsertHabit:vi.fn(),upsertRoutine:vi.fn(),upsertMonthlyGoal:vi.fn(),upsertWeeklyGoal:vi.fn(),upsertTodo:vi.fn()}));
vi.mock('../store/authStore',async()=>{const {create}=await import('zustand');return {useAuthStore:create(()=>({user:{id:'A',weeklyGoalSlots:3}}))};});
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { useHabitStore } from '../store/habitStore';
import { useGoalStore } from '../store/goalStore';
import { useRoutineStore } from '../store/routineStore';
import { useTodoStore } from '../store/todoStore';
import { readDraft } from '../lib/localDrafts';
import { isHabitDraft,isGoalDraft,isTodoDraft,isWeeklyGoalDraft } from '../utils/formDrafts';
import HabitNew from './HabitNew';
import PersonalRoutineNew from './PersonalRoutineNew';
import MonthlyGoalNew from './MonthlyGoalNew';
import TodoNew from './TodoNew';
import WeeklyGoalsSection from '../components/goals/WeeklyGoalsSection';
import type { User } from '../types';
const cases=[['습관',HabitNew,'habit:new','습관 이름','시작하기'],['목표',MonthlyGoalNew,'monthly-goal:new','되고 싶은 모습','목표 시작하기'],['할 일',TodoNew,'todo:new','할 일 이름','추가하기']] as const;
let root:Root,host:HTMLDivElement,router:ReturnType<typeof createMemoryRouter>;
async function mount(Component:typeof HabitNew,path='/form') {router=createMemoryRouter([{path:'/form',element:h(Component)},{path:'/form/:id',element:h(Component)},{path:'/',element:h('p',null,'홈')},{path:'/goals/:id/connect',element:h('p',null,'목표 연결')},{path:'/goals/monthly',element:h('p',null,'목표 목록')}],{initialEntries:['/',path]});await act(async()=>root.render(h(RouterProvider,{router})));}
async function reopen(Component:typeof HabitNew,path='/form'){await act(async()=>root.unmount());router.dispose();root=createRoot(host);await mount(Component,path);}
async function click(text:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===text||b.getAttribute('aria-label')===text);expect(b, `button: ${text}; ${host.textContent}`).toBeDefined();await act(async()=>b!.click());}
async function fill(label:string,value:string){const el=host.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[aria-label="${label}"]`)!;expect(el).not.toBeNull();await act(async()=>{Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
const saved=(key:string)=>readDraft('A',key,(v):v is Record<string,unknown>=>!!v&&typeof v==='object');
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-27T12:00:00'));vi.clearAllMocks();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});localStorage.clear();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});useAuthStore.setState({user:{id:'A',weeklyGoalSlots:3} as User});useUIStore.setState({dataHydrated:true});useHabitStore.setState({habits:[],personalRoutines:[],habitLogs:[]});useGoalStore.setState({monthlyGoals:[],weeklyGoals:[]});useRoutineStore.setState({faithRoutines:[],personalRoutines:[]});useTodoStore.setState({todos:[]});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());router?.dispose();host.remove();vi.useRealTimers();vi.restoreAllMocks();});

test.each(cases)('%s 새 작성은 새로고침 후 선택 복원하고 저장 성공 때 초안을 지운다',async(_name,Component,key,label,submit)=>{
  await mount(Component);await fill(label,'작은 실천을 이어가기');const before=saved(key);expect(before).not.toBeNull();
  await reopen(Component);expect(host.querySelector('fieldset')?.disabled).toBe(true);expect(saved(key)).toEqual(before);await click('초안 복원');
  expect(host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)?.value).toBe('작은 실천을 이어가기');expect(saved(key)?.values.entityId).toBe(before?.values.entityId);
  await click(submit);expect(saved(key)).toBeNull();expect(router.state.location.pathname).not.toBe('/form');
  const items=_name==='습관'?useHabitStore.getState().habits:_name==='목표'?useGoalStore.getState().monthlyGoals:useTodoStore.getState().todos;
  expect(items).toHaveLength(1);expect(items[0].id).toBe(before?.values.entityId);
});

test('습관 초안은 요일·알림·목표 연결을 포함하고 다른 계정에 노출되지 않는다',async()=>{
  await mount(HabitNew);await fill('습관 이름','출근 전 물 마시기');await click('직접 선택');await click('화');
  expect(saved('habit:new')?.values).toMatchObject({freq:'custom',customDays:[2],notifType:'push',notifTimes:['09:00']});
  // 이름만으로도 저장한 계정과 수정 문서가 격리되어야 한다.
  expect(isHabitDraft(saved('habit:new')?.values)).toBe(true);
  await act(async()=>useAuthStore.setState({user:{id:'B'} as User}));expect(host.textContent).not.toContain('초안 복원');expect(host.querySelector<HTMLInputElement>('[aria-label="습관 이름"]')?.value).toBe('');
  expect(saved('habit:new')).not.toBeNull();await act(async()=>useAuthStore.setState({user:{id:'A'} as User}));expect(host.textContent).toContain('초안 복원');await click('초안 복원');expect(host.querySelector<HTMLInputElement>('[aria-label="습관 이름"]')?.value).toBe('출근 전 물 마시기');
});

test('기존 습관 수정 초안은 새 작성과 섞이지 않고 버리면 서버에서 읽은 값을 유지한다',async()=>{
  useHabitStore.setState({habits:[{id:'existing',title:'원래 습관',userId:'',emoji:'🌱',frequency:'daily',when:'',createdAt:'2026-01-01'}]});await mount(HabitNew,'/form/existing');await fill('습관 이름','수정하다 멈춘 습관');expect(saved('habit:existing')).not.toBeNull();expect(saved('habit:new')).toBeNull();
  await reopen(HabitNew,'/form/existing');await click('초안 버리기');expect(host.querySelector<HTMLInputElement>('[aria-label="습관 이름"]')?.value).toBe('원래 습관');expect(saved('habit:existing')).toBeNull();
});

test('저장 동작이 실패하면 입력과 초안을 유지하고 성공한 재시도 뒤에만 제거한다',async()=>{
  const original=useHabitStore.getState().addHabit;useHabitStore.setState({addHabit:()=>{throw new Error('write failed');}});
  try {await mount(HabitNew);await fill('습관 이름','실패 후 복원');await click('시작하기');expect(saved('habit:new')).not.toBeNull();expect(router.state.location.pathname).toBe('/form');
    await act(async()=>useHabitStore.setState({addHabit:original}));await click('시작하기');expect(saved('habit:new')).toBeNull();expect(useHabitStore.getState().habits).toHaveLength(1);
  } finally {useHabitStore.setState({addHabit:original});}
});

test('할 일 초안은 다음 날에도 복원하며 화면에 표시한 오늘 날짜로 추가한다',async()=>{
  await mount(TodoNew);await fill('할 일 이름','내일 이어서 할 일');vi.setSystemTime(new Date('2026-10-28T12:00:00'));await reopen(TodoNew);await click('초안 복원');expect(host.textContent).toContain('2026-10-28');await click('추가하기');expect(useTodoStore.getState().todos[0].date).toBe('2026-10-28');
});

test('주간 목표의 선택·횟수는 닫았다 열어도 복원되고 이미 연결된 항목은 다시 저장하지 못한다',async()=>{
  useHabitStore.setState({habits:[{id:'linked',title:'산책',emoji:'🌱',userId:'',frequency:'daily',when:'',createdAt:'2026-01-01'}]});await mount(WeeklyGoalsSection);await click('주간 목표 추가');await click('산책습관');await click('횟수 늘리기');
  const key='weekly-goal:new:2026-10-26';expect(isWeeklyGoalDraft(saved(key)?.values)).toBe(true);expect(saved(key)?.values.target).toBe(4);
  await reopen(WeeklyGoalsSection);await click('주간 목표 추가');expect(host.querySelector('fieldset')?.disabled).toBe(true);await click('초안 복원');expect(host.textContent).toContain('4회 / 주');
  await act(async()=>useHabitStore.setState({habits:[]}));expect(host.textContent).toContain('다시 선택해주세요');expect([...host.querySelectorAll('button')].find(b=>b.textContent==='목표 추가')?.disabled).toBe(true);expect(saved(key)).not.toBeNull();
});

test('목표와 할 일 초안 검증은 입력 중인 값을 허용하되 손상된 데이터는 거부한다',()=>{
  expect(isGoalDraft({entityId:'bad'})).toBe(false);expect(isTodoDraft({title:3})).toBe(false);expect(isWeeklyGoalDraft({entityId:'11111111-1111-4111-8111-111111111111',pickedId:null,target:99})).toBe(false);
});


test('오래 열린 습관 편집·초안은 원래 버전으로 저장하고 보관·삭제 후에도 입력을 복원한다',async()=>{
  const {upsertHabit}=await import('../data/repos');const base={id:'existing',revision:'r0',title:'원래 습관',userId:'',emoji:'🌱',frequency:'daily' as const,when:'',createdAt:'2026-01-01'};
  useHabitStore.setState({habits:[base]});await mount(HabitNew,'/form/existing');await fill('습관 이름','내 수정');
  await act(async()=>useHabitStore.setState({habits:[{...base,revision:'r1',archivedAt:'2026-10-27'}]}));await click('수정 완료');
  expect(upsertHabit).toHaveBeenLastCalledWith(expect.objectContaining({title:'내 수정'}),'r0');
  await reopen(HabitNew,'/form/existing');await fill('습관 이름','삭제 후 남길 초안');await act(async()=>useHabitStore.setState({habits:[]}));await reopen(HabitNew,'/form/existing');
  expect(host.textContent).toContain('초안 복원');await click('초안 복원');await click('수정 완료');expect(upsertHabit).toHaveBeenLastCalledWith(expect.objectContaining({id:'existing',title:'삭제 후 남길 초안'}),expect.any(String));
});

test('묶음 편집 초안은 원래 버전·보관된 습관·타이머를 유지하고 삭제 후에도 복원한다',async()=>{
  const {upsertPersonalRoutine}=await import('../data/repos');const r0='11111111-1111-4111-8111-111111111111',r1='22222222-2222-4222-8222-222222222222';
  const base={id:'bundle',revision:r0,title:'원래 묶음',userId:'',emoji:'🌱',when:'퇴근 후',habitIds:['h','archived'],habitDurations:{h:120,archived:180},timerEnabled:false,createdAt:'2026-01-01'};
  useHabitStore.setState({personalRoutines:[base],habits:[{id:'h',title:'산책',userId:'',emoji:'',when:'',frequency:'daily',createdAt:'2026-01-01'},{id:'archived',title:'보관된 독서',userId:'',emoji:'',when:'',frequency:'daily',createdAt:'2026-01-01',archivedAt:'2026-10-26'}]});
  await mount(PersonalRoutineNew,'/form/bundle');await fill('루틴 이름','내 묶음 수정');expect(saved('personal-routine:bundle')?.values.base).toMatchObject({revision:r0});
  await act(async()=>useHabitStore.setState({personalRoutines:[{...base,title:'다른 기기',revision:r1}]}));await reopen(PersonalRoutineNew,'/form/bundle');await click('초안 복원');expect(host.textContent).toContain('보관된 독서');
  await click('수정 완료');expect(upsertPersonalRoutine).toHaveBeenLastCalledWith(expect.objectContaining({title:'내 묶음 수정',habitIds:base.habitIds,habitDurations:base.habitDurations}),r0);
  await reopen(PersonalRoutineNew,'/form/bundle');await fill('루틴 이름','삭제 후 남은 입력');await act(async()=>useHabitStore.setState({personalRoutines:[]}));await reopen(PersonalRoutineNew,'/form/bundle');await click('초안 복원');await click('수정 완료');
  expect(upsertPersonalRoutine).toHaveBeenLastCalledWith(expect.objectContaining({id:'bundle',title:'삭제 후 남은 입력'}),expect.any(String));
});
test('주간 목표 수정 초안은 원래 기준으로 저장하며 삭제·다음 주에도 남긴 편집에서 복원한다',async()=>{
  const {upsertWeeklyGoal}=await import('../data/repos');const base={id:'33333333-3333-4333-8333-333333333333',revision:'11111111-1111-4111-8111-111111111111',title:'산책',userId:'',targetCount:3,weekNumber:44,year:2026,startDate:'2026-10-26',endDate:'2026-11-01',status:'active' as const,completionRate:0,linkedKind:'habit' as const,linkedId:'h',linkedRoutineIds:[],createdAt:'2026-01-01'};
  useGoalStore.setState({weeklyGoals:[base]});await mount(WeeklyGoalsSection);await click('산책 주간 목표 더보기');await click('횟수 수정');await click('횟수 늘리기');
  await act(async()=>useGoalStore.setState({weeklyGoals:[{...base,targetCount:5,revision:'22222222-2222-4222-8222-222222222222'}]}));await reopen(WeeklyGoalsSection);await click('산책 주간 목표 더보기');await click('횟수 수정');await click('초안 복원');await click('횟수 저장');
  expect(upsertWeeklyGoal).toHaveBeenLastCalledWith(expect.objectContaining({targetCount:4}),base.revision);
  await click('산책 주간 목표 더보기');await click('횟수 수정');await click('횟수 늘리기');await act(async()=>useGoalStore.setState({weeklyGoals:[]}));vi.setSystemTime(new Date('2026-11-03T12:00:00'));await reopen(WeeklyGoalsSection);await click('산책 · 2026-10-26 초안 열기');await click('초안 복원');expect(host.textContent).toContain('5회 / 주');await click('횟수 저장');
  expect(upsertWeeklyGoal).toHaveBeenLastCalledWith(expect.objectContaining({id:'33333333-3333-4333-8333-333333333333',targetCount:5}),expect.any(String));
});
