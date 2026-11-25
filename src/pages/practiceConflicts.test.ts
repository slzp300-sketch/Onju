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
import { habitToRow } from '../data/mappers';
import { clearOutbox, enqueue, flush, practiceSyncEntries, setOutboxOwner } from '../lib/sync/outbox';
import PracticeConflicts from './PracticeConflicts';
import type { Habit, User } from '../types';
const original:Habit={id:'h',userId:'',title:'서버에서 보관한 산책',emoji:'🌱',frequency:'weekdays',when:'점심',createdAt:'2026-10-01',revision:'remote',archivedAt:'2026-10-25',scheduleHistory:[{from:'2026-10-01',title:'옛 산책',frequency:'daily',active:true},{from:'2026-10-25',title:'서버에서 보관한 산책',frequency:'weekdays',active:false}]};
const mine:Habit={...original,title:'기기에 남긴 산책',frequency:'weekends',archivedAt:undefined,scheduleHistory:[]};
let host:HTMLDivElement,root:Root,router:ReturnType<typeof createMemoryRouter>;
async function click(label:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label);expect(button,label).toBeDefined();await act(async()=>button!.click());}
async function mount(){router=createMemoryRouter([{path:'/practices/conflicts',element:h(PracticeConflicts)},{path:'/goals',element:h('p',null,'목표 관리')}],{initialEntries:['/practices/conflicts']});await act(async()=>root.render(h(RouterProvider,{router})));}
beforeEach(async()=>{
  vi.clearAllMocks();vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-27T12:00:00'));Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  localStorage.clear();clearOutbox();setOutboxOwner('A');api.owner='A';useAuthStore.setState({user:{id:'A'} as User});
  api.row={...habitToRow(original),revision:'remote',user_id:'A'};api.read.mockImplementation(async()=>({data:api.row,error:null}));
  api.save.mockImplementation(async(_fn:string,args:Record<string,unknown>)=>{
    if(!args.creating&&api.row?.revision!==args.expected_revision)return {data:{status:api.row?'conflict':'deleted',current:api.row},error:null};
    api.row={...args.item_values as object,id:args.item_id,revision:args.request_id,user_id:'A'};return {data:{status:'saved',current:api.row},error:null};
  });
  useGoalStore.setState({monthlyGoals:[],weeklyGoals:[]});
  useHabitStore.setState({habits:[mine],habitLogs:[{habitId:'h',date:'2026-10-26',completed:true}],personalRoutines:[{id:'bundle',title:'묶음',userId:'',emoji:'',when:'',habitIds:['h'],timerEnabled:false,createdAt:'2026-10-01'}]});
  useRoutineStore.setState({faithRoutines:[],personalRoutines:[],logs:[]});
  enqueue({type:'upsert',table:'habits',values:habitToRow(mine)});await flush();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());router?.dispose();host.remove();clearOutbox();vi.useRealTimers();vi.restoreAllMocks();});


test('다른 기기의 보관을 비교하고 내 입력으로 오늘 복원해도 서버 과거 이력과 로그는 유지한다',async()=>{
  const logs=useHabitStore.getState().habitLogs;await mount();expect(host.textContent).toContain(original.title);expect(host.textContent).toContain(mine.title);
  await click('내 입력을 오늘부터 적용');expect(host.textContent).toContain('오늘부터 복원');await click('취소');expect(api.save).not.toHaveBeenCalled();
  await click('내 입력을 오늘부터 적용');await click('확인하고 적용');await act(async()=>flush());
  expect(api.save).toHaveBeenCalledWith('save_practice',expect.objectContaining({expected_revision:'remote',effective_date:'2026-10-27',creating:false,item_values:expect.objectContaining({title:mine.title,archived_at:null})}));
  expect(useHabitStore.getState().habits[0].scheduleHistory?.slice(0,2)).toEqual(original.scheduleHistory);expect(useHabitStore.getState().habitLogs).toBe(logs);expect(practiceSyncEntries('A')).toEqual([]);
});
test('확인 사이 서버가 또 바뀌면 재충돌하고 입력은 기기에 남는다',async()=>{
  await mount();await click('내 입력을 오늘부터 적용');api.row={...api.row,revision:'newer',title:'또 바뀐 서버'};await click('확인하고 적용');await act(async()=>flush());
  expect(practiceSyncEntries('A')).toHaveLength(1);expect(host.textContent).toContain('또 바뀐 서버');expect(host.textContent).toContain(mine.title);
});
test('서버에 없는 습관은 새 ID로 복사하고 기존 로그·묶음·목표를 자동 연결하지 않는다',async()=>{
  api.row=null;useHabitStore.setState({habits:[{...mine,goalId:'missing'}]});enqueue({type:'upsert',table:'habits',values:habitToRow({...mine,goalId:'missing'})});await flush();
  const before=useHabitStore.getState();await mount();await click('새 실천으로 복사');await click('확인하고 적용');await act(async()=>flush());
  const next=useHabitStore.getState();expect(next.habits[0].id).not.toBe('h');expect(next.habits[0].goalId).toBeUndefined();expect(next.habits[0].scheduleHistory).toBeUndefined();expect(next.habitLogs).toBe(before.habitLogs);expect(next.personalRoutines).toBe(before.personalRoutines);
});
test('서버 내용 선택은 확인 후 원격 쓰기 없이 반영하고 구버전 영구 삭제는 보관으로 바꾼다',async()=>{
  await mount();await click('서버 내용 사용');await click('취소');expect(practiceSyncEntries('A')).toHaveLength(1);
  await click('서버 내용 사용');await click('확인하고 적용');await act(async()=>flush());expect(api.save).not.toHaveBeenCalled();expect(useHabitStore.getState().habits[0].archivedAt).toBe('2026-10-25');
  await act(async()=>{enqueue({type:'delete',table:'habits',match:{id:'h'}});await flush();});expect(host.textContent).toContain('영구 삭제 대신 오늘부터 보관');
  await click('오늘부터 보관');await click('확인하고 적용');await act(async()=>flush());expect(api.save).toHaveBeenCalledWith('save_practice',expect.objectContaining({creating:false}));
});
test('조회 실패와 복구 요청 보관 실패는 기존 입력을 그대로 두고 재시도를 허용한다',async()=>{
  api.read.mockRejectedValueOnce(new Error('offline'));await mount();expect(host.querySelector('[role="alert"]')?.textContent).toContain('기기에 남아');
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='서버 내용 사용')?.disabled).toBe(true);await click('서버 내용 다시 불러오기');await click('내 입력을 오늘부터 적용');
  const before=useHabitStore.getState().habits;const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});await click('확인하고 적용');spy.mockRestore();
  expect(useHabitStore.getState().habits).toBe(before);expect(practiceSyncEntries('A')).toHaveLength(1);expect(api.save).not.toHaveBeenCalled();
});
test('계정 전환과 비교 후 다른 입력 변경은 이전 확인 적용을 막는다',async()=>{
  await mount();await click('내 입력을 오늘부터 적용');await act(async()=>{enqueue({type:'upsert',table:'habits',values:habitToRow({...mine,title:'추가 입력'})});await flush();});
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('바뀌');await click('확인하고 적용');expect(api.save).not.toHaveBeenCalled();
  await act(async()=>{api.owner='B';setOutboxOwner('B');useAuthStore.setState({user:{id:'B'} as User});});expect(host.textContent).not.toContain(mine.title);expect(practiceSyncEntries('A')).toHaveLength(2);
});
