// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import initial from '../../supabase/migrations/0001_init.sql?raw';
import shares from '../../supabase/migrations/0005_routine_share_proofs.sql?raw';
import weekly from '../../supabase/migrations/0006_weekly_goal_targets.sql?raw';
import safety from '../../supabase/migrations/202610270001_mobile_community_safety.sql?raw';
import history from '../../supabase/migrations/202610270003_history_and_group_progress.sql?raw';
import connections from '../../supabase/migrations/202610270009_goal_connections.sql?raw';
import validation from '../../supabase/migrations/202610270010_goal_edit_validation.sql?raw';
import conflicts from '../../supabase/migrations/202610270011_goal_edit_conflicts.sql?raw';
import deletion from '../../supabase/migrations/202610270012_goal_delete_conflicts.sql?raw';
const db = new PGlite();
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
const gid='33333333-3333-4333-8333-333333333333', hid='44444444-4444-4444-8444-444444444444';
const r0='55555555-5555-4555-8555-555555555555', r1='66666666-6666-4666-8666-666666666666', r2='77777777-7777-4777-8777-777777777777';
const values={title:'꾸준한 나',start_date:'2026-10-01',end_date:'2026-10-31',category:'personal',status:'active',goal_routines:[{id:'plan',title:'산책'}],color:'#55966b'};
async function asUser(user:string,sql:string,args:unknown[]=[]) {
  await db.exec('begin; set local role authenticated;');
  try { await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]); const result=await db.query<Record<string,unknown>>(sql,args); await db.exec('commit'); return result.rows; }
  catch(error){await db.exec('rollback');throw error;}
}
async function save(request=r0,base:string|null=null,creating=true,patch={},owner=a,id=gid) {
  return (await asUser(owner,'select save_monthly_goal($1,$2,$3,$4,$5) as result',[request,id,base,creating,JSON.stringify({...values,...patch})]))[0].result as {status:string;current:Record<string,unknown>|null};
}
beforeAll(async()=>{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key,name text,public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    grant usage on schema public,auth,storage to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to authenticated,service_role;
    grant all on storage.objects to authenticated;`);
  for(const sql of [initial,shares,weekly,safety,history,connections,validation,conflicts,deletion]) await db.exec(sql);
},20000);
afterAll(async()=>db.close());
beforeEach(async()=>{await db.exec('truncate auth.users cascade');for(const id of [a,b])await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id[0]}@example.test`]);});

test('같은 기준 버전으로 편집한 두 기기 중 첫 저장만 반영하고 충돌 후 새 기준으로 재확인한다',async()=>{
  expect(await save()).toMatchObject({status:'saved',current:{revision:r0,month:10,year:2026,user_id:a}});
  expect(await save(r1,r0,false,{title:'기기 A',category:'faith'})).toMatchObject({status:'saved',current:{revision:r1,title:'기기 A'}});
  expect(await save(r2,r0,false,{title:'기기 B'})).toMatchObject({status:'conflict',current:{revision:r1,title:'기기 A',category:'faith'}});
  expect(await save(r2,r1,false,{title:'비교 후 B'})).toMatchObject({status:'saved',current:{revision:r2,title:'비교 후 B'}});
});
test('응답 유실 재시도는 이후 다른 기기 변경을 덮어쓰지 않고 같은 요청의 변조를 막는다',async()=>{
  await save();await save(r1,r0,false,{title:'첫 수정'});await save(r2,r1,false,{title:'이후 수정'});
  expect(await save(r1,r0,false,{title:'첫 수정'})).toMatchObject({status:'saved',current:{title:'이후 수정',revision:r2}});
  await expect(save(r1,r0,false,{title:'같은 요청 내용 변경'})).rejects.toThrow('같은 요청');
  expect((await db.query('select * from goal_save_receipts')).rows).toHaveLength(3);
});
test('삭제 후 오래된 편집·생성 응답 재시도는 목표나 연결을 되살리지 않는다',async()=>{
  await save();await remove(r1,r0);
  expect(await save(r1,r0,false)).toEqual({status:'deleted',current:null});
  expect(await save()).toEqual({status:'saved',current:null});
  expect((await db.query('select * from monthly_goals')).rows).toEqual([]);
});
test('기준 없는 구버전 편집은 충돌로 반환하고 직접 UPDATE·INSERT·영수증 쓰기를 차단한다',async()=>{
  await save();expect(await save(r1,null,false,{title:'오래된 초안'})).toMatchObject({status:'conflict',current:{title:values.title}});
  await expect(asUser(a,"update monthly_goals set title='우회' where id=$1",[gid])).rejects.toThrow('permission denied');
  await expect(asUser(a,"insert into monthly_goals(title,month,year,start_date,end_date) values('우회',10,2026,'2026-10-01','2026-10-31')")).rejects.toThrow('permission denied');
  await expect(asUser(a,'select * from goal_save_receipts')).rejects.toThrow('permission denied');
});
test('다른 계정·익명은 목표 내용을 읽거나 변경하지 못하고 사용자 필드는 서버가 고정한다',async()=>{
  await save();expect(await save(r1,r0,false,{},b)).toEqual({status:'deleted',current:null});
  await expect(save(r1,null,true,{},b)).rejects.toThrow();
  const other=await save(r1,null,true,{user_id:a,revision:r2,month:3,year:2001},b,hid);
  expect(other).toMatchObject({current:{user_id:b,revision:r1,month:10,year:2026}});
  expect((await db.query("select has_function_privilege('anon','public.save_monthly_goal(uuid,uuid,uuid,boolean,jsonb)','execute') as allowed")).rows).toEqual([{allowed:false}]);
  await expect(asUser('', 'select save_monthly_goal($1,$2,null,true,$3)',[r2,gid,JSON.stringify(values)])).rejects.toThrow('로그인');
});
test('저장 실패 시 버전·영수증도 함께 롤백하고 고친 요청은 저장할 수 있다',async()=>{
  await save();await expect(save(r1,r0,false,{end_date:'2026-09-30'})).rejects.toThrow();
  expect((await db.query('select revision from monthly_goals')).rows).toEqual([{revision:r0}]);
  expect((await db.query('select * from goal_save_receipts')).rows).toHaveLength(1);
  expect(await save(r1,r0,false,{end_date:'2026-11-30'})).toMatchObject({status:'saved',current:{revision:r1}});
});
test('충돌·해결 저장 모두 연결된 실천·일정 이력·완료 로그를 보존한다',async()=>{
  await save();await asUser(a,"insert into habits(id,title,goal_id,created_at) values($1,'산책',$2,'2026-10-01')",[hid,gid]);
  await asUser(a,"insert into habit_logs(habit_id,date,completed) values($1,'2026-10-15',true)",[hid]);
  const before=(await db.query('select to_jsonb(h) as item from habits h')).rows;const logs=(await db.query('select * from habit_logs')).rows;
  await save(r1,r0,false,{category:'faith',start_date:'2026-10-25'});await save(r2,r0,false);await save(r2,r1,false);
  expect((await db.query('select to_jsonb(h) as item from habits h')).rows).toEqual(before);expect((await db.query('select * from habit_logs')).rows).toEqual(logs);
});
test('관리자 직접 변경도 버전을 갱신하고 오래된 앱 저장은 충돌로 막는다',async()=>{
  await save();await db.query("update monthly_goals set description='관리자 수정' where id=$1",[gid]);
  const result=await save(r1,r0,false);expect(result.status).toBe('conflict');expect(result.current?.revision).not.toBe(r0);expect(result.current?.description).toBe('관리자 수정');
});

async function remove(request=r1,base:string|null=r0,owner=a,id=gid,date='2020-01-01',zone='Asia/Seoul') {
  return (await asUser(owner,'select delete_monthly_goal_checked($1,$2,$3,$4,$5) as result',[request,id,base,date,zone]))[0].result as {status:string;current:Record<string,unknown>|null;effective_date?:string|null};
}
test('오래된 삭제는 최신 목표·습관·로그를 유지하고 최신 버전 재확인 후에만 삭제한다',async()=>{
  await save();await asUser(a,"insert into habits(id,title,goal_id,created_at) values($1,'산책',$2,'2020-01-01')",[hid,gid]);
  await asUser(a,"insert into habit_logs(habit_id,date,completed) values($1,'2020-01-01',true)",[hid]);
  const before=(await db.query('select to_jsonb(h) as item from habits h')).rows;
  const logs=(await db.query('select * from habit_logs')).rows;
  await save(r2,r0,false,{title:'다른 기기의 수정'});
  expect(await remove()).toMatchObject({status:'conflict',current:{title:'다른 기기의 수정',revision:r2}});
  expect((await db.query('select to_jsonb(h) as item from habits h')).rows).toEqual(before);
  expect((await db.query('select * from goal_delete_receipts')).rows).toHaveLength(0);
  expect(await remove(r1,r2)).toEqual({status:'deleted',current:null,effective_date:'2020-01-01'});
  expect((await db.query('select goal_id from habits')).rows).toEqual([{goal_id:null}]);
  expect((await db.query('select * from habit_logs')).rows).toEqual(logs);
});
test('삭제 응답 유실 재시도는 멱등이며 동일 ID가 재생성돼도 새 목표를 지우지 않는다',async()=>{
  await save();const result=await remove();expect(await remove()).toEqual(result);
  await expect(remove(r1,r2)).rejects.toThrow('같은 요청');
  await save(r2,null,true,{title:'새로 만든 목표'});
  expect(await remove()).toMatchObject({status:'conflict',current:{title:'새로 만든 목표',revision:r2}});
  expect((await db.query('select * from goal_delete_receipts')).rows).toHaveLength(1);
});
test('없는 목표의 삭제 확인도 영수증을 남기고 이후 생성된 목표를 재시도에서 보호한다',async()=>{
  expect(await remove()).toEqual({status:'deleted',current:null,effective_date:null});await save();
  expect(await remove()).toMatchObject({status:'conflict',current:{revision:r0}});
});
test('구버전 RPC·직접 DELETE·영수증 접근을 차단하고 기준 없는 삭제는 비교로 보낸다',async()=>{
  await save();expect(await remove(r1,null)).toMatchObject({status:'conflict',current:{revision:r0}});
  await expect(asUser(a,'delete from monthly_goals where id=$1',[gid])).rejects.toThrow('permission denied');
  await expect(asUser(a,"select delete_monthly_goal_preserving_history($1,'2020-01-01')",[gid])).rejects.toThrow('permission denied');
  await expect(asUser(a,'select * from goal_delete_receipts')).rejects.toThrow('permission denied');
});
test('다른 계정의 삭제는 정보 노출·변경 없이 끝나고 익명·날짜·시간대 오류를 차단한다',async()=>{
  await save();expect(await remove(r1,r0,b)).toEqual({status:'deleted',current:null,effective_date:null});
  expect((await db.query('select revision from monthly_goals')).rows).toEqual([{revision:r0}]);
  await expect(remove(r1,r0,'')).rejects.toThrow('로그인');
  await expect(remove(r1,r0,a,gid,'9999-12-31')).rejects.toThrow('미래');
  await expect(remove(r1,r0,a,gid,'2020-01-01','wrong/zone')).rejects.toThrow('시간대');
  expect((await db.query("select has_function_privilege('anon','public.delete_monthly_goal_checked(uuid,uuid,uuid,date,text)','execute') as allowed")).rows).toEqual([{allowed:false}]);
});
test('연결 정리 오류 시 삭제·영수증이 함께 롤백되고 수정 후 같은 요청으로 재시도한다',async()=>{
  await save();await asUser(a,"insert into habits(id,title,goal_id) values($1,'산책',$2)",[hid,gid]);
  await db.exec("create function fail_delete_test() returns trigger language plpgsql as $$ begin raise exception 'simulated failure'; end $$; create trigger fail_delete_test after delete on monthly_goals for each row execute function fail_delete_test();");
  await expect(remove()).rejects.toThrow('simulated failure');expect((await db.query('select * from monthly_goals')).rows).toHaveLength(1);
  expect((await db.query('select goal_id from habits')).rows).toEqual([{goal_id:gid}]);
  expect((await db.query('select * from goal_delete_receipts')).rows).toHaveLength(0);
  await db.exec('drop trigger fail_delete_test on monthly_goals; drop function fail_delete_test();');expect((await remove()).status).toBe('deleted');
});
