import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const remote = vi.hoisted(()=>({create:vi.fn(),read:vi.fn()}));
vi.mock('../data/repos',()=>({upsertHabit:vi.fn(),upsertMonthlyGoal:vi.fn(),upsertRoutine:vi.fn()}));
vi.mock('../data/groupRepos',()=>({createGroupRemote:remote.create,readGroupCreation:remote.read}));
vi.mock('../lib/queryClient',()=>({queryClient:{invalidateQueries:vi.fn()}}));
vi.mock('../lib/sync/outbox',()=>({completeHeldGroupCreation:()=>true,heldMembershipRequests:()=>[],pendingRecordIds: () => [], pendingPlanIds: () => [], pendingGoalDeletionIds:()=>[]}));
vi.mock('../lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'A'},access_token:'token-A'}}})}}}));
vi.mock('../store/authStore',async()=>{const {create}=await import('zustand');return {useAuthStore:create(()=>({user:{id:'A'}}))};});
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { useGroupStore } from '../store/groupStore';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { readDraft } from '../lib/localDrafts';
import { isGroupDraft } from '../utils/groupDraft';
import { isHabitDraft } from '../utils/formDrafts';
import GroupNew from './GroupNew';
import GoalConnect from './GoalConnect';
import HabitNew from './HabitNew';
import FaithRoutineNew from './FaithRoutineNew';
import MonthlyGoalNew from './MonthlyGoalNew';
import type { MonthlyGoal, User } from '../types';
const gid='11111111-1111-4111-8111-111111111111',planId='22222222-2222-4222-8222-222222222222';
const goal:MonthlyGoal={id:gid,userId:'',title:'걷는 사람',toBeStatement:'걷는 사람',month:10,year:2026,startDate:'2026-10-27',endDate:'2026-11-25',status:'active',category:'personal',createdAt:'2026-10-27',goalRoutines:[{id:planId,title:'점심 산책',when:'점심 후',where:'회사 앞'}]};
let root:Root, host:HTMLDivElement,router:ReturnType<typeof createMemoryRouter>;
async function mount(path:string){router=createMemoryRouter([
 {path:'/groups/new',element:h(GroupNew)},{path:'/groups/:id',element:h('p',null,'모임 생성 완료')},{path:'/groups',element:h('p',null,'모임 목록')},
 {path:'/goals/:id/connect',element:h(GoalConnect)},{path:'/habits/new',element:h(HabitNew)},{path:'/faith-routines/new',element:h(FaithRoutineNew)},
 {path:'/goals/monthly/new',element:h(MonthlyGoalNew)},{path:'/goals',element:h('p',null,'목표 목록')},{path:'/',element:h('p',null,'홈')}
 ],{initialEntries:[path]});await act(async()=>root.render(h(RouterProvider,{router})));}
async function reopen(path:string){await act(async()=>root.unmount());router.dispose();root=createRoot(host);await mount(path);}
async function click(label:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')===label);expect(b).toBeDefined();await act(async()=>b!.click());}
async function fill(label:string,value:string){const el=host.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[aria-label="${label}"]`)!;expect(el).not.toBeNull();await act(async()=>{Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-27T12:00:00'));vi.clearAllMocks();localStorage.clear();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(navigator,'onLine',{value:true,configurable:true});useAuthStore.setState({user:{id:'A'} as User});useUIStore.setState({dataHydrated:true});useGroupStore.setState({groups:[],myGroupIds:[],creationStatus:{}});useGoalStore.setState({monthlyGoals:[goal],weeklyGoals:[]});useHabitStore.setState({habits:[],habitLogs:[],personalRoutines:[]});useRoutineStore.setState({faithRoutines:[],personalRoutines:[],logs:[]});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());router.dispose();host.remove();vi.useRealTimers();vi.restoreAllMocks();});

test('생성 요청 유실 뒤 새로 열면 같은 ID·시점의 초안을 복원하고 복구 완료 후만 이동한다',async()=>{
 remote.create.mockRejectedValue(new Error('lost'));remote.read.mockRejectedValue(new Error('read lost'));
 await mount('/groups/new');await fill('소모임 이름','산책 친구');await fill('소모임 목표','매일 걷기');await click('다음');await click('소모임 만들기');
 const draft=readDraft('A','group:new',isGroupDraft)!;expect(draft.values.attemptedAt).toBeDefined();expect(useGroupStore.getState().groups).toEqual([]);expect(router.state.location.pathname).toBe('/groups/new');
 await reopen('/groups/new');expect(host.textContent).not.toContain('초안 버리기');await click('초안 복원');expect(host.querySelector('fieldset')?.disabled).toBe(true);
 remote.create.mockResolvedValue(undefined);remote.read.mockResolvedValue({joined:true,group:{id:draft.values.entityId,title:'산책 친구',creatorId:'A'}});
 await click('같은 요청 확인·복구');expect(remote.create.mock.calls[0]).toEqual(remote.create.mock.calls[1]);expect(readDraft('A','group:new',isGroupDraft)).toBeNull();expect(router.state.location.pathname).toBe(`/groups/${draft.values.entityId}`);
});

test('전송 전 오프라인·기기 보관 실패는 생성 요청을 보내지 않는다',async()=>{
 await mount('/groups/new');await fill('소모임 이름','오프라인');await fill('소모임 목표','복원');await click('다음');Object.defineProperty(navigator,'onLine',{value:false,configurable:true});await click('소모임 만들기');expect(remote.create).not.toHaveBeenCalled();
 Object.defineProperty(navigator,'onLine',{value:true,configurable:true});vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('full');});await click('소모임 만들기');expect(remote.create).not.toHaveBeenCalled();
});

test('새 목표 저장 직후 실제 습관을 선택할 연결 화면을 보여준다',async()=>{
 await mount('/goals/monthly/new');await fill('되고 싶은 모습','새 목표');await click('목표 시작하기');expect(router.state.location.pathname).toMatch(/connect$/);expect(host.textContent).toContain('목표는 저장됐어요');expect(host.textContent).toContain('기존 습관 연결');
});

test('기존 습관 연결은 현재 목표만 붙이고 다른 목표의 습관을 가져오지 않는다',async()=>{
 useHabitStore.setState({habits:[{id:'h',userId:'',title:'산책',emoji:'',when:'점심',frequency:'daily',createdAt:'2026-10-01'},{id:'other',userId:'',title:'독서',emoji:'',when:'',frequency:'daily',createdAt:'2026-10-01',goalId:'other-goal'}]});
 await mount(`/goals/${gid}/connect`);expect([...host.querySelectorAll('button')].find(b=>b.textContent?.includes('독서'))?.disabled).toBe(true);await click('산책');await click('선택한 습관 연결');expect(useHabitStore.getState().habits[0].goalId).toBe(gid);expect(useHabitStore.getState().habits[0].scheduleHistory).toBeDefined();expect(useHabitStore.getState().habits[1].goalId).toBe('other-goal');expect(host.textContent).toContain('연결된 습관 1개');
});

test.each(['personal','faith'] as const)('%s 목표에서 만든 실제 항목은 목표별 초안을 쓰고 저장 후 연결 결과로 돌아온다',async category=>{
 useGoalStore.setState({monthlyGoals:[{...goal,category}]});await mount(`/goals/${gid}/connect`);await click(category==='faith'?'새 신앙 루틴 만들기':'새 습관 만들기');
 const route=router.state.location.pathname+router.state.location.search;expect(route).toContain(`goal=${gid}`);const label=category==='faith'?'루틴 이름':'습관 이름';await fill(label,'계획에서 실제 실천으로');await reopen(route);await click('초안 복원');await click('시작하기');
 const items=category==='faith'?useRoutineStore.getState().faithRoutines:useHabitStore.getState().habits;expect(items).toHaveLength(1);expect(items[0]).toMatchObject({id:planId,goalId:gid,title:'계획에서 실제 실천으로',when:'점심 후 · 회사 앞'});expect(host.textContent).toContain('홈에서 실천하기');
});

test('일반 습관 초안과 목표별 초안을 섞지 않고 다른 계정의 목표 링크도 차단한다',async()=>{
 await mount('/habits/new');await fill('습관 이름','독립된 초안');const before=readDraft('A','habit:new',isHabitDraft);
 await reopen(`/habits/new?goal=${gid}`);expect(host.textContent).not.toContain('초안 복원');expect(host.querySelector<HTMLInputElement>('[aria-label="습관 이름"]')?.value).toBe('점심 산책');expect(readDraft('A','habit:new',isHabitDraft)).toEqual(before);
 await act(async()=>{useAuthStore.setState({user:{id:'B'} as User});useGoalStore.setState({monthlyGoals:[]});});expect(host.textContent).toContain('항목을 찾지 못했어요');
});
