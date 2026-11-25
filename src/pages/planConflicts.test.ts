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
import { personalRoutineToRow } from '../data/mappers';
import { clearOutbox, enqueue, flush, planSyncEntries, setOutboxOwner } from '../lib/sync/outbox';
import PlanConflicts from './PlanConflicts';
import type { PersonalRoutine, User } from '../types';
const original:PersonalRoutine={id:'bundle',userId:'',title:'다른 기기의 저녁',emoji:'🌱',when:'저녁 식사 후',habitIds:['h2','h1'],habitDurations:{h1:120,h2:180},timerEnabled:true,createdAt:'2026-10-01',revision:'remote'};
const mine:PersonalRoutine={...original,title:'내 저녁 묶음',habitIds:['h1','h2'],timerEnabled:false};
let host:HTMLDivElement,root:Root,router:ReturnType<typeof createMemoryRouter>;
async function click(label:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label);expect(button,label).toBeDefined();await act(async()=>button!.click());}
async function mount(){router=createMemoryRouter([{path:'/plans/conflicts',element:h(PlanConflicts)},{path:'/goals',element:h('p',null,'목표 관리')}],{initialEntries:['/plans/conflicts']});await act(async()=>root.render(h(RouterProvider,{router})));}
beforeEach(async()=>{
  vi.clearAllMocks();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
  localStorage.clear();clearOutbox();setOutboxOwner('A');api.owner='A';useAuthStore.setState({user:{id:'A'} as User});
  api.row={...personalRoutineToRow(original),revision:'remote',user_id:'A'};api.read.mockImplementation(async()=>({data:api.row,error:null}));
  api.save.mockImplementation(async(_fn:string,args:Record<string,unknown>)=>{
    if(!args.creating&&api.row?.revision!==args.expected_revision)return {data:{status:api.row?'conflict':'deleted',current:api.row},error:null};
    api.row=args.deleting?null:{...args.item_values as object,id:args.item_id,revision:args.request_id,user_id:'A'};
    return {data:{status:'saved',current:api.row},error:null};
  });
  useGoalStore.setState({monthlyGoals:[],weeklyGoals:[]});useRoutineStore.setState({faithRoutines:[],personalRoutines:[],logs:[]});
  useHabitStore.setState({habits:['h1','h2'].map(id=>({id,userId:'',title:id==='h1'?'산책':'독서',emoji:'',when:'',frequency:'daily',createdAt:'2026-10-01'})),habitLogs:[{habitId:'h1',date:'2026-10-26',completed:true}],personalRoutines:[mine]});
  enqueue({type:'upsert',table:'personal_routines',values:personalRoutineToRow(mine)});await flush();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());router?.dispose();host.remove();clearOutbox();vi.restoreAllMocks();});
test('묶음 순서·타이머 비교 후 선택 적용하고 기존 습관·로그는 그대로 둔다',async()=>{
  const before=useHabitStore.getState();await mount();expect(host.textContent).toContain('1. 독서');expect(host.textContent).toContain('1. 산책');expect(host.textContent).toContain('타이머 꺼짐');
  await click('내 입력 적용');await click('취소');expect(api.save).not.toHaveBeenCalled();await click('내 입력 적용');await click('확인하고 적용');await act(async()=>flush());
  expect(api.save).toHaveBeenCalledWith('save_plan',expect.objectContaining({expected_revision:'remote',creating:false,deleting:false,item_values:expect.objectContaining({title:mine.title,habit_ids:['h1','h2']})}));
  expect(useHabitStore.getState().habits).toBe(before.habits);expect(useHabitStore.getState().habitLogs).toBe(before.habitLogs);expect(planSyncEntries('A')).toEqual([]);
});
test('확인 사이 서버가 바뀌면 재충돌하고 남긴 입력을 유지한다',async()=>{
  await mount();await click('내 입력 적용');api.row={...api.row,revision:'newer',title:'또 바뀐 묶음'};await click('확인하고 적용');await act(async()=>flush());
  expect(planSyncEntries('A')).toHaveLength(1);expect(host.textContent).toContain('또 바뀐 묶음');expect(host.textContent).toContain(mine.title);
});
test('삭제된 묶음은 새 ID로 복사하며 표시한 연결을 쓰고 습관·로그는 복제하지 않는다',async()=>{
  api.row=null;const before=useHabitStore.getState();await mount();await click('새 항목으로 복사');await click('확인하고 적용');await act(async()=>flush());
  const next=useHabitStore.getState();expect(next.personalRoutines[0].id).not.toBe('bundle');expect(next.personalRoutines[0].habitIds).toEqual(['h1','h2']);expect(next.habits).toBe(before.habits);expect(next.habitLogs).toBe(before.habitLogs);
});
test('서버 선택은 원격 쓰기 없이 정리하고 삭제 재확인은 최신 버전으로만 보낸다',async()=>{
  await mount();await click('서버 내용 사용');await click('확인하고 적용');await act(async()=>flush());expect(api.save).not.toHaveBeenCalled();expect(useHabitStore.getState().personalRoutines[0].title).toBe(original.title);
  await act(async()=>{enqueue({type:'delete',table:'personal_routines',match:{id:'bundle'}});await flush();});await click('확인한 버전으로 삭제');await click('확인하고 적용');await act(async()=>flush());
  expect(api.save).toHaveBeenCalledWith('save_plan',expect.objectContaining({expected_revision:'remote',deleting:true}));expect(useHabitStore.getState().personalRoutines).toEqual([]);expect(useHabitStore.getState().habits).toHaveLength(2);expect(useHabitStore.getState().habitLogs).toHaveLength(1);
});
test('조회 실패·복구 보관 실패는 기존 입력을 유지한다',async()=>{
  api.read.mockRejectedValueOnce(new Error('offline'));await mount();expect(host.querySelector('[role="alert"]')?.textContent).toContain('기기에 남아');await click('서버 내용 다시 불러오기');await click('내 입력 적용');
  const before=useHabitStore.getState().personalRoutines;const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});await click('확인하고 적용');spy.mockRestore();
  expect(useHabitStore.getState().personalRoutines).toBe(before);expect(planSyncEntries('A')).toHaveLength(1);expect(api.save).not.toHaveBeenCalled();
});
test('다른 탭 입력과 계정 전환은 이전 확인을 무효화하고 계정별로 보관한다',async()=>{
  await mount();await click('내 입력 적용');await act(async()=>{enqueue({type:'update',table:'personal_routines',match:{id:'bundle'},values:{title:'다른 탭 입력'}});await flush();});await click('확인하고 적용');expect(api.save).not.toHaveBeenCalled();
  await act(async()=>{api.owner='B';setOutboxOwner('B');useAuthStore.setState({user:{id:'B'} as User});});expect(host.textContent).not.toContain(mine.title);expect(planSyncEntries('A')).toHaveLength(2);
});
