import { expect, test, vi } from 'vitest';
const m=vi.hoisted(()=>({eq:vi.fn(),rows:[] as unknown[]}));
vi.mock('../lib/supabase',()=>{const builder={select:()=>builder,abortSignal:()=>builder,eq:(...args:unknown[])=>{m.eq(...args);return builder;},then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:m.rows,error:null}).then(resolve)};return {supabase:{from:()=>builder},supabaseForSession:vi.fn()};});
vi.mock('../lib/sync/outbox',()=>({enqueue:vi.fn()}));
import { listMyGroups, listUnfinishedGroupCreations } from './groupRepos';
test('내 소모임 조회는 공개 모임의 다른 회원 행을 포함하지 않도록 사용자 ID를 필터링한다',async()=>{await listMyGroups('owner-A');expect(m.eq).toHaveBeenCalledWith('user_id','owner-A');});

test('로컬 큐가 없어도 본인 소유 모임 중 방장 등록이 누락된 항목만 복구 대상으로 찾는다',async()=>{
 m.rows=[{id:'done',title:'정상',group_members:[{user_id:'owner-A',role:'creator'}]},{id:'missing',title:'누락',group_members:[]},{id:'wrong-role',title:'역할 누락',group_members:[{user_id:'owner-A',role:'member'}]}];
 expect(await listUnfinishedGroupCreations('owner-A')).toEqual([{groupId:'missing',title:'누락'},{groupId:'wrong-role',title:'역할 누락'}]);expect(m.eq).toHaveBeenCalledWith('creator_id','owner-A');
});
