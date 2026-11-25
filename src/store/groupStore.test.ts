import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ create: vi.fn(), creation: vi.fn(), complete: vi.fn(() => true), change: vi.fn(), read: vi.fn(), held: vi.fn((): {groupId:string}[]=>[]), invalidate: vi.fn() }));
vi.mock('../data/groupRepos',()=>({changeMembershipRemote:mocks.change,readMembership:mocks.read,createGroupRemote:mocks.create,readGroupCreation:mocks.creation,updateGroupStatus:vi.fn()}));
vi.mock('../lib/queryClient',()=>({queryClient:{invalidateQueries:mocks.invalidate}}));
vi.mock('../lib/sync/outbox',()=>({heldMembershipRequests:mocks.held,completeHeldGroupCreation:mocks.complete}));
vi.mock('./authStore',async()=>{const {create}=await import('zustand');return {useAuthStore:create(()=>({user:{id:'A'}}))};});
vi.mock('../lib/supabase',()=>({supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'A'},access_token:'token-A'}},error:null})}}}));
import { useGroupStore } from './groupStore';
import { useAuthStore } from './authStore';
import type { SmallGroup, User } from '../types';
const group:SmallGroup={id:'g',creatorId:'other',title:'산책',goal:'매일',startDate:'2026-10-01',endDate:'2026-12-31',maxMembers:3,currentMemberCount:2,status:'recruiting',isPublic:true,createdAt:''};
beforeEach(()=>{vi.clearAllMocks();localStorage.clear();Object.defineProperty(navigator,'onLine',{value:true,configurable:true});useAuthStore.setState({user:{id:'A'} as User});useGroupStore.setState({groups:[],myGroupIds:[],membershipStatus:{},creationStatus:{}});mocks.held.mockReturnValue([]);mocks.change.mockResolvedValue(undefined);mocks.read.mockResolvedValue({joined:false});});

test('서버 확정 전에는 가입·인원 수를 바꾸지 않고 중복 클릭도 한 번만 보낸다',async()=>{
  let finish!:()=>void;mocks.change.mockImplementationOnce(()=>new Promise<void>(r=>{finish=r;}));mocks.read.mockResolvedValue({joined:true,group:{...group,currentMemberCount:3}});
  const first=useGroupStore.getState().joinGroup(group);await vi.waitFor(()=>expect(mocks.change).toHaveBeenCalledOnce());
  expect(useGroupStore.getState().myGroupIds).toEqual([]);expect(await useGroupStore.getState().joinGroup(group)).toBe(false);
  finish();expect(await first).toBe(true);expect(useGroupStore.getState().myGroupIds).toEqual(['g']);expect(useGroupStore.getState().groups[0].currentMemberCount).toBe(3);
  expect(mocks.change).toHaveBeenCalledWith('g',true,'token-A');expect(mocks.read).toHaveBeenCalledWith('g','A','token-A');
});

test('정원 초과 거절은 가입으로 표시하지 않고 정원 안내와 서버 재조회를 제공한다',async()=>{
  mocks.change.mockRejectedValue({code:'P0001',message:'정원이 가득 찼어요'});
  expect(await useGroupStore.getState().joinGroup(group)).toBe(false);expect(useGroupStore.getState().groups).toEqual([]);
  expect(useGroupStore.getState().membershipStatus.g).toMatchObject({phase:'error',message:expect.stringContaining('정원')});expect(mocks.invalidate).toHaveBeenCalled();
});

test('탈퇴가 거절되면 기존 참여 상태를 유지하고 다시 조회할 수 있다',async()=>{
  useGroupStore.setState({groups:[group],myGroupIds:['g']});mocks.change.mockRejectedValue({code:'P0001',message:'거절'});mocks.read.mockResolvedValue({joined:true,group});
  expect(await useGroupStore.getState().leaveGroup('g')).toBe(false);expect(useGroupStore.getState().myGroupIds).toEqual(['g']);
  mocks.change.mockResolvedValue(undefined);mocks.read.mockResolvedValue({joined:false});expect(await useGroupStore.getState().leaveGroup('g')).toBe(true);expect(useGroupStore.getState().groups).toEqual([]);
});

test.each([true,false])('응답을 잃어도 서버가 원하는 참여 상태 %s이면 성공으로 복구한다',async join=>{
  useGroupStore.setState({groups:join?[]:[group],myGroupIds:join?[]:['g']});mocks.change.mockRejectedValue(new Error('response lost'));mocks.read.mockResolvedValue({joined:join,group:join?group:undefined});
  expect(await useGroupStore.getState().changeMembership('g',join,group)).toBe(true);expect(useGroupStore.getState().myGroupIds.includes('g')).toBe(join);expect(useGroupStore.getState().membershipStatus.g).toBeUndefined();
});

test('오프라인·결과 조회 실패는 자동 재전송 없이 확인 대기로 두고 연결 후 서버 상태로 회복한다',async()=>{
  Object.defineProperty(navigator,'onLine',{value:false,configurable:true});await useGroupStore.getState().joinGroup(group);expect(mocks.change).not.toHaveBeenCalled();
  Object.defineProperty(navigator,'onLine',{value:true,configurable:true});mocks.read.mockRejectedValueOnce(new Error('offline'));await useGroupStore.getState().joinGroup(group);expect(useGroupStore.getState().myGroupIds).toEqual([]);expect(useGroupStore.getState().membershipStatus.g.phase).toBe('unknown');
  mocks.read.mockResolvedValue({joined:true,group});expect(await useGroupStore.getState().refreshMembership('g')).toBe(true);expect(useGroupStore.getState().myGroupIds).toEqual(['g']);expect(mocks.change).toHaveBeenCalledOnce();
});

test.each([false,true])('이전 요청의 응답은 계정 전환과 빠른 재로그인(%s) 뒤 상태를 덮어쓰지 않는다',async returnToA=>{
  let finish!:(v:unknown)=>void;mocks.read.mockImplementationOnce(()=>new Promise(r=>{finish=r;}));const request=useGroupStore.getState().joinGroup(group);await vi.waitFor(()=>expect(mocks.read).toHaveBeenCalledOnce());
  useAuthStore.setState({user:{id:'B'} as User});useGroupStore.setState({groups:[],myGroupIds:[],membershipStatus:{},creationStatus:{}});
  if(returnToA)useAuthStore.setState({user:{id:'A'} as User});
  finish({joined:true,group});expect(await request).toBe(false);expect(useGroupStore.getState().myGroupIds).toEqual([]);expect(mocks.invalidate).not.toHaveBeenCalled();
});

test('구버전 보류 요청이 있으면 새 요청부터 보내지 않는다',async()=>{mocks.held.mockReturnValue([{groupId:'g'}]);expect(await useGroupStore.getState().joinGroup(group)).toBe(false);expect(mocks.change).not.toHaveBeenCalled();expect(useGroupStore.getState().membershipStatus.g.phase).toBe('unknown');});


test('모임 정보만 저장된 상태는 성공으로 표시하지 않고 같은 ID로 방장 등록을 복구한다',async()=>{
  mocks.create.mockRejectedValueOnce(new Error('partial'));mocks.creation.mockResolvedValueOnce({group:{...group,creatorId:'A'},joined:false});
  expect(await useGroupStore.getState().createGroup('g',{title:'산책'})).toBe(false);expect(useGroupStore.getState().myGroupIds).toEqual([]);expect(mocks.complete).not.toHaveBeenCalled();
  mocks.create.mockResolvedValue(undefined);mocks.creation.mockResolvedValue({group:{...group,creatorId:'A'},joined:true});
  expect(await useGroupStore.getState().createGroup('g',{title:'산책'})).toBe(true);expect(useGroupStore.getState().myGroupIds).toEqual(['g']);expect(mocks.create.mock.calls.map(c=>c[0])).toEqual(['g','g']);expect(mocks.complete).toHaveBeenCalledWith('A','g');
});

test('생성 응답 유실은 서버 확인으로 성공 처리하고 거절된 신규 생성만 편집을 허용한다',async()=>{
  mocks.create.mockRejectedValue(new Error('lost'));mocks.creation.mockResolvedValue({group:{...group,creatorId:'A'},joined:true});
  expect(await useGroupStore.getState().createGroup('g',{})).toBe(true);
  mocks.create.mockRejectedValue({code:'P0001',message:'invalid'});mocks.creation.mockResolvedValue({joined:false});
  expect(await useGroupStore.getState().createGroup('other',{})).toBe(false);expect(useGroupStore.getState().creationStatus.other).toMatchObject({phase:'error',canEdit:true});
});

test('생성 조회 실패·오프라인은 결과 미확인 상태로 보존하며 입력을 풀지 않는다',async()=>{
  mocks.create.mockResolvedValue(undefined);mocks.creation.mockRejectedValue(new Error('offline'));
  expect(await useGroupStore.getState().createGroup('g',{})).toBe(false);expect(useGroupStore.getState().creationStatus.g).toMatchObject({phase:'unknown',canEdit:false});expect(mocks.complete).not.toHaveBeenCalled();
  Object.defineProperty(navigator,'onLine',{value:false,configurable:true});await useGroupStore.getState().createGroup('g',{});expect(mocks.create).toHaveBeenCalledOnce();
});

test('생성 대기 중 중복 클릭과 빠른 계정 변경 뒤 지연 완료를 차단한다',async()=>{
  let finish!:()=>void;mocks.create.mockImplementationOnce(()=>new Promise<void>(r=>{finish=r;}));mocks.creation.mockResolvedValue({group,joined:true});
  const request=useGroupStore.getState().createGroup('g',{});await vi.waitFor(()=>expect(mocks.create).toHaveBeenCalledOnce());
  expect(await useGroupStore.getState().createGroup('g',{})).toBe(false);
  useGroupStore.setState({groups:[],myGroupIds:[],creationStatus:{}});finish();expect(await request).toBe(false);expect(useGroupStore.getState().myGroupIds).toEqual([]);expect(mocks.complete).not.toHaveBeenCalled();
});
