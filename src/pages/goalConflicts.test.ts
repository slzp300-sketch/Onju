import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const api=vi.hoisted(()=>({owner:'A',row:null as Record<string,unknown>|null,read:vi.fn(),save:vi.fn()}));
vi.mock('../lib/supabase',()=>{
  const client={auth:{getSession:async()=>({data:{session:{user:{id:api.owner},access_token:api.owner}},error:null})},
    from:()=>{const builder={select:()=>builder,eq:()=>builder,maybeSingle:()=>api.read()};return builder;},rpc:api.save};
  return {supabase:client,supabaseForSession:()=>client};
});
vi.mock('../store/authStore',async()=>{const {create}=await import('zustand');return {useAuthStore:create(()=>({user:{id:'A'}}))};});
import { useAuthStore } from '../store/authStore';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { monthlyGoalToRow } from '../data/mappers';
import { clearOutbox, enqueue, flush, goalSyncEntries, setOutboxOwner } from '../lib/sync/outbox';
import GoalConflicts from './GoalConflicts';
import { monthlyGoalDeletion } from '../data/repos';
import type { MonthlyGoal, User } from '../types';
const original:MonthlyGoal={id:'g',userId:'',title:'서버에서 바꾼 목표',startDate:'2026-10-01',endDate:'2026-10-31',month:10,year:2026,status:'active',createdAt:'2026-10-01',revision:'remote',category:'personal'};
const mine={...original,title:'기기에 남긴 입력',category:'faith' as const,endDate:'2026-10-29'};
let host:HTMLDivElement,root:Root,router:ReturnType<typeof createMemoryRouter>;
async function click(label:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label);expect(button,label).toBeDefined();await act(async()=>button!.click());}
async function mount(){router=createMemoryRouter([{path:'/goals/conflicts',element:h(GoalConflicts)},{path:'/goals',element:h('p',null,'목표 관리')}],{initialEntries:['/goals/conflicts']});await act(async()=>root.render(h(RouterProvider,{router})));}
beforeEach(async()=>{
  vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-27T12:00:00'));Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  localStorage.clear();clearOutbox();setOutboxOwner('A');api.owner='A';useAuthStore.setState({user:{id:'A'} as User});
  api.row={...monthlyGoalToRow(original),revision:'remote',user_id:'A'};api.read.mockImplementation(async()=>({data:api.row,error:null}));
  api.save.mockImplementation(async(_fn:string,args:Record<string,unknown>)=>{
    if(!args.creating&&api.row?.revision!==args.expected_revision)return {data:{status:api.row?'conflict':'deleted',current:api.row},error:null};
    if(_fn==='delete_monthly_goal_checked'){api.row=null;return {data:{status:'deleted',current:null,effective_date:args.effective_date},error:null};}
    api.row={...args.goal_values as object,id:args.gid,revision:args.request_id,user_id:'A'};return {data:{status:'saved',current:api.row},error:null};
  });
  useGoalStore.setState({monthlyGoals:[mine],goalSlots:3,weeklyGoals:[]});
  useHabitStore.setState({habits:[{id:'h',userId:'',title:'산책',emoji:'',when:'점심',frequency:'daily',createdAt:'2026-10-01',goalId:'g'}],habitLogs:[{habitId:'h',date:'2026-10-26',completed:true}],personalRoutines:[]});
  useRoutineStore.setState({faithRoutines:[],personalRoutines:[],logs:[]});
  enqueue({type:'upsert',table:'monthly_goals',values:monthlyGoalToRow(mine)});await flush();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());router?.dispose();host.remove();clearOutbox();vi.useRealTimers();vi.restoreAllMocks();});

test('서버·기기 입력 비교와 취소 후 새 서버 버전을 기준으로 저장하고 습관·로그는 보존한다',async()=>{
  const before=useHabitStore.getState();await mount();expect(host.textContent).toContain(original.title);expect(host.textContent).toContain(mine.title);
  await click('내 입력으로 다시 저장');expect(host.textContent).toContain('현재 연결 1개 유지');await click('취소');expect(api.save).not.toHaveBeenCalled();
  await click('내 입력으로 다시 저장');await click('확인하고 적용');await act(async()=>flush());
  expect(api.save).toHaveBeenCalledWith('save_monthly_goal',expect.objectContaining({expected_revision:'remote',creating:false,goal_values:expect.objectContaining({title:mine.title})}));
  expect(goalSyncEntries('A')).toEqual([]);expect(useHabitStore.getState()).toBe(before);expect(api.row?.title).toBe(mine.title);
});
test('비교 뒤 또 바뀐 서버는 다시 충돌로 남고 사용자의 입력을 보존한다',async()=>{
  await mount();await click('내 입력으로 다시 저장');api.row={...api.row,revision:'newer',title:'다른 기기가 다시 수정'};
  await click('확인하고 적용');await act(async()=>flush());expect(api.row.title).toBe('다른 기기가 다시 수정');expect(goalSyncEntries('A')).toHaveLength(1);
  expect(host.textContent).toContain('다른 기기가 다시 수정');expect(host.textContent).toContain(mine.title);
});
test('삭제된 목표의 입력은 새 ID로 복사하며 기존 습관·연결·로그를 바꾸지 않는다',async()=>{
  api.row=null;const before=useHabitStore.getState();await mount();expect(host.textContent).toContain('서버에 이 목표가 없어요');
  await click('새 목표로 복사');await click('확인하고 적용');await act(async()=>flush());
  expect(api.save).toHaveBeenCalledWith('save_monthly_goal',expect.objectContaining({creating:true,expected_revision:null,gid:expect.not.stringMatching(/^g$/)}));
  expect(useGoalStore.getState().monthlyGoals[0].id).not.toBe('g');expect(useHabitStore.getState()).toBe(before);
});
test('서버 내용 사용은 확인 전에는 입력을 남기고 확인 후에는 원격 쓰기 없이 정리한다',async()=>{
  await mount();await click('서버 내용 사용');expect(host.textContent).toContain('저장 대기 입력을 버리고');await click('취소');expect(goalSyncEntries('A')).toHaveLength(1);
  await click('서버 내용 사용');await click('확인하고 적용');await act(async()=>flush());
  expect(api.save).not.toHaveBeenCalled();expect(goalSyncEntries('A')).toEqual([]);expect(useGoalStore.getState().monthlyGoals[0].title).toBe(original.title);
});
test('조회 실패는 선택 버튼을 잠그고 재조회 후 복구한다',async()=>{
  api.read.mockRejectedValueOnce(new Error('offline'));await mount();expect(host.querySelector('[role="alert"]')?.textContent).toContain('입력은 기기에');
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='서버 내용 사용')?.disabled).toBe(true);expect(goalSyncEntries('A')).toHaveLength(1);
  await click('서버 내용 다시 불러오기');expect(host.querySelector('[role="alert"]')).toBeNull();expect(host.textContent).toContain(original.title);
});
test('확인 중 기록이 바뀌면 영향 확인을 다시 요구하고 보관 실패 시 원래 입력을 남긴다',async()=>{
  await mount();await click('내 입력으로 다시 저장');await act(async()=>useHabitStore.setState({habitLogs:[]}));
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='확인하고 적용')?.disabled).toBe(true);await click('취소');
  await click('내 입력으로 다시 저장');const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});await click('확인하고 적용');spy.mockRestore();
  expect(goalSyncEntries('A')).toHaveLength(1);expect(api.save).not.toHaveBeenCalled();expect(host.textContent).toContain(mine.title);
});
test('계정 전환 후 늦은 조회 결과와 다른 계정의 입력을 표시하지 않는다',async()=>{
  let finish!:(result:unknown)=>void;api.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await mount();
  await act(async()=>{api.owner='B';setOutboxOwner('B');useAuthStore.setState({user:{id:'B'} as User});useGoalStore.setState({monthlyGoals:[]});});
  await act(async()=>finish({data:api.row,error:null}));expect(host.textContent).not.toContain(original.title);expect(host.textContent).not.toContain(mine.title);expect(goalSyncEntries('A')).toHaveLength(1);
});

async function prepareDeletion(legacy=false){
  clearOutbox();enqueue(legacy?{type:'rpc',fn:'delete_monthly_goal_preserving_history',args:{gid:'g',effective_date:'2026-10-20'}}:monthlyGoalDeletion({...mine,revision:'old'},'2026-10-20'));await flush();api.save.mockClear();
}
test('삭제 충돌은 원래 대상·최신 내용·적용일을 비교하고 취소하면 실천을 건드리지 않는다',async()=>{
  await prepareDeletion();const before=useHabitStore.getState();await mount();expect(host.textContent).toContain('기기에 보관된 삭제 대상');expect(host.textContent).toContain('2026-10-20');
  await click('삭제 취소 · 최신 목표 유지');await click('취소');expect(goalSyncEntries('A')).toHaveLength(1);
  await click('삭제 취소 · 최신 목표 유지');await click('확인하고 적용');await act(async()=>flush());
  expect(api.save).not.toHaveBeenCalled();expect(useGoalStore.getState().monthlyGoals[0].title).toBe(original.title);expect(useHabitStore.getState()).toBe(before);expect(goalSyncEntries('A')).toEqual([]);
});
test('구버전 삭제는 최신 버전으로 재확인하고 오늘부터 연결만 정리하며 로그를 보존한다',async()=>{
  await prepareDeletion(true);const logs=useHabitStore.getState().habitLogs;await mount();await click('최신 목표 확인 후 삭제');
  expect(host.querySelector('[role="dialog"]')?.textContent).toContain('2026-10-27');expect(host.querySelector('[role="dialog"]')?.textContent).toContain(original.title);
  await click('확인하고 적용');await act(async()=>flush());
  expect(api.save).toHaveBeenCalledWith('delete_monthly_goal_checked',expect.objectContaining({expected_revision:'remote',effective_date:'2026-10-27',request_id:expect.any(String)}));
  expect(useGoalStore.getState().monthlyGoals).toEqual([]);expect(useHabitStore.getState().habits[0].goalId).toBeUndefined();expect(useHabitStore.getState().habitLogs).toBe(logs);
});
test('삭제 재확인 사이 서버가 바뀌면 다시 멈추고 목표·연결을 유지한다',async()=>{
  await prepareDeletion();await mount();await click('최신 목표 확인 후 삭제');api.row={...api.row,revision:'newer',title:'새로운 이름'};
  await click('확인하고 적용');await act(async()=>flush());expect(goalSyncEntries('A')).toHaveLength(1);expect(api.row.title).toBe('새로운 이름');expect(useHabitStore.getState().habits[0].goalId).toBe('g');expect(host.textContent).toContain('새로운 이름');
});
test('이미 삭제된 목표는 재생성·추가 삭제 없이 대기 요청만 정리한다',async()=>{
  await prepareDeletion(true);api.row=null;await mount();expect(host.textContent).not.toContain('새 목표로 복사');await click('이미 삭제된 목표 정리');await click('확인하고 적용');await act(async()=>flush());
  expect(api.save).not.toHaveBeenCalled();expect(goalSyncEntries('A')).toEqual([]);expect(useGoalStore.getState().monthlyGoals).toEqual([]);
});
test('삭제 복구 요청을 보관하지 못하면 원래 요청·목표·연결을 유지한다',async()=>{
  await prepareDeletion();await mount();await click('최신 목표 확인 후 삭제');const before=useGoalStore.getState().monthlyGoals;
  const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});await click('확인하고 적용');spy.mockRestore();
  expect(api.save).not.toHaveBeenCalled();expect(goalSyncEntries('A')).toHaveLength(1);expect(useGoalStore.getState().monthlyGoals).toBe(before);expect(useHabitStore.getState().habits[0].goalId).toBe('g');
});
