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
import reviewHabits from '../../supabase/migrations/202610270004_review_habits.sql?raw';
import reviewSteps from '../../supabase/migrations/202610280001_review_submission_steps.sql?raw';
import plans from '../../supabase/migrations/202610280002_plan_conflicts.sql?raw';
import records from '../../supabase/migrations/202610280003_record_conflicts.sql?raw';
const db = new PGlite();
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
const gid='33333333-3333-4333-8333-333333333333', hid='44444444-4444-4444-8444-444444444444';
const r0='55555555-5555-4555-8555-555555555555', r1='66666666-6666-4666-8666-666666666666', r2='77777777-7777-4777-8777-777777777777';
async function asUser(user:string,sql:string,args:unknown[]=[]) {
  await db.exec('begin; set local role authenticated;');
  try { await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]); const result=await db.query<Record<string,unknown>>(sql,args); await db.exec('commit'); return result.rows; }
  catch(error){await db.exec('rollback');throw error;}
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
  for(const sql of [initial,shares,weekly,safety,history,connections,validation,conflicts,deletion,practices,reviewHabits,reviewSteps,plans,records]) await db.exec(sql);
},20000);
afterAll(async()=>db.close());
beforeEach(async()=>{await db.exec('truncate auth.users cascade');for(const id of [a,b])await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id[0]}@example.test`]);});

const day='2026-10-28';
const key=(kind:string)=>kind==='todo'?gid:kind==='diary'?day:`${hid}:${day}`;
const values=(kind:string)=>kind==='todo'?{title:'기존 할 일',date:day,emoji:'📝'}:kind==='diary'?{mood:'good',content:'기존 일기'}:{memo:'기존 메모'};
async function save(kind='todo',request=r0,base:string|null=null,mode='create',patch:Record<string,unknown>={},owner=a) {
  return (await asUser(owner,'select save_record($1,$2,$3,$4,$5,$6) as result',[request,kind,key(kind),base,mode,JSON.stringify({...values(kind),...patch})]))[0].result;
}
async function seed(){
  await db.query("insert into daily_routines(id,user_id,type,title,frequency) values($1,$2,'faith','기도','\"daily\"')",[hid,a]);
  await db.query("insert into diary_entries(user_id,date,content) values($1,'2026-10-20','지난 일기')",[a]);
  await db.query("insert into routine_logs(user_id,routine_id,date,completed,memo) values($1,$2,'2026-10-20',true,'지난 메모')",[a,hid]);
}
test.each(['todo','diary','memo'])('%s: 같은 기준의 수정은 충돌하고 확인 재저장·기존 날짜 기록을 보존한다',async kind=>{
  await seed();await save(kind);await save(kind,r1,r0,'edit',{title:'다른 기기',content:'다른 기기',memo:'다른 기기'});
  expect(await save(kind,r2,r0,'edit',{title:'내 입력',content:'내 입력',memo:'내 입력'})).toMatchObject({status:'conflict'});
  expect(await save(kind,r2,r1,'edit',{title:'내 입력',content:'내 입력',memo:'내 입력'})).toMatchObject({status:'saved'});
  expect((await db.query("select content from diary_entries where date='2026-10-20'")).rows).toEqual([{content:'지난 일기'}]);
  expect((await db.query("select completed,memo from routine_logs where date='2026-10-20'")).rows).toEqual([{completed:true,memo:'지난 메모'}]);
});
test.each(['todo','diary','memo'])('%s: 생성·수정 응답 유실 영수증은 이후 수정/삭제/재생성을 덮지 않는다',async kind=>{
  await seed();await save(kind);await save(kind,r1,r0,'edit',{title:'나중 입력',content:'나중 입력',memo:'나중 입력'});
  expect(await save(kind)).toMatchObject({status:'saved',current:kind==='memo'?{memo_revision:r1}:{revision:r1}});
  await expect(save(kind,r0,null,'create',{content:'변조'})).rejects.toThrow('같은 요청');
  const table=kind==='todo'?'todos':kind==='diary'?'diary_entries':'routine_logs';
  await db.exec(`delete from ${table}`);expect(await save(kind)).toEqual({status:'saved',current:null});
  await save(kind,r2);expect(await save(kind)).toMatchObject({status:'saved',current:kind==='memo'?{memo_revision:r2}:{revision:r2}});
});
test('할 일 편집·완료는 각각 해당 필드만 바꾸고 오래된 삭제와 재생성 ID를 보호한다',async()=>{
  await seed();await save();await save('todo',r1,r0,'complete',{completed:true,completed_at:'2026-10-28T00:00:00Z',title:'변조'});
  expect(await save('todo',r2,r1,'edit',{title:'이름 수정',completed:false,date:'1900-01-01'})).toMatchObject({status:'saved',current:{title:'이름 수정',completed:true,date:day}});
  expect(await save('todo',hid,r0,'delete')).toMatchObject({status:'conflict'});
  expect(await save('todo',hid,r2,'delete')).toEqual({status:'saved',current:null});await save('todo',a);
  expect(await save('todo',hid,r2,'delete')).toMatchObject({status:'saved',current:{revision:a}});
});
test('메모와 수행 체크는 서로의 필드와 버전을 덮지 않고 체크 재시도도 이후 변경을 보존한다',async()=>{
  await seed();await save('memo');
  await save('check',r1,null,'complete',{completed:true,skipped:false,memo:'지우면 안 됨'});
  expect(await save('memo',r2,r0,'edit',{memo:'수정한 기도',completed:false,skipped:true})).toMatchObject({status:'saved',current:{memo:'수정한 기도',completed:true,skipped:false,memo_revision:r2}});
  await save('check',gid,null,'complete',{completed:false,skipped:true});
  expect(await save('check',r1,null,'complete',{completed:true,skipped:false,memo:'지우면 안 됨'})).toMatchObject({status:'saved',current:{completed:false,skipped:true,memo:'수정한 기도'}});
});
test('오프라인 첫 수행 후 메모는 알려진 초기 버전으로 저장하고 빈 기준으로 기존 메모를 덮지 않는다',async()=>{
  await seed();await save('check',r0,null,'complete',{completed:true,skipped:false});
  expect(await save('memo',r1,r0,'edit',{memo:'첫 메모'})).toMatchObject({status:'saved'});
  expect(await save('memo',r2,null,'edit')).toMatchObject({status:'conflict'});
});
test('다른 계정·익명·직접 쓰기는 차단하고 삭제된 메모를 오래된 편집으로 자동 재생성하지 않는다',async()=>{
  await seed();await save('memo');await db.exec('delete from routine_logs');
  expect(await save('memo',r1,r0,'edit')).toEqual({status:'deleted',current:null});
  await expect(save('memo',r1,null,'create',{},b)).rejects.toThrow('본인');
  await expect(save('diary',r1,null,'create',{},'')).rejects.toThrow('로그인');
  for(const table of ['todos','diary_entries','routine_logs'])await expect(asUser(a,`delete from ${table}`)).rejects.toThrow('permission denied');
  await expect(asUser(a,'select * from record_save_receipts')).rejects.toThrow('permission denied');
  expect((await db.query("select has_function_privilege('anon','public.save_record(uuid,text,text,uuid,text,jsonb)','execute') as allowed")).rows).toEqual([{allowed:false}]);
});

