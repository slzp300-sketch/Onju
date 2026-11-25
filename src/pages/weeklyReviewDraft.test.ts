import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import { format } from 'date-fns';
const mocks = vi.hoisted(() => ({ send: vi.fn(), base: vi.fn(), client: { bound: true } }));
vi.mock('../data/repos',()=>({upsertHabit:vi.fn(),upsertPersonalRoutine:vi.fn(),upsertRoutine:vi.fn(),upsertWeeklyGoal:vi.fn()}));
vi.mock('../api/reviews',()=>({sendReviewStep:mocks.send,readReviewBase:mocks.base}));
vi.mock('../lib/sync/outbox',()=>({flush:vi.fn(async()=>{}),pendingCount:()=>0}));
vi.mock('../lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'A'},access_token:'token-A'}},error:null})}},supabaseForSession:()=>mocks.client}));
vi.mock('../hooks/useBlockedUsers',()=>({useBlockedUsers:()=>({data:[]})}));
vi.mock('../store/authStore',async()=>{const {create}=await import('zustand');return {useAuthStore:create(()=>({user:{id:'A'}}))};});
import { readReviewSubmission } from '../lib/reviewSubmission';
import ReviewRecoveryBanner from '../components/review/ReviewRecoveryBanner';
import WeeklyReviewPage from './WeeklyReviewPage';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { useGroupStore } from '../store/groupStore';
import { writeDraft, readDraft } from '../lib/localDrafts';
import { currentWeek,currentYear,getCurrentWeekRange } from '../utils/date';
import { isReviewDraft, type ReviewDraft } from '../utils/reviewDraft';
import type { User } from '../types';
const key=()=>`weekly-review:${currentYear()}:${currentWeek()}:${format(getCurrentWeekRange().start,'yyyy-MM-dd')}`;
const values: ReviewDraft={submissionIds:{review:'11111111-1111-4111-8111-111111111111'},step:3,mood:'normal',comment:'이번 주 회고',intention:'다음 주에도 꾸준히',routineChanges:[],habitChanges:[],shareToGroups:[]};
let root:Root,host:HTMLDivElement,router:ReturnType<typeof createMemoryRouter>,client:QueryClient;
async function click(text:string){const button=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===text);expect(button).toBeDefined();await act(async()=>button!.click());}
async function mount(){router=createMemoryRouter([{path:'/',element:h(ReviewRecoveryBanner)},{path:'/review/result/:weekKey',element:h('p',null,'저장 결과')},{path:'/review',element:h(WeeklyReviewPage)}],{initialEntries:['/','/review']});await act(async()=>root.render(h(QueryClientProvider,{client},h(RouterProvider,{router}))));}
beforeEach(()=>{vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-27T14:00:00'));vi.spyOn(window,'scrollTo').mockImplementation(()=>{});Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.clearAllMocks();mocks.send.mockReset();mocks.base.mockReset();mocks.base.mockResolvedValue(null);mocks.send.mockResolvedValue({status:'saved',current:{}});localStorage.clear();useAuthStore.setState({user:{id:'A'} as User});useUIStore.setState({dataHydrated:true});useHabitStore.setState({habits:[],habitLogs:[],personalRoutines:[]});useRoutineStore.setState({personalRoutines:[],faithRoutines:[],logs:[]});useGoalStore.setState({monthlyGoals:[],weeklyGoals:[]});useGroupStore.setState({groups:[]});client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());router.dispose();client.clear();host.remove();vi.useRealTimers();vi.restoreAllMocks();});

test('주간 리뷰 초안은 선택 전 입력을 막고 단계·본문을 복원하며 서버 실패 뒤에도 유지한다',async()=>{
  writeDraft('A',key(),values);await mount();expect(host.querySelector('fieldset')?.disabled).toBe(true);await click('초안 복원');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350));});
  expect(host.querySelector('textarea')?.value).toBe(values.intention);
  mocks.send.mockRejectedValueOnce(new Error('offline'));await click('리뷰 완료');
  expect(readDraft('A',key(),isReviewDraft)?.values.intention).toBe(values.intention);expect(router.state.location.pathname).toBe('/review');
  mocks.send.mockResolvedValueOnce({status:'saved',current:{}});await click('남은 항목 저장');
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
  expect(mocks.send.mock.calls[0][0].id).toBe(mocks.send.mock.calls[1][0].id);
  expect(mocks.send.mock.calls[1][1]).toBe(mocks.client);
  expect(readDraft('A',key(),isReviewDraft)).toBeNull();expect(router.state.location.pathname).toBe(`/review/result/${currentYear()}-${currentWeek()}`);
});

test('저장 응답 전에 계정이 바뀌면 이전 초안과 새 계정 화면을 건드리지 않는다',async()=>{
  writeDraft('A',key(),values);await mount();await click('초안 복원');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350));});
  let finish!:(value:unknown)=>void;mocks.send.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await click('리뷰 완료');
  await act(async()=>useAuthStore.setState({user:{id:'B'} as User}));await act(async()=>finish({status:'saved',current:{}}));
  expect(readDraft('A',key(),isReviewDraft)).not.toBeNull();expect(readDraft('B',key(),isReviewDraft)).toBeNull();expect(router.state.location.pathname).toBe('/review');expect(mocks.send).toHaveBeenCalledTimes(1);expect(readReviewSubmission('A')?.steps[0].status).toBe('pending');
});


test('목표 없는 습관과 홈의 루틴 묶음을 리뷰에 보여주고 추가 입력도 초안에 보관한다', async()=>{
  useHabitStore.setState({habits:[{id:'solo',userId:'',title:'점심 산책',emoji:'🌱',frequency:'daily',when:'',createdAt:'2026-01-01'},{id:'grouped',userId:'',title:'책 펴기',emoji:'📚',frequency:'daily',when:'',createdAt:'2026-01-01'}],personalRoutines:[{id:'bundle',userId:'',title:'퇴근 루틴',emoji:'🌱',when:'',habitIds:['grouped'],timerEnabled:false,createdAt:'2026-01-01'}],habitLogs:['solo','grouped'].flatMap(habitId=>['2026-10-26','2026-10-27'].map(date=>({habitId,date,completed:true})))});
  writeDraft('A',key(),{...values,step:2});await mount();await click('초안 복원');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350));});
  expect(host.querySelector('section[aria-label="개별 습관"]')?.textContent).toContain('점심 산책');
  expect(host.querySelector('section[aria-label="퇴근 루틴"]')?.textContent).toContain('책 펴기');
  expect(host.textContent).toContain('모두 바로 적용');
  expect(host.querySelector('section[aria-label="개별 습관"]')?.textContent).toContain('100%');
  await click('새 개인 습관 추가');
  expect(host.querySelector<HTMLInputElement>('input[aria-label="습관 이름"]')?.value).toBe('');
  const saved=readDraft('A',key(),isReviewDraft)!.values;
  expect(saved.habitChanges).toEqual([expect.objectContaining({action:'add',newHabit:expect.objectContaining({title:'',frequency:'daily'})})]);
  expect(saved.routineChanges).toEqual([]);
  expect([...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='다음')?.disabled).toBe(true);
});

test('공유 실패 뒤 홈 안내·새로 열기로 복구하며 완료한 실천과 결산 스냅샷을 다시 보내지 않는다',async()=>{
  useHabitStore.setState({habits:[{id:'existing',userId:'',title:'완료한 습관',emoji:'🌱',frequency:'daily',when:'',createdAt:'2026-01-01'}],habitLogs:['2026-10-26','2026-10-27'].map(date=>({habitId:'existing',date,completed:true}))});
  useGroupStore.setState({groups:[{id:'group',title:'함께',creatorId:'A'} as never]});
  writeDraft('A',key(),{...values,submissionIds:{...values.submissionIds,group:'22222222-2222-4222-8222-222222222222'},shareToGroups:['group'],habitChanges:[{habitId:'added',action:'add',newHabit:{title:'작은 독서',emoji:'🌱',frequency:'daily',when:'퇴근 후'}}]});
  mocks.send.mockResolvedValueOnce({status:'saved',current:{}}).mockRejectedValueOnce(new Error('share offline'));
  await mount();await click('초안 복원');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350));});await click('리뷰 완료');
  expect(readReviewSubmission('A')!.steps[0].status).toBe('done');expect(host.textContent).toContain('1개 저장 완료');
  await click('홈으로');expect(host.textContent).toContain('이어서 저장할 주간 리뷰');
  await act(async()=>router.navigate('/review'));expect(host.textContent).toContain('남은 항목 저장');
  const before=mocks.send.mock.calls.length;
  await act(async()=>root.unmount());root=createRoot(host);await mount();
  expect(mocks.send).toHaveBeenCalledTimes(before);
  vi.setSystemTime(new Date('2026-10-28T14:00:00'));
  await click('남은 항목 저장');
  const calls=mocks.send.mock.calls.map(c=>c[0]);expect(calls.filter(s=>s.kind==='practice')).toHaveLength(1);
  expect(calls.filter(s=>s.kind==='share')[0].payload).toEqual(calls.filter(s=>s.kind==='share')[1].payload);
  expect(calls.at(-1).kind).toBe('review');expect(calls.at(-1).payload.values.personal_rate).toBe(100);
  expect(readReviewSubmission('A')).toBeNull();expect(readDraft('A',key(),isReviewDraft)).toBeNull();
});

test('충돌한 항목은 선택 전에 다음 요청을 막고 제외 선택도 확인 후에만 반영한다',async()=>{
  writeDraft('A',key(),{...values,habitChanges:[{habitId:'added',action:'add',newHabit:{title:'이번 독서',emoji:'🌱',frequency:'daily',when:''}}]});
  mocks.send.mockResolvedValueOnce({status:'conflict',current:{title:'다른 기기의 독서'}});
  await mount();await click('초안 복원');await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350));});await click('리뷰 완료');
  expect(mocks.send).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('다른 기기의 독서');
  expect([...host.querySelectorAll('button')].find(b=>b.textContent==='남은 항목 저장')?.disabled).toBe(true);
  await click('최신 상태 유지하고 이 항목 제외');
  expect(readReviewSubmission('A')!.steps[0].status).toBe('conflict');
  const confirm=[...document.querySelectorAll('button')].find(b=>b.textContent==='이 항목 제외')!;
  await act(async()=>confirm.click());
  expect(readReviewSubmission('A')!.steps[0].status).toBe('skipped');await click('남은 항목 저장');
  expect(mocks.send).toHaveBeenCalledTimes(2);expect(mocks.send.mock.calls[1][0].payload.values.application_results).toContainEqual({label:'습관 · 이번 독서',status:'skipped'});
});
