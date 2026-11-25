// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import initialSchema from '../../supabase/migrations/0001_init.sql?raw';
import profilePermissions from '../../supabase/migrations/0002_restrict_profile_email.sql?raw';
import deleteAccount from '../../supabase/migrations/0004_delete_account.sql?raw';
import sharedRoutines from '../../supabase/migrations/0005_routine_share_proofs.sql?raw';
import weeklyGoals from '../../supabase/migrations/0006_weekly_goal_targets.sql?raw';
import communitySafety from '../../supabase/migrations/202610270001_mobile_community_safety.sql?raw';

import groupCreation from '../../supabase/migrations/202610270006_group_creation.sql?raw';
import groupStatusRecovery from '../../supabase/migrations/202610270007_group_status_recovery.sql?raw';
import privateGroupInvites from '../../supabase/migrations/202610270008_private_group_invites.sql?raw';
import goalConnections from '../../supabase/migrations/202610270009_goal_connections.sql?raw';
import goalEditValidation from '../../supabase/migrations/202610270010_goal_edit_validation.sql?raw';
import membershipRecovery from '../../supabase/migrations/202610270005_membership_recovery.sql?raw';
import reviewHabits from '../../supabase/migrations/202610270004_review_habits.sql?raw';
import historyProgress from '../../supabase/migrations/202610270003_history_and_group_progress.sql?raw';
import { getDayCompletion, getPeriodCompletion } from '../utils/dayCompletion';
import { calcStreak } from '../utils/completion';
import type { Habit } from '../types';
import { habitToRow } from './mappers';
import { withHistory } from '../utils/scheduleHistory';
const db = new PGlite();
const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const c = '33333333-3333-4333-8333-333333333333';
const group = '44444444-4444-4444-8444-444444444444';
const privateGroup = '55555555-5555-4555-8555-555555555555';
const share = '66666666-6666-4666-8666-666666666666';
const proof = '77777777-7777-4777-8777-777777777777';
const routine = '88888888-8888-4888-8888-888888888888';

// 실제 사용자 데이터와 네트워크 없이 PostgreSQL의 role/RLS를 실행한다.
async function asUser(user: string, sql: string, parameters: unknown[] = []) {
  await db.exec('begin; set local role authenticated;');
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user]);
    const result = await db.query<Record<string, unknown>>(sql, parameters);
    await db.exec('commit');
    return result.rows;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}
const consent = () => asUser(a, "insert into community_consents(version) values ('2026-10-27')");
async function invite(id=proof) {
  for(const user of [a,b,c])await asUser(user,"insert into community_consents(version) values ('2026-10-27') on conflict do nothing");
  await asUser(c,'select issue_group_invite($1,$2)',[privateGroup,id]);
  return (await asUser(c,'select * from group_invites where id=$1',[id]))[0];
}
const previewInvite = async (user:string, code:unknown) => (await asUser(user,'select preview_group_invite($1) as preview',[code]))[0].preview as Record<string,unknown>;

async function seedGoalConnections() {
  for (const [owner,id] of [[a,proof],[b,group]]) await asUser(owner,"insert into monthly_goals(id,title,month,year,start_date,end_date) values($1,'목표',10,2020,'2020-10-01','2020-11-01')",[id]);
  await asUser(a,"insert into habits(id,title,goal_id,created_at) values($1,'산책',$2,'2020-10-01T00:00:00Z')",[routine,proof]);
  await asUser(a,"insert into daily_routines(id,title,type,goal_id,monthly_goal_id,is_active,archived_at,created_at) values($1,'기도','faith',$2,$2,false,'2020-10-20','2020-10-01T00:00:00Z')",[share,proof]);
  await asUser(a,"insert into habit_logs(habit_id,date,completed) values($1,'2020-10-26',true)",[routine]);
  await asUser(a,"insert into routine_logs(routine_id,date,completed,memo) values($1,'2020-10-26',true,'남길 기록')",[share]);
  await asUser(a,"insert into weekly_goals(monthly_goal_id,title,week_number,year,start_date,end_date,completion_rate,linked_kind,linked_id) values($1,'주간 목표',44,2020,'2020-10-26','2020-11-01',80,'habit',$2)",[proof,routine]);
}

test('목표 삭제 SQL은 현재 연결만 정리하고 보관 항목·주간 목표·모든 로그와 이전 연결 이력을 남긴다',async()=>{
  await seedGoalConnections();
  const before = (await asUser(a,'select * from habit_logs'));
  await asUser(a,"select delete_monthly_goal_preserving_history($1,'2020-10-27','Asia/Seoul')",[proof]);
  const habit=(await asUser(a,'select * from habits where id=$1',[routine]))[0];
  expect(habit).toMatchObject({goal_id:null,title:'산책'});
  expect(habit.schedule_history).toEqual([{from:'2020-10-01',title:'산책',emoji:'',frequency:'daily',active:true,goalId:proof},{from:'2020-10-27',title:'산책',emoji:'',frequency:'daily',active:true}]);
  expect((await asUser(a,'select * from daily_routines where id=$1',[share]))[0]).toMatchObject({goal_id:null,monthly_goal_id:null,is_active:false,archived_at:new Date('2020-10-20T00:00:00Z')});
  expect((await asUser(a,'select * from weekly_goals'))[0]).toMatchObject({monthly_goal_id:null,completion_rate:80,linked_id:routine});
  expect(await asUser(a,'select * from habit_logs')).toEqual(before);expect((await asUser(a,'select * from routine_logs'))[0]).toMatchObject({memo:'남길 기록',completed:true});
  expect(await asUser(a,'select * from monthly_goals')).toEqual([]);expect(await asUser(b,'select * from monthly_goals')).toHaveLength(1);
});

test('연결 정리 중 DB 실패는 전체 롤백하고 동일 삭제 재시도는 다른 목표로 옮긴 항목을 건드리지 않는다',async()=>{
  await seedGoalConnections();
  await db.exec("create function fail_goal_cleanup() returns trigger language plpgsql as $$ begin raise exception '연결 정리 실패'; end $$; create trigger fail_goal_cleanup before update on daily_routines for each row execute function fail_goal_cleanup();");
  try {await expect(asUser(a,"select delete_monthly_goal_preserving_history($1,'2020-10-27')",[proof])).rejects.toThrow('연결 정리 실패');}
  finally {await db.exec('drop trigger fail_goal_cleanup on daily_routines; drop function fail_goal_cleanup();');}
  expect((await asUser(a,'select goal_id,schedule_history from habits'))[0]).toEqual({goal_id:proof,schedule_history:[]});expect(await asUser(a,'select * from monthly_goals')).toHaveLength(1);
  await asUser(a,"select delete_monthly_goal_preserving_history($1,'2020-10-27')",[proof]);
  await asUser(a,"insert into monthly_goals(id,title,month,year,start_date,end_date) values($1,'새 목표',10,2020,'2020-10-27','2020-11-30')",[privateGroup]);
  await asUser(a,'update habits set goal_id=$1 where id=$2',[privateGroup,routine]);
  await asUser(a,"select delete_monthly_goal_preserving_history($1,'2020-10-27')",[proof]);
  expect((await asUser(a,'select goal_id from habits'))[0]).toEqual({goal_id:privateGroup});
});

test('다른 계정의 목표 삭제·익명 실행을 막고 구버전 DELETE도 연결을 정리한다',async()=>{
  await seedGoalConnections();await asUser(b,"select delete_monthly_goal_preserving_history($1,'2020-10-27')",[proof]);
  expect(await asUser(a,'select * from monthly_goals')).toHaveLength(1);
  expect((await db.query("select has_function_privilege('anon','public.delete_monthly_goal_preserving_history(uuid,date,text)','execute') as allowed")).rows).toEqual([{allowed:false}]);
  await expect(asUser(a,"select delete_monthly_goal_preserving_history($1,'2020-10-27','not-a-zone')",[proof])).rejects.toThrow('시간대');
  await asUser(a,'delete from monthly_goals where id=$1',[proof]);expect((await asUser(a,'select goal_id from habits'))[0]).toEqual({goal_id:null});expect(await asUser(a,'select * from habit_logs')).toHaveLength(1);
});

test('삭제 후 오래된 기기의 쓰기와 다른 계정 목표 ID는 현재 연결을 되살리지 않고 내용과 과거 로그를 보존한다',async()=>{
  await seedGoalConnections();await asUser(a,"select delete_monthly_goal_preserving_history($1,'2020-10-27')",[proof]);
  await asUser(a,"update habits set title='기존 기기의 메모 수정',goal_id=$1 where id=$2",[proof,routine]);
  expect((await asUser(a,'select title,goal_id from habits'))[0]).toEqual({title:'기존 기기의 메모 수정',goal_id:null});
  await asUser(a,'update daily_routines set goal_id=$1,monthly_goal_id=$1 where id=$2',[group,share]);
  expect((await asUser(a,'select goal_id,monthly_goal_id from daily_routines'))[0]).toEqual({goal_id:null,monthly_goal_id:null});
  expect(await asUser(a,'select * from habit_logs')).toHaveLength(1);expect(await asUser(a,'select * from routine_logs')).toHaveLength(1);
});

test('오프라인 삭제가 늦게 도착해도 다른 기기에서 바꾼 이후 일정 이력은 보존한다',async()=>{
  await seedGoalConnections();
  const baseline={from:'2020-10-01',title:'산책',frequency:'daily',active:true,goalId:proof};
  const later={...baseline,from:'2020-10-28',title:'새 산책',frequency:'weekdays'};
  await asUser(a,"update habits set title='새 산책',frequency='weekdays',schedule_history=$1 where id=$2",[JSON.stringify([baseline,later]),routine]);
  await asUser(a,"select delete_monthly_goal_preserving_history($1,'2020-10-27')",[proof]);
  expect((await asUser(a,'select schedule_history from habits'))[0].schedule_history).toEqual([baseline,{from:'2020-10-27',title:'산책',frequency:'daily',active:true},{from:'2020-10-28',title:'새 산책',frequency:'weekdays',active:true}]);
});

test('목표 분류·기간 SQL 수정은 연결·이력·보관 상태·로그·주간 목표를 그대로 보존한다',async()=>{
  await seedGoalConnections();
  const tables=['habits','daily_routines','habit_logs','routine_logs','weekly_goals'];
  const snapshot=async()=>Promise.all(tables.map(table=>asUser(a,`select * from ${table}`)));
  const before=await snapshot();
  await asUser(a,"update monthly_goals set category='faith',start_date='2020-10-25',end_date='2020-10-26' where id=$1",[proof]);
  expect(await snapshot()).toEqual(before);
  await asUser(a,"update monthly_goals set category='personal',start_date='2020-11-01',end_date='2020-11-30' where id=$1",[proof]);
  expect(await snapshot()).toEqual(before);
  await asUser(a,"update daily_routines set title='기존 신앙 루틴 수정' where id=$1",[share]);
  expect((await asUser(a,'select goal_id,is_active,archived_at from daily_routines where id=$1',[share]))[0]).toMatchObject({goal_id:proof,is_active:false});
});

test('목표 SQL은 역전·달력 밖 기간과 알 수 없는 분류를 거절하고 다른 계정 수정을 차단한다',async()=>{
  await seedGoalConnections();const before=await asUser(a,'select * from monthly_goals');
  for(const changes of ["start_date='2021-01-01'","end_date='2020-02-30'","end_date='10000-01-01'","category='unknown'"]) await expect(asUser(a,`update monthly_goals set ${changes} where id=$1`,[proof])).rejects.toThrow();
  expect(await asUser(a,'select * from monthly_goals')).toEqual(before);
  await asUser(b,"update monthly_goals set category='faith',end_date='2020-10-27' where id=$1",[proof]);expect(await asUser(a,'select * from monthly_goals')).toEqual(before);
  await asUser(a,"update monthly_goals set start_date='2024-02-29',end_date='2024-02-29' where id=$1",[proof]);
  expect(await asUser(a,'select * from habit_logs')).toHaveLength(1);
});

test('초대는 방장만 발급·조회·폐기하며 비회원에게 테이블·개인 기록을 공개하지 않는다',async()=>{
  await expect(asUser(c,'select issue_group_invite($1,$2)',[privateGroup,proof])).rejects.toThrow('수칙');
  const first=await invite();
  await asUser(c,'select issue_group_invite($1,$2)',[privateGroup,proof]);expect((await asUser(c,'select * from group_invites where id=$1',[proof]))[0]).toEqual(first);
  expect(await asUser(a,'select * from group_invites')).toEqual([]);expect(await asUser(a,'select * from small_groups where id=$1',[privateGroup])).toEqual([]);
  await expect(asUser(a,'select issue_group_invite($1,$2)',[privateGroup,routine])).rejects.toThrow('방장');
  await expect(asUser(a,'select revoke_group_invite($1,$2)',[privateGroup,proof])).rejects.toThrow('방장');
  await expect(asUser(a,'insert into group_invites(id,group_id) values($1,$2)',[routine,privateGroup])).rejects.toThrow('permission denied');
  await expect(asUser(c,'select issue_group_invite($1,$2)',[group,proof])).rejects.toThrow('방장');
  expect((await db.query("select has_function_privilege('anon','public.accept_group_invite(text)','execute') as allowed")).rows).toEqual([{allowed:false}]);
});

test('유효한 코드로 미리보기 후 한 명만 가입하고 응답 유실 재시도는 중복 없이 복구한다',async()=>{
  const inv=await invite();const preview=await previewInvite(a,inv.code);
  expect(preview).toMatchObject({state:'available',groupId:privateGroup,title:'비공개',memberCount:1});expect(preview).not.toHaveProperty('members');
  const code=String(inv.code).toUpperCase().match(/.{1,8}/g)!.join('-');
  await asUser(a,'select accept_group_invite($1)',[` ${code} `]);await asUser(a,'select accept_group_invite($1)',[code]);
  expect((await asUser(a,'select * from small_groups where id=$1',[privateGroup]))).toHaveLength(1);
  expect((await db.query('select * from group_members where group_id=$1 and user_id=$2',[privateGroup,a])).rows).toHaveLength(1);
  expect(await previewInvite(a,code)).toMatchObject({state:'joined'});
  expect(await previewInvite(b,code)).toEqual({state:'used'});await expect(asUser(b,'select accept_group_invite($1)',[code])).rejects.toThrow('이미 사용');
  await asUser(c,'select revoke_group_invite($1,$2)',[privateGroup,proof]);await asUser(a,'select accept_group_invite($1)',[code]);
  await asUser(a,'select leave_group($1)',[privateGroup]);await expect(asUser(a,'select accept_group_invite($1)',[code])).rejects.toThrow('초대 코드');
});

test('만료·폐기·없는 초대는 모임 정보를 숨기고 가입을 거절한다',async()=>{
  const expired=await invite();await db.query("update group_invites set expires_at=now()-interval '1 second' where id=$1",[proof]);
  expect(await previewInvite(a,expired.code)).toEqual({state:'expired'});await expect(asUser(a,'select accept_group_invite($1)',[expired.code])).rejects.toThrow('만료');
  const revoked=await invite(routine);await asUser(c,'select revoke_group_invite($1,$2)',[privateGroup,routine]);await asUser(c,'select revoke_group_invite($1,$2)',[privateGroup,routine]);
  expect(await previewInvite(a,revoked.code)).toEqual({state:'revoked'});await expect(asUser(a,'select accept_group_invite($1)',[revoked.code])).rejects.toThrow('폐기');
  expect(await previewInvite(a,'not-a-code')).toEqual({state:'invalid'});
  await expect(asUser(a,'select accept_group_invite($1)',[null])).rejects.toThrow('초대 코드');
});

test('정원·모집 마감·기간 종료·양방향 차단은 초대를 소비하지 않고 가입을 막는다',async()=>{
  const inv=await invite();await db.query('update small_groups set max_members=1 where id=$1',[privateGroup]);
  expect(await previewInvite(a,inv.code)).toMatchObject({state:'full'});await expect(asUser(a,'select accept_group_invite($1)',[inv.code])).rejects.toThrow('정원');
  await db.query("update small_groups set max_members=6,status='active' where id=$1",[privateGroup]);
  expect(await previewInvite(a,inv.code)).toEqual({state:'closed'});await expect(asUser(a,'select accept_group_invite($1)',[inv.code])).rejects.toThrow('모집');
  await db.query("update small_groups set status='recruiting',end_date=current_date-1 where id=$1",[privateGroup]);await expect(asUser(a,'select accept_group_invite($1)',[inv.code])).rejects.toThrow('모집');
  await db.query('update small_groups set end_date=current_date+28 where id=$1',[privateGroup]);
  for(const [from,to] of [[a,c],[c,a]]){await asUser(from,'insert into user_blocks(blocked_user_id) values($1)',[to]);expect(await previewInvite(a,inv.code)).toEqual({state:'invalid'});await expect(asUser(a,'select accept_group_invite($1)',[inv.code])).rejects.toThrow('사용할 수');await asUser(from,'delete from user_blocks where blocked_user_id=$1',[to]);}
  expect((await db.query('select redeemed_at from group_invites where id=$1',[proof])).rows).toEqual([{redeemed_at:null}]);
});

test('서로 다른 코드의 마지막 자리 요청에서도 정원을 넘지 않고 실패한 코드는 남는다',async()=>{
  const first=await invite(),second=await invite(routine);await db.query('update small_groups set max_members=2 where id=$1',[privateGroup]);
  await asUser(a,'select accept_group_invite($1)',[first.code]);await expect(asUser(b,'select accept_group_invite($1)',[second.code])).rejects.toThrow('정원');
  expect((await db.query('select redeemed_at from group_invites where id=$1',[routine])).rows).toEqual([{redeemed_at:null}]);
  expect((await db.query('select * from group_members where group_id=$1',[privateGroup])).rows).toHaveLength(2);
});

test('멤버 저장 실패 시 초대 사용도 롤백되고 동의 없는 가입·공개 모임 초대 발급을 거절한다',async()=>{
  const inv=await invite();await db.query('delete from community_consents where user_id=$1',[a]);await expect(asUser(a,'select accept_group_invite($1)',[inv.code])).rejects.toThrow('수칙');await consent();
  await expect(asUser(b,'select issue_group_invite($1,$2)',[group,routine])).rejects.toThrow('비공개');
  await db.exec("create function fail_invite_member() returns trigger language plpgsql as $$ begin raise exception '강제 저장 실패'; end $$; create trigger fail_invite_member before insert on group_members for each row execute function fail_invite_member();");
  try{await expect(asUser(a,'select accept_group_invite($1)',[inv.code])).rejects.toThrow('강제 저장 실패');expect((await db.query('select redeemed_at from group_invites where id=$1',[proof])).rows).toEqual([{redeemed_at:null}]);}
  finally{await db.exec('drop trigger fail_invite_member on group_members; drop function fail_invite_member();');}
});
const changeStatus = (user: string, next: string | null, expected: string | null, gid = group) =>
  asUser(user, 'select change_group_status($1,$2,$3)', [gid,next,expected]);

test('방장만 모집을 마감하고 종료하며 반복 요청은 기존 멤버·기간·기록을 보존한다', async () => {
  await asUser(b,"insert into community_consents(version) values ('2026-10-27')");
  const before=(await db.query<Record<string,unknown>>('select * from small_groups where id=$1',[group])).rows[0];
  await changeStatus(b,'active','recruiting');await changeStatus(b,'active','recruiting');
  await expect(asUser(c,'select join_group($1)',[group])).rejects.toThrow('모집');
  await changeStatus(b,'completed','active');await changeStatus(b,'completed','active');
  expect((await db.query('select * from small_groups where id=$1',[group])).rows).toEqual([{...before,status:'completed'}]);
  expect((await db.query('select * from group_members where group_id=$1',[group])).rows).toHaveLength(2);
  expect((await db.query('select * from group_weekly_shares where group_id=$1',[group])).rows).toHaveLength(1);
  await expect(changeStatus(b,'active','recruiting')).rejects.toThrow('바뀌었어요');
});

test('수칙 미동의·타인·누락·단계 건너뛰기·잘못된 상태 요청은 변경하지 않는다',async()=>{
  await expect(changeStatus(b,'active','recruiting')).rejects.toThrow('수칙');await consent();
  await expect(changeStatus(a,'active','recruiting')).rejects.toThrow('방장');
  await expect(changeStatus(a,'active','recruiting',routine)).rejects.toThrow('방장');
  await asUser(b,"insert into community_consents(version) values ('2026-10-27')");
  for(const [next,expected] of [['completed','recruiting'],['recruiting','active'],[null,'recruiting'],['active',null],['wrong','recruiting']]) {
    await expect(changeStatus(b,next,expected)).rejects.toThrow('허용되지');
  }
  expect((await db.query('select status from small_groups where id=$1',[group])).rows).toEqual([{status:'recruiting'}]);
  expect((await db.query("select has_function_privilege('anon','public.change_group_status(uuid,text,text)','execute') as allowed")).rows).toEqual([{allowed:false}]);
});

test('지난 기간의 시작과 구버전 직접 UPDATE의 역방향·단계 생략을 차단한다',async()=>{
  await asUser(b,"insert into community_consents(version) values ('2026-10-27')");
  await db.query("update small_groups set end_date=(now() at time zone 'Asia/Seoul')::date-1 where id=$1",[group]);
  await expect(changeStatus(b,'active','recruiting')).rejects.toThrow('기간');
  await expect(asUser(b,"update small_groups set status='active' where id=$1",[group])).rejects.toThrow('기간');
  await db.query("update small_groups set end_date=(now() at time zone 'Asia/Seoul')::date where id=$1",[group]);
  await expect(asUser(b,"update small_groups set status='completed' where id=$1",[group])).rejects.toThrow('허용되지');
  await changeStatus(b,'active','recruiting');await changeStatus(b,'completed','active');
  await expect(asUser(b,"update small_groups set status='active' where id=$1",[group])).rejects.toThrow('허용되지');
  expect((await db.query('select status from small_groups where id=$1',[group])).rows).toEqual([{status:'completed'}]);
});
const report = (user = a, type = 'weekly_share', target = share, gid = group, reason = 'harassment') =>
  asUser(user, 'select report_community_content($1,$2::uuid,$3::uuid,$4)', [type, target, gid, reason]);

test('서버와 홈은 요일별 분모·휴식일·보관 이력·오늘 미완료 스트릭을 동일하게 계산한다', async () => {
  const [{ date }] = (await db.query<{ date: string }>("select (now() at time zone 'Asia/Seoul')::date::text as date")).rows;
  const shift = (n: number) => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate()+n); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
  const base: Habit = { id: routine, userId: '', title: '매일', emoji: '', when: '', frequency: 'daily', createdAt: shift(-8) };
  const archived = withHistory({ ...base, id: proof }, { archivedAt: shift(-2), frequency: 'weekends' }, shift(-2));
  const habits = [base, archived, { ...base, id: share, createdAt: date }];
  const logs = Array.from({ length: 8 }, (_, i) => ({ habitId: base.id, date: shift(-i-1), completed: i !== 5, skipped: i === 5 }));
  for (const h of habits) {
    const row = habitToRow(h);
    await db.query('insert into habits(id,user_id,title,emoji,when_text,frequency,created_at,archived_at,schedule_history) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [h.id,a,h.title,h.emoji,h.when,h.frequency,`${h.createdAt}T00:00:00+09:00`,row.archived_at,JSON.stringify(row.schedule_history)]);
  }
  for (const l of logs) await db.query('insert into habit_logs(user_id,habit_id,date,completed,skipped) values ($1,$2,$3,$4,$5)', [a,l.habitId,l.date,l.completed,l.skipped]);
  for (const weekStart of [0,1]) {
    const [actual] = (await asUser(a, 'select * from get_group_member_progress_v2($1,$2,$3) where user_id=$4', [group,'Asia/Seoul',weekStart,a]));
    const start = shift(-((new Date(date+'T12:00:00').getDay()-weekStart+7)%7));
    const day = getDayCompletion(date,habits,logs,[],[]);
    const period = getPeriodCompletion(new Date(start+'T12:00:00'),new Date(date+'T12:00:00'),date,habits,logs,[],[]);
    expect(actual).toMatchObject({ today_personal_rate: day.personalRate, today_faith_rate: -1,
      weekly_rate: period.combinedRate, streak: calcStreak([],[],date,habits,logs).current });
    expect(actual.streak).toBe(8);
  }
  // 보관은 UPDATE이며 원본과 로그가 남고, 다른 계정은 여전히 볼 수 없다.
  expect((await asUser(a,'select id from habits')).length).toBe(3);
  expect(await asUser(b,'select * from habit_logs')).toEqual([]);
});

test('회원별 시간대를 사용하고 조회자의 시간대가 타인 통계를 바꾸지 않는다', async () => {
  // 26시간 차이로 실행 시각·서머타임과 관계없이 날짜가 다르다.
  const zones = ['Pacific/Kiritimati','Etc/GMT+12'];
  const dates: string[] = [];
  for (const z of zones) dates.push((await db.query<{ date: string }>('select (now() at time zone $1)::date::text as date',[z])).rows[0].date);
  expect(dates[0]).not.toBe(dates[1]);
  for (const uid of [a,b]) {
    const id = uid === a ? routine : proof;
    await db.query("insert into habits(id,user_id,title,frequency,created_at) values ($1,$2,'독서','daily',now()-interval '10 days')",[id,uid]);
    await db.query('insert into habit_logs(user_id,habit_id,date,completed) values ($1,$2,$3,true)',[uid,id,dates[0]]);
  }
  await db.query('insert into user_settings(user_id,settings) values ($1,$2) on conflict(user_id) do update set settings=excluded.settings',[b,JSON.stringify({ timeZone: zones[0],weekStartDay:0 })]);
  const east = await asUser(a,'select * from get_group_member_progress_v2($1,$2,1)',[group,zones[0]]);
  const west = await asUser(a,'select * from get_group_member_progress_v2($1,$2,1)',[group,zones[1]]);
  expect(east.find(r=>r.user_id===a)?.today_personal_rate).toBe(100);
  expect(west.find(r=>r.user_id===a)?.today_personal_rate).toBe(0);
  expect(east.find(r=>r.user_id===b)).toEqual(west.find(r=>r.user_id===b));
  await expect(asUser(c,'select * from get_group_member_progress_v2($1)',[group])).rejects.toThrow('멤버만');
  await expect(asUser(a,'select * from get_group_member_progress_v2($1,$2)',[group,'invalid-zone'])).rejects.toThrow('시간대');
  await expect(asUser(a,'select * from get_group_member_progress_v2($1,null,7)',[group])).rejects.toThrow('시작 요일');
  await asUser(a,'insert into user_blocks(blocked_user_id) values ($1)',[b]);
  expect(await asUser(a,'select user_id from get_group_member_progress_v2($1)',[group])).toEqual([{user_id:a}]);
});

test('연속 기록 상한은 365일이고 신앙 선택 요일과 쉬어가기를 포함한다',async()=>{
  await db.query("insert into daily_routines(id,user_id,title,type,frequency,is_active,created_at) values ($1,$2,'기도','faith','\"daily\"',true,now()-interval '401 days')",[routine,a]);
  await db.query("insert into routine_logs(user_id,routine_id,date,skipped) select $1,$2,(now() at time zone 'Asia/Seoul')::date-i,true from generate_series(0,400) i",[a,routine]);
  const [row]=await asUser(a,"select * from get_group_member_progress_v2($1,'Asia/Seoul',1) where user_id=$2",[group,a]);
  expect(row).toMatchObject({today_personal_rate:-1,today_faith_rate:100,weekly_rate:100,streak:365});
  await db.query("update daily_routines set frequency=jsonb_build_array(extract(dow from now() at time zone 'Asia/Seoul')::int) where id=$1",[routine]);
  const [custom]=await asUser(a,"select * from get_group_member_progress_v2($1,'Asia/Seoul',0) where user_id=$2",[group,a]);
  expect(custom).toMatchObject({today_faith_rate:100,weekly_rate:100,streak:53});
});

test('같은 나눔 ID로 재전송해도 중복되지 않고 다른 회원의 나눔을 덮어쓰지 못한다',async()=>{
  await consent();
  const sql="insert into group_weekly_shares(id,group_id,week_number,year,comment) values ($1,$2,44,2026,$3) on conflict(id) do update set comment=excluded.comment";
  await asUser(a,sql,[routine,group,'처음']);await asUser(a,sql,[routine,group,'다시']);
  expect(await asUser(a,'select comment from group_weekly_shares where id=$1',[routine])).toEqual([{comment:'다시'}]);
  await expect(asUser(a,sql,[share,group,'덮어쓰기'])).rejects.toThrow(/row-level security/);
});

beforeAll(async () => {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table storage.buckets(id text primary key, name text, public boolean);
    create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function storage.foldername(text) returns text[] language sql immutable
      as $$ select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1] $$;
    grant usage on schema public, auth, storage to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to authenticated, service_role;
    grant all on storage.objects to authenticated;
  `);
  for (const migration of [initialSchema, profilePermissions, deleteAccount, sharedRoutines, weeklyGoals, communitySafety, historyProgress, reviewHabits, membershipRecovery, groupCreation, groupStatusRecovery, privateGroupInvites, goalConnections, goalEditValidation]) await db.exec(migration);
}, 20000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  await db.exec('truncate auth.users cascade');
  await db.exec('truncate storage.objects');
  for (const user of [a, b, c]) await db.query('insert into auth.users(id,email) values ($1,$2)', [user, `${user[0]}@example.test`]);
  await db.query("insert into small_groups(id,creator_id,title,start_date,end_date) values ($1,$2,'모임',current_date,current_date+28)", [group, b]);
  await db.query("insert into small_groups(id,creator_id,title,start_date,end_date,is_public) values ($1,$2,'비공개',current_date,current_date+28,false)", [privateGroup, c]);
  for (const user of [a, b]) await db.query('insert into group_members(group_id,user_id) values ($1,$2)', [group, user]);
  await db.query('insert into group_members(group_id,user_id) values ($1,$2)', [privateGroup, c]);
  await db.query("insert into group_weekly_shares(id,group_id,user_id,week_number,year,comment) values ($1,$2,$3,44,2026,'나눔')", [share, group, b]);
  await db.query("insert into shared_routines(id,group_id,user_id,title) values ($1,$2,$3,'독서')", [routine, group, b]);
  await db.query("insert into routine_proofs(id,group_id,user_id,routine_title,photo_path) values ($1,$2,$3,'독서',$4)", [proof, group, b, `${b}/proof.jpg`]);
  await db.query("insert into storage.objects(bucket_id,name) values ('proofs',$1)", [`${b}/proof.jpg`]);
});

test('수칙 미동의 상태의 게시를 막고 본인 동의 후에만 허용한다', async () => {
  const insert = 'insert into group_weekly_shares(group_id,week_number,year) values ($1,44,2026)';
  await expect(asUser(a, insert, [group])).rejects.toThrow(/row-level security/);
  await expect(asUser(a, "insert into community_consents(user_id,version) values ($1,'2026-10-27')", [b])).rejects.toThrow(/row-level security/);
  await consent();
  await expect(asUser(a, insert, [group])).resolves.toEqual([]);
  await expect(asUser(c, insert, [group])).rejects.toThrow(/row-level security/);
});

test('신고는 서버가 작성자를 확인하고 중복을 접수 한 건으로 유지한다', async () => {
  await report(); await report();
  const rows = await asUser(a, 'select reporter_id,target_user_id,reason,status from content_reports');
  expect(rows).toEqual([{ reporter_id: a, target_user_id: b, reason: 'harassment', status: 'pending' }]);
  expect(await asUser(b, 'select * from content_reports')).toEqual([]);
  await expect(asUser(a, "update content_reports set status='resolved'")).rejects.toThrow(/permission denied/);
  await expect(asUser(a, "insert into content_reports(target_type,target_id,reason) values ('member',$1,'spam')", [b])).rejects.toThrow(/permission denied/);
});

test('비멤버·소모임 위조·없는 대상·자기 자신 신고를 거부한다', async () => {
  await expect(report(c)).rejects.toThrow('대상을 확인');
  await expect(report(a, 'weekly_share', share, privateGroup)).rejects.toThrow('대상을 확인');
  await expect(report(a, 'proof', share)).rejects.toThrow('대상을 확인');
  await expect(report(a, 'member', a)).rejects.toThrow('대상을 확인');
  await expect(report(a, 'weekly_share', share, group, 'invalid')).rejects.toThrow(/check constraint/);
});

test('공개 소모임은 참여 전에도 신고할 수 있고 비공개 모임 정보는 검증한다', async () => {
  await expect(report(c, 'group', group)).resolves.toBeDefined();
  await expect(report(a, 'group', privateGroup, privateGroup)).rejects.toThrow('대상을 확인');
  for (const [type, id] of [['member', b], ['routine_share', routine], ['proof', proof]]) {
    await expect(report(a, type, id)).resolves.toBeDefined();
  }
});

test('차단은 서버의 모임·나눔·루틴·사진·멤버 집계에서도 숨기고 해제로 복원한다', async () => {
  expect(await asUser(a, 'select user_id from get_group_member_progress($1)', [group])).toHaveLength(2);
  await asUser(a, 'insert into user_blocks(blocked_user_id) values ($1)', [b]);
  for (const table of ['small_groups', 'group_weekly_shares', 'shared_routines', 'routine_proofs']) {
    expect(await asUser(a, `select * from ${table}`)).toEqual([]);
  }
  expect(await asUser(a, 'select * from storage.objects')).toEqual([]);
  await expect(asUser(a, 'select adopt_shared_routine($1)', [routine])).rejects.toThrow('확인할 수 없어요');
  await expect(asUser(a, "insert into cheers(share_id,group_id,type) values ($1,$2,'heart')", [share, group])).rejects.toThrow(/row-level security/);
  expect(await asUser(a, 'select user_id from get_group_member_progress($1)', [group])).toEqual([{ user_id: a }]);
  await asUser(a, 'delete from user_blocks where blocked_user_id=$1', [b]);
  expect(await asUser(a, 'select * from routine_proofs')).toHaveLength(1);
  expect(await asUser(a, 'select * from storage.objects')).toHaveLength(1);
});

test('차단된 상대방도 내 게시물과 멤버 현황을 볼 수 없다', async () => {
  await db.query('insert into group_weekly_shares(group_id,user_id,week_number,year) values ($1,$2,44,2026)', [group, a]);
  await asUser(a, 'insert into user_blocks(blocked_user_id) values ($1)', [b]);
  expect(await asUser(b, 'select * from group_weekly_shares where user_id=$1', [a])).toEqual([]);
  expect(await asUser(b, 'select user_id from get_group_member_progress($1)', [group])).toEqual([{ user_id: b }]);
});

test('남의 차단 목록 조회·위조·삭제와 자기 자신 차단을 막는다', async () => {
  await asUser(a, 'insert into user_blocks(blocked_user_id) values ($1)', [b]);
  expect(await asUser(b, 'select * from user_blocks')).toEqual([]);
  await expect(asUser(b, 'insert into user_blocks(user_id,blocked_user_id) values ($1,$2)', [a, c])).rejects.toThrow(/row-level security/);
  await asUser(b, 'delete from user_blocks where user_id=$1', [a]);
  expect(await asUser(a, 'select * from user_blocks')).toHaveLength(1);
  await expect(asUser(a, 'insert into user_blocks(blocked_user_id) values ($1)', [a])).rejects.toThrow(/check constraint/);
});

test('익명 신고·차단과 필터 우회 집계 실행 권한을 주지 않는다', async () => {
  for (const fn of ['report_community_content(text,uuid,uuid,text)', 'is_community_blocked(uuid)', 'get_group_member_progress(uuid)', 'get_group_member_progress_unfiltered(uuid)']) {
    const { rows } = await db.query<{ allowed: boolean }>("select has_function_privilege('anon',$1,'execute') as allowed", [fn]);
    expect(rows[0].allowed).toBe(false);
  }
  const { rows } = await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','get_group_member_progress_unfiltered(uuid)','execute') as allowed");
  expect(rows[0].allowed).toBe(false);
});

test('계정 삭제 시 동의·차단·신고도 함께 지워진다', async () => {
  await consent(); await report();
  await asUser(a, 'insert into user_blocks(blocked_user_id) values ($1)', [b]);
  await asUser(a, 'select delete_account()');
  for (const table of ['community_consents', 'user_blocks', 'content_reports']) expect((await db.query(`select * from ${table}`)).rows).toEqual([]);
});


test('개인 습관 조정과 적용 시각을 리뷰에 저장하며 계정 RLS와 JSON 배열 제약을 유지한다',async()=>{
  const changes=[{habitId:routine,title:'독서',action:'add',newHabit:{title:'독서',frequency:'daily',emoji:'📚',when:'퇴근 후'}}];
  await asUser(a,"insert into weekly_reviews(id,week_number,year,habit_changes,changes_applied_at) values ($1,44,2026,$2::jsonb,'2026-10-27T12:00:00Z')",[routine,JSON.stringify(changes)]);
  const rows=await asUser(a,'select habit_changes,changes_applied_at is not null as applied from weekly_reviews where id=$1',[routine]);
  expect(rows).toEqual([{habit_changes:changes,applied:true}]);
  expect(await asUser(b,'select * from weekly_reviews where id=$1',[routine])).toEqual([]);
  await expect(asUser(a,"update weekly_reviews set habit_changes='{}'::jsonb where id=$1",[routine])).rejects.toThrow(/check constraint/);
});


test('가입 정원·모집 마감·비공개·차단은 서버에서 거절하며 회원의 재가입·재탈퇴는 멱등이다', async()=>{
  await db.query("update small_groups set max_members=2 where id=$1",[group]);
  await expect(asUser(c,'select join_group($1)',[group])).rejects.toThrow(/정원/);
  await asUser(a,'select join_group($1)',[group]); // 정원이 차도 이미 가입한 요청은 성공
  await asUser(a,'select leave_group($1)',[group]);await asUser(a,'select leave_group($1)',[group]);
  await asUser(c,'select join_group($1)',[group]);
  expect((await db.query('select * from group_members where group_id=$1',[group])).rows).toHaveLength(2);
  await expect(asUser(b,'select leave_group($1)',[group])).rejects.toThrow(/방장/);
  await db.query("update small_groups set max_members=3,status='active' where id=$1",[group]);
  await expect(asUser(a,'select join_group($1)',[group])).rejects.toThrow(/모집/);
  await expect(asUser(a,'select join_group($1)',[privateGroup])).rejects.toThrow(/참여할 수/);
  await db.query("update small_groups set status='recruiting' where id=$1",[group]);
  await asUser(a,'insert into user_blocks(blocked_user_id) values($1)',[b]);
  await expect(asUser(a,'select join_group($1)',[group])).rejects.toThrow(/참여할 수/);
});

test('테이블 직접 쓰기로 정원 검사나 회원 역할을 우회할 수 없고 방장 생성은 유지된다', async()=>{
  await expect(asUser(c,"insert into group_members(group_id,user_id,role) values($1,$2,'member')",[group,c])).rejects.toThrow(/row-level security/);
  expect(await asUser(a,"update group_members set role='creator',group_id=$1 where user_id=$2 returning user_id",[privateGroup,a])).toEqual([]);
  expect(await asUser(b,'delete from group_members where group_id=$1 and user_id=$2 returning user_id',[group,b])).toEqual([]);
  await db.query('delete from group_members where group_id=$1 and user_id=$2',[group,b]);
  await asUser(b,"insert into group_members(group_id,user_id,role) values($1,$2,'creator')",[group,b]);
});

test('마지막 한 자리를 두 요청이 차지하려 해도 정원과 회원 유일성이 유지된다', async()=>{
  await db.query('delete from group_members where group_id=$1 and user_id=$2',[group,a]);
  await db.query('update small_groups set max_members=2 where id=$1',[group]);
  // PGlite는 단일 연결이므로 직렬 경쟁 경로를 검사한다. 실제 다중 연결 부하는 별도 검증 대상이다.
  await asUser(a,'select join_group($1)',[group]);
  await expect(asUser(c,'select join_group($1)',[group])).rejects.toThrow(/정원/);
  await asUser(a,'select join_group($1)',[group]);
  expect((await db.query('select * from group_members where group_id=$1',[group])).rows).toHaveLength(2);
});


const creationDetails = {title:'작은 산책',goal:'하루 10분',start_date:'2026-10-27',end_date:'2026-11-24',max_members:6,is_public:true,rules:['서로 응원']};
test('모임과 방장을 함께 생성하고 응답 유실 재시도는 기존 내용·회원 수를 유지한다',async()=>{
  const call='select create_group_with_owner($1,$2)';
  await expect(asUser(a,call,[proof,creationDetails])).rejects.toThrow('수칙');await consent();
  await asUser(a,call,[proof,creationDetails]);await asUser(a,call,[proof,{...creationDetails,title:'덮어쓰면 안 됨',creator_id:b}]);
  expect(await asUser(a,'select title,creator_id from small_groups where id=$1',[proof])).toEqual([{title:'작은 산책',creator_id:a}]);
  expect(await asUser(a,'select user_id,role from group_members where group_id=$1',[proof])).toEqual([{user_id:a,role:'creator'}]);
  await asUser(b,"insert into community_consents(version) values ('2026-10-27')");await expect(asUser(b,call,[proof,creationDetails])).rejects.toThrow('내가 만든');
});
test('방장 등록이 실패하면 새 모임도 롤백하고 구버전의 모임만 있는 상태를 복구한다',async()=>{
  await consent();
  await db.exec("create function fail_owner_test() returns trigger language plpgsql as $$ begin raise exception 'simulated member failure'; end $$; create trigger fail_owner_test before insert on group_members for each row execute function fail_owner_test();");
  try {await expect(asUser(a,'select create_group_with_owner($1,$2)',[proof,creationDetails])).rejects.toThrow('simulated');expect((await db.query('select id from small_groups where id=$1',[proof])).rows).toEqual([]);}
  finally {await db.exec('drop trigger fail_owner_test on group_members; drop function fail_owner_test();');}
  await db.query("insert into small_groups(id,creator_id,title,start_date,end_date) values ($1,$2,'기존 내용',current_date,current_date+28)",[proof,a]);
  await asUser(a,'select create_group_with_owner($1,null)',[proof]);
  expect(await asUser(a,'select title from small_groups where id=$1',[proof])).toEqual([{title:'기존 내용'}]);
  expect(await asUser(a,'select role from group_members where group_id=$1',[proof])).toEqual([{role:'creator'}]);
});
test('없는 모임의 복구나 잘못된 생성 내용은 부분 행을 남기지 않는다',async()=>{
  await consent();await expect(asUser(a,'select create_group_with_owner($1,null)',[proof])).rejects.toThrow('찾지');
  await expect(asUser(a,'select create_group_with_owner($1,$2)',[proof,{...creationDetails,max_members:100}])).rejects.toThrow('확인');
  expect((await db.query('select id from small_groups where id=$1',[proof])).rows).toEqual([]);
});
