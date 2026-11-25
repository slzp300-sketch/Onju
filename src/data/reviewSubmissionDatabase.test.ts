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
  for(const sql of [initial,shares,weekly,safety,history,connections,validation,conflicts,deletion,practices,reviewHabits,reviewSteps]) await db.exec(sql);
},20000);
afterAll(async()=>db.close());
beforeEach(async()=>{await db.exec('truncate auth.users cascade');for(const id of [a,b])await db.query('insert into auth.users(id,email) values($1,$2)',[id,`${id[0]}@example.test`]);});

async function step(kind:string,payload:Record<string,unknown>,request=r0,owner=a) {
  return (await asUser(owner,'select apply_weekly_review_step($1,$2,$3) as result',[request,kind,JSON.stringify(payload)]))[0].result as {status:string;current:Record<string,unknown>|null;replayed?:boolean};
}
const practice={item_kind:'habit',item_id:hid,expected_revision:null,creating:true,item_values:{title:'산책',emoji:'🌱',frequency:'daily',when_text:'점심',created_at:'2020-01-01T00:00:00Z'},effective_date:'2020-01-03',p_timezone:'Asia/Seoul'};
const body={values:{id:gid,week_number:44,year:2026,personal_rate:80,faith_rate:60,goal_achieved_count:0,goal_total_count:0,mood:'normal',comment:'이번 회고',intention:'계속',routine_changes:[],habit_changes:[],share_to_groups:[],application_results:[{label:'산책',status:'done',date:'2020-01-03'}]},expected:null};
test('각 단계의 영수증은 응답 유실 뒤 재시도해도 이후 실천 변경·삭제와 로그를 보존한다',async()=>{
  expect(await step('practice',practice)).toMatchObject({status:'saved',replayed:false});
  await asUser(a,"insert into habit_logs(habit_id,date,completed) values($1,'2020-01-02',true)",[hid]);
  const later={...practice,creating:false,expected_revision:r0,item_values:{...practice.item_values,title:'이후 변경'},effective_date:'2020-01-05'};
  expect(await step('practice',later,r1)).toMatchObject({status:'saved'});
  expect(await step('practice',practice)).toMatchObject({status:'saved',replayed:true});
  expect((await db.query('select title from habits')).rows).toEqual([{title:'이후 변경'}]);
  expect((await db.query('select * from habit_logs')).rows).toHaveLength(1);
  await db.query('delete from habits');
  expect(await step('practice',practice)).toMatchObject({status:'saved',replayed:true});
  expect((await db.query('select * from habits')).rows).toHaveLength(0);
  await expect(step('practice',{...practice,effective_date:'2020-01-04'})).rejects.toThrow('같은 요청');
});
test('앞선 성공은 유지하고 실패 단계의 실천·영수증만 롤백한다',async()=>{
  await step('practice',practice);
  await expect(step('practice',{...practice,item_id:gid,item_values:{...practice.item_values,frequency:'custom',custom_days:[9]}},r1)).rejects.toThrow();
  expect((await db.query('select id from habits')).rows).toEqual([{id:hid}]);
  expect((await db.query('select request_id from review_step_receipts')).rows).toEqual([{request_id:r0}]);
  expect((await db.query('select request_id from practice_save_receipts')).rows).toEqual([{request_id:r0}]);
});
test('실천 충돌·없는 항목은 저장 완료로 처리하지 않고 과거 기록을 남긴다',async()=>{
  await step('practice',practice);
  expect(await step('practice',{...practice,creating:false,expected_revision:r1},r2)).toMatchObject({status:'conflict'});
  expect(await step('practice',{...practice,item_id:gid,creating:false},r2)).toEqual({status:'deleted',current:null});
  expect((await db.query('select * from review_step_receipts')).rows).toHaveLength(1);
});
test('묶음에는 새 습관만 덧붙이고 현재 제목·순서·타이머와 이후 제거를 보존한다',async()=>{
  await step('practice',practice);
  await db.query("insert into personal_routines(id,user_id,title,habit_ids,timer_enabled) values($1,$2,'새 제목',array['기존'],true)",[gid,a]);
  const payload={id:gid,habit_ids:[hid,hid]};
  expect(await step('bundle',payload,r1)).toMatchObject({current:{title:'새 제목',habit_ids:['기존',hid],timer_enabled:true}});
  await db.query("update personal_routines set habit_ids='{}',title='이후 변경'");
  await step('bundle',payload,r1);
  expect((await db.query('select habit_ids,title from personal_routines')).rows).toEqual([{habit_ids:[],title:'이후 변경'}]);
  expect(await step('bundle',payload,r2,b)).toEqual({status:'deleted',current:null});
  await db.query('delete from habits');
  expect(await step('bundle',payload,r2)).toMatchObject({status:'conflict'});
  expect((await db.query('select habit_ids from personal_routines')).rows).toEqual([{habit_ids:[]}]);
});
test('주간 목표 결산은 다른 필드를 보존하고 기간·연결이 달라졌으면 멈춘다',async()=>{
  await db.query("insert into monthly_goals(id,user_id,title,category,start_date,end_date,month,year) values($1,$2,'목표','personal','2020-01-01','2020-01-31',1,2020)",[gid,a]);
  await db.query("insert into weekly_goals(id,user_id,monthly_goal_id,title,week_number,year,start_date,end_date,target_count) values($1,$2,$3,'주간',1,2020,'2020-01-01','2020-01-07',3)",[hid,a,gid]);
  const payload={id:hid,completion_rate:100,status:'completed',expected:{start_date:'2020-01-01',end_date:'2020-01-07',target_count:3,linked_kind:null,linked_id:null,completion_rate:0,status:'active'}};
  expect(await step('weekly-goal',payload)).toMatchObject({status:'saved',current:{title:'주간',status:'completed'}});
  expect(await step('weekly-goal',payload,r2)).toMatchObject({status:'conflict'});
  await db.query("update weekly_goals set title='새 제목',target_count=5,completion_rate=40,status='active'");
  await step('weekly-goal',payload);
  expect((await db.query('select title,target_count,completion_rate from weekly_goals')).rows).toEqual([{title:'새 제목',target_count:5,completion_rate:40}]);
  expect(await step('weekly-goal',payload,r1)).toMatchObject({status:'conflict'});
});
test('회고를 마지막에 비교 저장하며 이후 수정·삭제를 재시도가 되돌리지 않는다',async()=>{
  expect(await step('review',body)).toMatchObject({status:'saved',current:{comment:'이번 회고',application_results:body.values.application_results}});
  const baseline=(await db.query<{raw:Record<string,unknown>}>('select to_jsonb(r) as raw from weekly_reviews r')).rows[0].raw;
  expect(await step('review',body,r1)).toMatchObject({status:'conflict'});
  expect(await step('review',{...body,expected:baseline,values:{...body.values,comment:'다른 기기'}},r1)).toMatchObject({status:'saved'});
  expect(await step('review',body)).toMatchObject({replayed:true});
  expect((await db.query('select comment from weekly_reviews')).rows).toEqual([{comment:'다른 기기'}]);
  await db.query('delete from weekly_reviews');await step('review',body);
  expect((await db.query('select * from weekly_reviews')).rows).toHaveLength(0);
});
test('서버 회고 비교는 다른 계정과 영수증 조작을 허용하지 않는다',async()=>{
  await step('review',body);
  await expect(step('review',body,r0,b)).rejects.toThrow();
  await expect(step('review',{...body,values:{...body.values,comment:'변조'}})).rejects.toThrow('같은 요청');
  await expect(step('review',body,r1,'')).rejects.toThrow('로그인');
  await expect(asUser(a,'select * from review_step_receipts')).rejects.toThrow('permission denied');
  expect((await db.query("select has_function_privilege('anon','public.apply_weekly_review_step(uuid,text,jsonb)','execute') as allowed")).rows).toEqual([{allowed:false}]);
});
test('모임 탈퇴·동의 누락 시 공유를 보류하고 이미 성공한 공유는 탈퇴 뒤에도 중복 전송하지 않는다',async()=>{
  await db.query("insert into small_groups(id,creator_id,title,goal,category,start_date,end_date) values($1,$2,'모임','함께','personal','2026-10-01','2026-11-30')",[gid,a]);
  const payload={id:hid,group_id:gid,week_number:44,year:2026,personal_rate:80,faith_rate:60,comment:'공유',intention:'계속'};
  expect(await step('share',payload)).toEqual({status:'conflict',current:null});
  await db.query("insert into community_consents(user_id,version) values($1,'2026-10-27')",[a]);
  await db.query('insert into group_members(group_id,user_id) values($1,$2)',[gid,a]);
  expect(await step('share',payload)).toMatchObject({status:'saved'});
  await db.query('delete from group_members');
  expect(await step('share',payload)).toMatchObject({status:'saved',replayed:true});
  expect((await db.query('select * from group_weekly_shares')).rows).toHaveLength(1);
});
