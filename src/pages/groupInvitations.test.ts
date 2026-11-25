import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const api=vi.hoisted(()=>({list:vi.fn(),change:vi.fn(),preview:vi.fn(),accept:vi.fn(),membership:vi.fn(),invalidate:vi.fn()}));
vi.mock('../data/groupInvites',()=>({listGroupInvites:api.list,changeGroupInvite:api.change,previewGroupInvite:api.preview,acceptGroupInvite:api.accept,isInviteCode:(c:string)=>/^[a-f0-9]{32}$/i.test(c.replace(/[\s-]/g,''))}));
vi.mock('../data/groupRepos',()=>({readMembership:api.membership}));
vi.mock('../lib/queryClient',()=>({queryClient:{invalidateQueries:api.invalidate}}));
vi.mock('../lib/sync/outbox',()=>({heldMembershipRequests:()=>[]}));
vi.mock('../store/authStore',async()=>{const {create}=await import('zustand');return {useAuthStore:create(()=>({user:{id:'A'}}))};});
vi.mock('../lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'A'},access_token:'token-A'}}})}}}));
import { useGroupStore } from '../store/groupStore';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { readDraft, writeDraft } from '../lib/localDrafts';
import GroupInvites from '../components/groups/GroupInvites';
import GroupInviteJoin from './GroupInviteJoin';
import type { SmallGroup, User } from '../types';
const code='123456781234423482341234567890ab',gid='11111111-1111-4111-8111-111111111111';
const group:SmallGroup={id:gid,creatorId:'A',title:'비공개 산책',goal:'매일 걷기',startDate:'2026-10-27',endDate:'2099-12-31',maxMembers:6,currentMemberCount:1,status:'recruiting',isPublic:false,createdAt:''};
const preview={state:'available',groupId:gid,title:'비공개 산책',goal:'매일 걷기',rules:['서로 응원'],memberCount:1,maxMembers:6,endDate:'2099-12-31'};
let root:Root,host:HTMLDivElement,client:QueryClient,router:ReturnType<typeof createMemoryRouter>;
async function tick(){await act(async()=>new Promise(r=>setTimeout(r,15)));}
async function mount(path:string){router=createMemoryRouter([{path:'/manage',element:h(GroupInvites,{group})},{path:'/groups/invite',element:h(GroupInviteJoin)},{path:'/groups/:id',element:h('p',null,'참여 완료')},{path:'/groups',element:h('p',null,'목록')}],{initialEntries:[path]});await act(async()=>root.render(h(QueryClientProvider,{client},h(RouterProvider,{router}))));await tick();}
async function reopen(path:string){await act(async()=>root.unmount());router.dispose();client.clear();root=createRoot(host);await mount(path);}
function button(text:string){const b=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()===text);expect(b).toBeDefined();return b!;}
async function click(text:string){await act(async()=>button(text).click());await tick();}
async function fill(value=code){const input=host.querySelector<HTMLInputElement>('[aria-label="초대 코드"]')!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});Object.defineProperty(navigator,'onLine',{value:true,configurable:true});useAuthStore.setState({user:{id:'A'} as User});useUIStore.setState({dataHydrated:true});useGroupStore.setState({groups:[],myGroupIds:[],membershipStatus:{}});api.list.mockResolvedValue([]);api.change.mockResolvedValue(undefined);api.preview.mockResolvedValue(preview);api.accept.mockResolvedValue(undefined);api.membership.mockResolvedValue({joined:true,group});client=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{await act(async()=>root.unmount());router.dispose();client.clear();host.remove();vi.restoreAllMocks();});

test('발급 응답과 조회 유실 뒤 재마운트해도 같은 요청 ID로만 재시도한다',async()=>{
  await mount('/manage');api.change.mockRejectedValueOnce(new Error('lost'));api.list.mockRejectedValueOnce(new Error('read lost'));await click('1인용 초대 코드 만들기');
  const id=api.change.mock.calls[0][3];expect(button('1인용 초대 코드 만들기').disabled).toBe(true);
  await reopen('/manage');expect(host.textContent).toContain('확인이 필요한 초대 요청');expect(api.change).toHaveBeenCalledOnce();
  api.list.mockResolvedValue([{id,code,expires_at:'2099-01-01',revoked_at:null,redeemed_at:null}]);await click('같은 초대 요청 재시도');
  expect(api.change.mock.calls[1]).toEqual(api.change.mock.calls[0]);expect(host.textContent).toContain('코드 복사');expect(host.textContent).not.toContain('확인이 필요한 초대 요청');
});

test('초대 폐기 확인 취소와 응답 유실 뒤 폐기 확인, 복사 실패 수동 안내를 제공한다',async()=>{
  const row={id:'invite',code,expires_at:'2099-01-01',revoked_at:null,redeemed_at:null};api.list.mockResolvedValue([row]);await mount('/manage');
  Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:vi.fn().mockRejectedValue(new Error('denied'))}});await click('코드 복사');expect(host.textContent).toContain('직접 복사');
  await click('초대 폐기');await click('취소');expect(api.change).not.toHaveBeenCalled();
  api.change.mockRejectedValueOnce(new Error('lost'));api.list.mockResolvedValue([{...row,revoked_at:'2026-10-27'}]);await click('초대 폐기');await click('폐기하기');
  expect(host.textContent).toContain('폐기됨');expect(host.querySelector('input')).toBeNull();
});

test('가입 응답·조회 유실 후 초안을 복원하여 재전송 없이 실제 참여를 확인한다',async()=>{
  await mount('/groups/invite');await fill();await click('초대 확인');expect(host.textContent).toContain('비공개 산책');expect(api.accept).not.toHaveBeenCalled();
  api.accept.mockRejectedValueOnce(new Error('lost'));api.membership.mockRejectedValueOnce(new Error('read lost'));await click('약속 확인하고 참여하기');
  expect(host.querySelector<HTMLInputElement>('input')!.disabled).toBe(true);await reopen('/groups/invite');expect(host.textContent).not.toContain('초안 버리기');await click('초안 복원');await click('현재 참여 상태 확인');
  expect(router.state.location.pathname).toBe(`/groups/${gid}`);expect(api.accept).toHaveBeenCalledOnce();expect(useGroupStore.getState().myGroupIds).toContain(gid);
  expect(readDraft('A','group:invite-join',(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null)).toBeNull();
});

test('이미 가입한 코드는 서버 확인 후 모임으로 이동하고 가입 요청을 반복하지 않는다',async()=>{
  api.preview.mockResolvedValue({...preview,state:'joined'});await mount('/groups/invite');await fill();await click('초대 확인');await click('현재 참여 상태 확인');expect(api.accept).not.toHaveBeenCalled();expect(router.state.location.pathname).toBe(`/groups/${gid}`);
});

test.each(['expired','revoked','used','closed','full','invalid'])('%s 초대에는 가입 버튼을 제공하지 않는다',async state=>{
  api.preview.mockResolvedValue({state});await mount('/groups/invite');await fill();await click('초대 확인');expect(host.textContent).not.toContain('약속 확인하고 참여하기');expect(api.accept).not.toHaveBeenCalled();
});

test('가입 시 정원이 차면 입력을 풀고 최신 초대 상태와 재확인을 제공한다',async()=>{
  await mount('/groups/invite');await fill();await click('초대 확인');api.accept.mockRejectedValue({code:'P0001',message:'정원이 가득 찼어요'});api.membership.mockResolvedValue({joined:false});api.preview.mockResolvedValue({...preview,state:'full'});
  await click('약속 확인하고 참여하기');expect(useGroupStore.getState().myGroupIds).toEqual([]);expect(host.textContent).toContain('정원이 가득');expect(host.querySelector<HTMLInputElement>('input')!.disabled).toBe(false);
});

test('오프라인·기기 보관 실패는 새 발급과 가입 요청을 보내지 않는다',async()=>{
  await mount('/manage');Object.defineProperty(navigator,'onLine',{value:false,configurable:true});await click('1인용 초대 코드 만들기');expect(api.change).not.toHaveBeenCalled();
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true});await reopen('/groups/invite');await fill();await click('초대 확인');
  const set=Storage.prototype.setItem;vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,k,v){if(k.startsWith('onju-draft:'))throw new Error('full');set.call(this,k,v);});
  await click('약속 확인하고 참여하기');expect(api.accept).not.toHaveBeenCalled();expect(host.textContent).toContain('저장 공간');
});

test('계정 전환 뒤 지연된 초대 미리보기를 다른 계정에 표시하지 않는다',async()=>{
  let resolve!:(v:unknown)=>void;api.preview.mockImplementationOnce(()=>new Promise(r=>{resolve=r;}));await mount('/groups/invite');await fill();await click('초대 확인');
  await act(async()=>{useAuthStore.setState({user:{id:'B'} as User});resolve(preview);});expect(host.textContent).not.toContain('비공개 산책');
});

test('손상된 방장 요청 표시는 서버 조회가 성공한 뒤 명시적으로 정리할 수 있다',async()=>{
  writeDraft('A',`group:invites:${gid}`,{broken:true});await mount('/manage');expect(button('1인용 초대 코드 만들기').disabled).toBe(true);
  api.list.mockRejectedValueOnce(new Error('offline'));await click('기기 요청 표시 정리');expect(host.textContent).toContain('요청 표시를 유지');
  await click('기기 요청 표시 정리');expect(host.textContent).toContain('요청 표시를 정리했어요');expect(button('1인용 초대 코드 만들기').disabled).toBe(false);expect(api.change).not.toHaveBeenCalled();
});
