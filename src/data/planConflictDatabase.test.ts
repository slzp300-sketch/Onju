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
  for(const sql of [initial,shares,weekly,safety,history,connections,validation,conflicts,deletion,practices,reviewHabits,reviewSteps,plans]) await db.exec(sql);
},20000);
afterAll(async()=>db.close());
beforeEach(async()=>{await db.exec('truncate auth.users cascade');for(const id of [a,b])await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id[0]}@example.test`]);});


const bundle={title:'저녁 묶음',emoji:'🌱',when_text:'퇴근 후',habit_ids:[hid],habit_durations:{[hid]:120},timer_enabled:true};
const weeklyValues={title:'주간 산책',emoji:'🌱',week_number:44,year:2026,start_date:'2026-10-26',end_date:'2026-11-01',target_count:3,linked_kind:'habit',linked_id:hid};
async function save(kind='bundle',request=r0,base:string|null=null,creating=true,patch={},deleting=false,owner=a,id=gid) {
  return (await asUser(owner,'select save_plan($1,$2,$3,$4,$5,$6,$7) as result',[request,kind,id,base,creating,deleting,JSON.stringify({...kind==='bundle'?bundle:weeklyValues,...patch})]))[0].result as {status:string;current:Record<string,unknown>|null};
}
async function practice() {
  await db.query("insert into weekly_reviews(user_id,week_number,year,comment,goal_achieved_count,goal_total_count,completed_at) values($1,1,2020,'보존할 과거 회고',1,1,'2020-01-05')",[a]);
  await db.query("insert into habits(id,user_id,title,emoji,frequency,archived_at,schedule_history) values($1,$2,'옛 산책','🌱','daily',null,'[{\"from\":\"2020-01-01\",\"title\":\"과거 이름\",\"active\":true}]')",[hid,a]);
  await asUser(a,"insert into habit_logs(habit_id,date,completed) values($1,'2020-01-02',true)",[hid]);
}
async function evidence() {return [(await db.query('select * from habits')).rows,(await db.query('select * from habit_logs')).rows,(await db.query('select * from weekly_reviews')).rows];}

test.each(['bundle','weekly'])('%s: 다기기 수정·삭제는 확인한 버전만 반영하며 습관과 과거 로그는 보존한다',async kind=>{
  await practice();const before=await evidence();await save(kind);
  expect(await save(kind,r1,r0,false,{title:'다른 기기',target_count:5,habit_ids:[hid],timer_enabled:false})).toMatchObject({status:'saved',current:{revision:r1}});
  expect(await save(kind,r2,r0,false,{title:'오래된 이름',target_count:2})).toMatchObject({status:'conflict',current:{revision:r1}});
  expect(await save(kind,r2,r0,false,{},true)).toMatchObject({status:'conflict'});
  expect(await save(kind,r2,r1,false,{},true)).toEqual({status:'saved',current:null});
  expect(await evidence()).toEqual(before);
  expect(await save(kind,r0)).toEqual({status:'saved',current:null});
  expect(await save(kind,hid,r1,false)).toEqual({status:'deleted',current:null});
  const table=kind==='bundle'?'personal_routines':'weekly_goals';
  await expect(asUser(a,`update ${table} set title='우회'`)).rejects.toThrow('permission denied');
  await expect(asUser(a,`delete from ${table}`)).rejects.toThrow('permission denied');
  await expect(asUser(a,`insert into ${table}(title) values('우회')`)).rejects.toThrow('permission denied');
});
test.each(['bundle','weekly'])('%s: 응답 유실 영수증은 이후 변경·같은 ID 재생성도 덮거나 재삭제하지 않는다',async kind=>{
  await practice();await save(kind);await save(kind,r1,r0,false,{title:'새 이름',target_count:5});
  expect(await save(kind)).toMatchObject({status:'saved',current:{revision:r1}});
  await expect(save(kind,r1,r0,false,{title:'변조'})).rejects.toThrow('같은 요청');
  await save(kind,r2,r1,false,{},true);
  await save(kind,hid,null,true,{title:'다시 만든 항목'});
  expect(await save(kind,r2,r1,false,{},true)).toMatchObject({status:'saved',current:{revision:hid}});
  expect((await db.query(`select id from ${kind==='bundle'?'personal_routines':'weekly_goals'}`)).rows).toEqual([{id:gid}]);
});
test('주간 목표 횟수만 수정하고 연결·기간·저장된 결산·이전 리뷰를 보존한다',async()=>{
  await practice();await save('weekly');await db.query("update weekly_goals set status='completed',completion_rate=100 where id=$1",[gid]);
  const old=(await db.query<{revision:string}>('select revision from weekly_goals')).rows[0].revision;
  expect(await save('weekly',r1,old,false,{target_count:5,linked_id:r2,start_date:'1900-01-01',status:'active',completion_rate:0,title:'변조'})).toMatchObject({status:'saved',current:{target_count:5,linked_id:hid,start_date:'2026-10-26',status:'completed',completion_rate:100,title:'주간 산책'}});
});
test('리뷰의 묶음 추가·목표 결산도 revision을 바꿔 편집 중인 오래된 저장과 충돌한다',async()=>{
  await practice();await save();
  await asUser(a,"select apply_weekly_review_step($1,'bundle',$2)",[r1,JSON.stringify({id:gid,habit_ids:[hid]})]);
  expect(await save('bundle',r2,r0,false)).toMatchObject({status:'conflict'});
  await save('weekly',r1,null,true,{},false,a,r2);
  const expected={start_date:'2026-10-26',end_date:'2026-11-01',target_count:3,linked_kind:'habit',linked_id:hid,completion_rate:0,status:'active'};
  await asUser(a,"select apply_weekly_review_step($1,'weekly-goal',$2)",[gid,JSON.stringify({id:r2,expected,completion_rate:100,status:'completed'})]);
  expect(await save('weekly',hid,r1,false,{},false,a,r2)).toMatchObject({status:'conflict',current:{completion_rate:100}});
});
test('새 연결의 소유권·중복·정원·타이머 값을 검사하고 보관된 구성원은 유지한다',async()=>{
  await practice();await save();await db.query("update habits set archived_at='2026-10-27' where id=$1",[hid]);
  expect(await save('bundle',r1,r0,false,{timer_enabled:false})).toMatchObject({status:'saved',current:{habit_ids:[hid],habit_durations:{[hid]:120}}});
  await expect(save('bundle',r2,r1,false,{habit_ids:[hid,hid]})).rejects.toThrow('중복');
  await expect(save('bundle',r2,r1,false,{habit_ids:[r2]})).rejects.toThrow('본인');
  await expect(save('bundle',r2,r1,false,{habit_durations:{[hid]:-1}})).rejects.toThrow('시간');
  await expect(save('weekly')).rejects.toThrow('같은 요청');
  await expect(save('weekly',r2)).rejects.toThrow('습관');
  await db.query('update habits set archived_at=null where id=$1',[hid]);await save('weekly',r2,null,true,{},false,a,r2);
  await expect(save('weekly',hid,null,true,{},false,a,hid)).rejects.toThrow('이미');
});
test('다른 계정·익명과 영수증 직접 접근을 막고 null 기준으로 기존 항목을 덮지 않는다',async()=>{
  await practice();await save();expect(await save('bundle',r1,null,false)).toMatchObject({status:'conflict'});
  expect(await save('bundle',r1,r0,false,{},false,b)).toEqual({status:'deleted',current:null});
  await expect(save('bundle',r1,null,true,{},false,b)).rejects.toThrow();
  await expect(save('bundle',r1,null,true,{},false,'')).rejects.toThrow('로그인');
  await expect(asUser(a,'select * from plan_save_receipts')).rejects.toThrow('permission denied');
  expect((await db.query("select has_function_privilege('anon','public.save_plan(uuid,text,uuid,uuid,boolean,boolean,jsonb)','execute') as allowed")).rows).toEqual([{allowed:false}]);
});

test('주간 목표 생성은 다른 습관이어도 서버 슬롯 한도를 넘지 않고 실패 영수증을 남기지 않는다',async()=>{
  await practice();await db.query('update profiles set weekly_goal_slots=1 where id=$1',[a]);await save('weekly');
  await db.query("insert into habits(id,user_id,title,emoji,frequency) values($1,$2,'두 번째 습관','','daily')",[r2,a]);
  await expect(save('weekly',r1,null,true,{linked_id:r2},false,a,r2)).rejects.toThrow('가득');
  expect((await db.query('select request_id from plan_save_receipts')).rows).toEqual([{request_id:r0}]);
});
test('월간 목표 삭제의 주간 연결 정리도 버전을 바꿔 오래된 횟수 편집을 보류한다',async()=>{
  await practice();await save('weekly',r0,null,true,{},false,a,r2);
  await db.query("insert into monthly_goals(id,user_id,title,month,year,start_date,end_date,revision) values($1,$2,'상위 목표',10,2026,'2026-10-01','2026-10-31',$3)",[gid,a,r1]);
  await db.query('update weekly_goals set monthly_goal_id=$1 where id=$2',[gid,r2]);
  const revision=(await db.query<{revision:string}>('select revision from weekly_goals')).rows[0].revision;
  const before=await evidence();await asUser(a,'select delete_monthly_goal_checked($1,$2,$3,$4,$5)',[hid,gid,r1,'2020-01-03','Asia/Seoul']);
  expect(await save('weekly',gid,revision,false,{target_count:5},false,a,r2)).toMatchObject({status:'conflict',current:{monthly_goal_id:null,target_count:3}});
  expect(await evidence()).toEqual(before);
});
