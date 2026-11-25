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
import practices from '../../supabase/migrations/202610270013_practice_conflicts.sql?raw';
const db = new PGlite();
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
const gid='33333333-3333-4333-8333-333333333333', hid='44444444-4444-4444-8444-444444444444';
const r0='55555555-5555-4555-8555-555555555555', r1='66666666-6666-4666-8666-666666666666', r2='77777777-7777-4777-8777-777777777777';
const goalValues={title:'꾸준한 나',start_date:'2026-10-01',end_date:'2026-10-31',category:'personal',status:'active',goal_routines:[{id:'plan',title:'산책'}],color:'#55966b'};
async function asUser(user:string,sql:string,args:unknown[]=[]) {
  await db.exec('begin; set local role authenticated;');
  try { await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]); const result=await db.query<Record<string,unknown>>(sql,args); await db.exec('commit'); return result.rows; }
  catch(error){await db.exec('rollback');throw error;}
}
async function saveGoal(request=r0,base:string|null=null,creating=true,patch={},owner=a,id=gid) {
  return (await asUser(owner,'select save_monthly_goal($1,$2,$3,$4,$5) as result',[request,id,base,creating,JSON.stringify({...goalValues,...patch})]))[0].result as {status:string;current:Record<string,unknown>|null};
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
  for(const sql of [initial,shares,weekly,safety,history,connections,validation,conflicts,deletion,practices]) await db.exec(sql);
},20000);
afterAll(async()=>db.close());
beforeEach(async()=>{await db.exec('truncate auth.users cascade');for(const id of [a,b])await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id[0]}@example.test`]);});


const values={title:'산책',emoji:'🌱',frequency:'daily',when_text:'점심',created_at:'2020-01-01T00:00:00Z'};
async function save(request=r0,base:string|null=null,creating=true,patch={},kind='habit',id=hid,owner=a,date='2020-01-03',zone='Asia/Seoul') {
  return (await asUser(owner,'select save_practice($1,$2,$3,$4,$5,$6,$7,$8) as result',[request,kind,id,base,creating,JSON.stringify({...values,...patch}),date,zone]))[0].result as {status:string;current:Record<string,unknown>|null};
}
test.each(['habit','routine'])('%s: 두 기기의 같은 기준 저장은 충돌하고 서버 과거 이력·로그를 보존한다',async kind=>{
  expect(await save(r0,null,true,{},kind)).toMatchObject({status:'saved',current:{revision:r0}});
  const table=kind==='habit'?'habits':'daily_routines',logs=kind==='habit'?'habit_logs':'routine_logs',foreign=kind==='habit'?'habit_id':'routine_id';
  await asUser(a,`insert into ${logs}(${foreign},date,completed) values($1,'2020-01-02',true)`,[hid]);
  const before=(await db.query(`select * from ${logs}`)).rows;
  expect(await save(r1,r0,false,{title:'다른 기기',frequency:'weekdays',archived_at:'2020-01-03'},kind)).toMatchObject({status:'saved'});
  expect(await save(r2,r0,false,{title:'오래된 입력'},kind)).toMatchObject({status:'conflict',current:{title:'다른 기기',archived_at:'2020-01-03'}});
  const resolved=await save(r2,r1,false,{title:'비교 후 복원',frequency:'weekends',archived_at:null,is_active:true,schedule_history:[{from:'1900-01-01',title:'조작'}]},kind,hid,a,'2020-01-05');
  expect(resolved).toMatchObject({status:'saved',current:{title:'비교 후 복원',archived_at:null,schedule_history:[{from:'2020-01-01',title:'산책',active:true},{from:'2020-01-03',title:'다른 기기',active:false},{from:'2020-01-05',title:'비교 후 복원',active:true}]}});
  expect((await db.query(`select * from ${logs}`)).rows).toEqual(before);
  await expect(asUser(a,`update ${table} set title='우회'`)).rejects.toThrow('permission denied');
  await expect(asUser(a,`delete from ${table}`)).rejects.toThrow('permission denied');
  await expect(asUser(a,`insert into ${table}(title) values('우회')`)).rejects.toThrow('permission denied');
});
test('응답 유실 재시도는 나중 변경과 삭제를 덮지 않고 변조된 영수증 요청은 거절한다',async()=>{
  await save();await save(r1,r0,false,{title:'첫 변경'});await save(r2,r1,false,{title:'이후 변경'});
  expect(await save(r1,r0,false,{title:'첫 변경'})).toMatchObject({status:'saved',current:{revision:r2,title:'이후 변경'}});
  await expect(save(r1,r0,false,{title:'변조'})).rejects.toThrow('같은 요청');
  await db.query('delete from habits where id=$1',[hid]);
  expect(await save()).toEqual({status:'saved',current:null});
  expect(await save(gid,r2,false)).toEqual({status:'deleted',current:null});
});
test('없는 기준·다른 계정·익명·기록 조작을 막고 소유자와 버전은 서버가 고정한다',async()=>{
  await save();expect(await save(r1,null,false)).toMatchObject({status:'conflict'});
  expect(await save(r1,r0,false,{},'habit',hid,b)).toEqual({status:'deleted',current:null});
  await expect(save(r1,null,true,{},'habit',hid,b)).rejects.toThrow();
  expect(await save(r1,null,true,{user_id:a,revision:r2,schedule_history:[{from:'1900-01-01'}]},'habit',gid,b)).toMatchObject({current:{user_id:b,revision:r1,schedule_history:[]}});
  await expect(asUser(a,'select * from practice_save_receipts')).rejects.toThrow('permission denied');
  await expect(save(r2,null,true,{},'habit',gid,'')).rejects.toThrow('로그인');
  expect((await db.query("select has_function_privilege('anon','public.save_practice(uuid,text,uuid,uuid,boolean,jsonb,date,text)','execute') as allowed")).rows).toEqual([{allowed:false}]);
});
test('잘못된 요일·날짜는 버전과 영수증까지 롤백하고 미래 일정 이력은 충돌로 보호한다',async()=>{
  await save();await expect(save(r1,r0,false,{frequency:'custom',custom_days:[7]})).rejects.toThrow('요일');
  await expect(save(r1,r0,false,{},'habit',hid,a,'2999-01-01')).rejects.toThrow('미래');
  expect((await db.query('select revision from habits')).rows).toEqual([{revision:r0}]);
  expect((await db.query('select * from practice_save_receipts')).rows).toHaveLength(1);
  await db.query('update habits set schedule_history=$2::jsonb where id=$1',[hid,JSON.stringify([{from:'2030-01-01',title:'예정'}])]);
  const revision=(await db.query<{revision:string}>('select revision from habits')).rows[0].revision;
  expect(await save(r1,revision,false)).toMatchObject({status:'conflict'});
});
test('목표 삭제로 연결이 정리되어도 실천 버전이 바뀌어 오래된 연결 복원을 막는다',async()=>{
  await saveGoal();await save(r1,null,true,{goal_id:gid});
  await asUser(a,'select delete_monthly_goal_checked($1,$2,$3,$4,$5)',[r2,gid,r0,'2020-01-03','Asia/Seoul']);
  const result=await save(gid,r1,false,{goal_id:gid});expect(result.status).toBe('conflict');expect(result.current?.goal_id).toBeNull();expect(result.current?.revision).not.toBe(r1);
});
