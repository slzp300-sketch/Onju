import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const remote = vi.hoisted(() => ({ change: vi.fn(), read: vi.fn(), cache: vi.fn(), invalidate: vi.fn(), detail:vi.fn(), membership:vi.fn() }));
vi.mock('../data/groupRepos', () => ({changeGroupStatusRemote:remote.change,readOwnedGroup:remote.read,readMembership:remote.membership}));
vi.mock('../api/groups',()=>({fetchGroupById:remote.detail,fetchGroupMembers:async()=>[]}));
vi.mock('../api/reviews',()=>({fetchWeeklyShares:async()=>[]}));
vi.mock('../hooks/useBlockedUsers',()=>({useBlockedUsers:()=>({data:[]})}));
vi.mock('../lib/queryClient', () => ({queryClient:{cancelQueries:async()=>{},setQueryData:remote.cache,invalidateQueries:remote.invalidate}}));
vi.mock('../lib/supabase', () => ({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'A'},access_token:'token-A'}}})}},supabaseForSession:vi.fn()}));
vi.mock('../store/authStore', async () => {const {create}=await import('zustand');return {useAuthStore:create(()=>({user:{id:'A'}}))};});
import { useAuthStore } from '../store/authStore';
import { useGroupStore } from '../store/groupStore';
import { heldGroupStatusRequests, clearOutbox, setOutboxOwner, enqueue, flush } from '../lib/sync/outbox';
import GroupManagement from '../components/groups/GroupManagement';
import GroupDetail from './GroupDetail';
import type { SmallGroup, User } from '../types';
const group:SmallGroup={id:'g',creatorId:'A',title:'함께 걷기',goal:'걷기',startDate:'2026-10-01',endDate:'2099-12-31',maxMembers:6,currentMemberCount:2,status:'recruiting',isPublic:true,createdAt:''};
let host:HTMLDivElement,root:Root;
function Screen(){const g=useGroupStore(s=>s.groups.find(g=>g.id==='g'));return h(MemoryRouter,null,h('p',null,g?.status),h(GroupManagement,{groupId:'g',group:g}));}
const buttons=()=>[...document.querySelectorAll('button')];
function button(label:string){const b=buttons().find(b=>b.textContent?.trim()===label);expect(b).toBeDefined();return b!;}
async function click(label:string){await act(async()=>button(label).click());}
async function mount(){await act(async()=>root.render(h(Screen)));}
beforeEach(()=>{
  vi.clearAllMocks();vi.restoreAllMocks();localStorage.clear();clearOutbox();setOutboxOwner('A');
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(navigator,'onLine',{value:true,configurable:true});
  useAuthStore.setState({user:{id:'A'} as User});useGroupStore.setState({groups:[group],myGroupIds:['g'],membershipStatus:{},creationStatus:{},statusChanges:{}});
  remote.change.mockResolvedValue(undefined);remote.read.mockResolvedValue({...group,status:'active'});
  remote.detail.mockResolvedValue(group);remote.membership.mockResolvedValue({joined:true,group});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();clearOutbox();vi.restoreAllMocks();});

test('실제 소모임 상세 라우트에서 방장 관리 버튼과 확인창에 접근할 수 있다',async()=>{
  const client=new QueryClient({defaultOptions:{queries:{retry:false}}});
  await act(async()=>root.render(h(QueryClientProvider,{client},h(MemoryRouter,{initialEntries:['/groups/g']},h(Routes,null,h(Route,{path:'/groups/:id',element:h(GroupDetail)}))))));
  await click('모집 마감하고 시작하기');expect(document.body.textContent).toContain('추가 참여를 마감하고');await click('취소');
  expect(remote.change).not.toHaveBeenCalled();await act(async()=>root.unmount());root=createRoot(host);client.clear();
});

test('마감 확인 취소는 요청하지 않고 서버 거절은 기존 상태·인원을 유지한 뒤 재시도한다',async()=>{
  await mount();await click('모집 마감하고 시작하기');expect(document.body.textContent).toContain('되돌릴 수 없어요');await click('취소');expect(remote.change).not.toHaveBeenCalled();
  remote.change.mockRejectedValueOnce({code:'P0001',message:'거절'});remote.read.mockResolvedValueOnce(group);
  await click('모집 마감하고 시작하기');await click('마감하고 시작');expect(useGroupStore.getState().groups[0]).toEqual(group);expect(host.textContent).toContain('상태를 변경하지 못했어요');
  expect(heldGroupStatusRequests('A')).toEqual([]);expect(button('모집 마감하고 시작하기').disabled).toBe(false);
  await click('모집 마감하고 시작하기');await click('마감하고 시작');expect(host.textContent).toContain('소모임 종료하기');
  expect(remote.change).toHaveBeenLastCalledWith('g','active','recruiting','token-A');expect(remote.cache).toHaveBeenLastCalledWith(['group','g'],{...group,status:'active'});
});

test('종료 응답·조회 유실 후 재마운트해도 자동 재전송하지 않고 조회로 완료를 복구한다',async()=>{
  useGroupStore.setState({groups:[{...group,status:'active'}]});remote.change.mockRejectedValueOnce(new Error('lost'));remote.read.mockRejectedValueOnce(new Error('read lost'));
  await mount();await click('소모임 종료하기');await click('종료하기');expect(button('소모임 종료하기').disabled).toBe(true);
  expect(useGroupStore.getState().groups[0].status).toBe('active');expect(heldGroupStatusRequests('A')).toHaveLength(1);
  await act(async()=>root.unmount());useGroupStore.setState({statusChanges:{}});root=createRoot(host);await mount();
  expect(button('소모임 종료하기').disabled).toBe(true);await flush();expect(remote.change).toHaveBeenCalledOnce();
  remote.read.mockResolvedValue({...group,status:'completed'});await click('현재 운영 상태 확인');expect(useGroupStore.getState().groups[0].status).toBe('completed');expect(heldGroupStatusRequests('A')).toEqual([]);
  expect(buttons().some(b=>b.textContent==='소모임 종료하기')).toBe(false);expect(remote.change).toHaveBeenCalledOnce();
});

test('중복 클릭과 확인 전 후속 변경을 막으며 유실된 성공 응답은 서버 조회로 복구한다',async()=>{
  let finish!:()=>void;remote.change.mockImplementationOnce(()=>new Promise<void>(r=>{finish=r;}));
  const request=useGroupStore.getState().setGroupStatus('g','active','recruiting');await vi.waitFor(()=>expect(remote.change).toHaveBeenCalledOnce());
  expect(useGroupStore.getState().groups[0].status).toBe('recruiting');expect(await useGroupStore.getState().setGroupStatus('g','completed','active')).toBe(false);finish();expect(await request).toBe(true);
  remote.change.mockRejectedValue(new Error('lost'));remote.read.mockResolvedValue({...group,status:'completed'});
  expect(await useGroupStore.getState().setGroupStatus('g','completed','active')).toBe(true);expect(useGroupStore.getState().groups[0].status).toBe('completed');expect(heldGroupStatusRequests('A')).toEqual([]);
});

test('통신 유실 직후 이전 상태가 읽히면 잠금을 유지하고 명시적인 재조회 후 재시도할 수 있다',async()=>{
  remote.change.mockRejectedValue(new Error('lost'));remote.read.mockResolvedValue(group);
  expect(await useGroupStore.getState().setGroupStatus('g','active','recruiting')).toBe(false);expect(useGroupStore.getState().statusChanges.g.phase).toBe('unknown');expect(heldGroupStatusRequests('A')).toHaveLength(1);
  expect(await useGroupStore.getState().setGroupStatus('g','active','recruiting')).toBe(false);expect(remote.change).toHaveBeenCalledOnce();
  expect(await useGroupStore.getState().refreshGroupStatus('g')).toBe(true);expect(heldGroupStatusRequests('A')).toEqual([]);
});

test.each([false,true])('계정 전환·같은 계정 재로그인(%s) 뒤 이전 완료는 화면과 보관 요청을 지우지 않는다',async returnToA=>{
  let finish!:(g:SmallGroup)=>void;remote.read.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));
  const request=useGroupStore.getState().setGroupStatus('g','active','recruiting');await vi.waitFor(()=>expect(remote.read).toHaveBeenCalledOnce());
  useAuthStore.setState({user:{id:'B'} as User});useGroupStore.setState({groups:[],myGroupIds:[],statusChanges:{}});setOutboxOwner('B');
  if(returnToA){useAuthStore.setState({user:{id:'A'} as User});setOutboxOwner('A');}
  finish({...group,status:'active'});expect(await request).toBe(false);expect(useGroupStore.getState().groups).toEqual([]);expect(remote.cache).not.toHaveBeenCalled();expect(heldGroupStatusRequests('A')).toHaveLength(1);
});

test('오프라인·기기 보관 실패·세션 불일치에서는 상태 변경 요청을 보내지 않는다',async()=>{
  Object.defineProperty(navigator,'onLine',{value:false,configurable:true});await useGroupStore.getState().setGroupStatus('g','active','recruiting');expect(remote.change).not.toHaveBeenCalled();
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true});useGroupStore.setState({statusChanges:{}});
  const original=Storage.prototype.setItem;vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,k,v){if(k.startsWith('onju-outbox:item:'))throw new Error('full');original.call(this,k,v);});
  await useGroupStore.getState().setGroupStatus('g','active','recruiting');expect(remote.change).not.toHaveBeenCalled();expect(useGroupStore.getState().statusChanges.g.phase).toBe('unknown');vi.restoreAllMocks();
  useAuthStore.setState({user:{id:'B'} as User});useGroupStore.setState({statusChanges:{}});setOutboxOwner('B');await useGroupStore.getState().setGroupStatus('g','active','recruiting');expect(remote.change).not.toHaveBeenCalled();
});

test('구버전 낙관적 완료 표시를 서버 상태로 복구하고 이전 종료 요청을 자동 실행하지 않는다',async()=>{
  enqueue({type:'update',table:'small_groups',match:{id:'g'},values:{status:'completed'}});useGroupStore.setState({groups:[{...group,status:'completed'}]});
  remote.read.mockResolvedValue({...group,status:'active'});await mount();expect(host.textContent).toContain('이전에 보류된 상태 변경');await click('현재 운영 상태 확인');
  expect(host.textContent).toContain('소모임 종료하기');expect(heldGroupStatusRequests('A')).toEqual([]);expect(remote.change).not.toHaveBeenCalled();
});

test('이미 확인한 화면에 다른 탭의 새 보류 요청이 생겨도 다시 확인할 수 있다',async()=>{
  useGroupStore.setState({statusChanges:{g:{requestId:1,phase:'success',message:'확인 완료'}}});await mount();
  await act(async()=>enqueue({type:'update',table:'small_groups',match:{id:'g'},values:{status:'completed'}}));
  expect(button('현재 운영 상태 확인').disabled).toBe(false);expect(button('모집 마감하고 시작하기').disabled).toBe(true);
});

test('더 진행된 서버 상태 또는 방장 권한 상실을 되돌리지 않는다',async()=>{
  remote.change.mockRejectedValue({code:'P0001',message:'상태가 바뀌었어요'});remote.read.mockResolvedValue({...group,status:'completed'});
  expect(await useGroupStore.getState().setGroupStatus('g','active','recruiting')).toBe(false);expect(useGroupStore.getState().groups[0].status).toBe('completed');
  remote.read.mockResolvedValue(undefined);expect(await useGroupStore.getState().refreshGroupStatus('g')).toBe(false);expect(useGroupStore.getState().groups).toEqual([]);expect(remote.cache).toHaveBeenLastCalledWith(['group','g'],null);
});
