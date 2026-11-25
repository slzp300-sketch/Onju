// @vitest-environment node
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import schema from '../../supabase/migrations/0003_web_push.sql?raw';
import reliability from '../../supabase/migrations/202610270002_notification_reliability.sql?raw';
const db = new PGlite();
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    alter default privileges in schema public grant all on tables to authenticated,service_role;`);
  await db.exec(schema); await db.exec(reliability);
  await db.query('insert into auth.users values ($1),($2)', [a,b]);
}, 20_000);
afterAll(async () => db.close());
beforeEach(async () => db.exec('truncate reminder_schedule'));
async function asUser(user: string, sql: string, args: unknown[] = []) {
  await db.exec('begin; set local role authenticated;');
  try {
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    const result = await db.query(sql, args); await db.exec('commit'); return result.rows;
  } catch (e) { await db.exec('rollback'); throw e; }
}
const spec = { key: 'morning', title: '시작', body: '루틴 확인', hour: 8, minute: 0, weekdays: null };
const replace = (user: string, specs: unknown[], timezone = 'Asia/Seoul') => asUser(user, 'select replace_reminder_schedule($1::jsonb,$2)', [JSON.stringify(specs),timezone]);
test('유효한 목록만 한 번에 교체하며 잘못된 목록은 기존 예약을 보존한다', async () => {
  await replace(a, [spec]);
  await expect(replace(a, [{ ...spec, title: '변경' }, { ...spec, key: 'invalid', hour: 25 }])).rejects.toThrow(/check constraint/);
  expect(await asUser(a, 'select title from reminder_schedule')).toEqual([{ title: '시작' }]);
  await replace(a, [{ ...spec, key: 'evening', hour: 21 }]);
  expect(await asUser(a, 'select key,hour from reminder_schedule')).toEqual([{ key: 'evening', hour: 21 }]);
});
test('소유자끼리 격리하고 빈 목록은 자기 계정만 취소한다', async () => {
  await replace(a, [spec]); await replace(b, [spec]); await replace(a, []);
  expect(await asUser(a, 'select * from reminder_schedule')).toEqual([]);
  expect(await asUser(b, 'select key from reminder_schedule')).toEqual([{ key: 'morning' }]);
});
test('빈 요일·잘못된 시간대·중복 키는 모두 거부한다', async () => {
  await expect(replace(a, [{ ...spec, weekdays: [] }])).rejects.toThrow('invalid weekdays');
  await expect(replace(a, [spec], 'invalid/zone')).rejects.toThrow('invalid timezone');
  await expect(replace(a, [spec,spec])).rejects.toThrow();
});
test('일반 계정은 서버 발송을 선점할 수 없다', async () => {
  await expect(asUser(a, 'select * from claim_due_reminders()')).rejects.toThrow(/permission denied/);
});
test('현재 시간대·요일만 선점하며 같은 분에는 두 번 발송하지 않는다', async () => {
  await db.exec('begin');
  try {
    await db.query(`insert into reminder_schedule(user_id,key,title,body,hour,minute,weekdays,timezone)
      select $1,key,'제목','내용',extract(hour from now() at time zone zone),extract(minute from now() at time zone zone),
      case when key='wrong-day' then array[((extract(dow from now() at time zone zone)::int+1)%7)+1]::smallint[] else null end,zone
      from (values ('seoul','Asia/Seoul'),('utc','UTC'),('wrong-day','UTC')) v(key,zone)`, [a]);
    await db.exec('set local role service_role');
    const first = await db.query<{ key: string }>('select key from claim_due_reminders()');
    expect(first.rows.map(r => r.key).sort()).toEqual(['seoul','utc']);
    expect((await db.query('select * from claim_due_reminders()')).rows).toEqual([]);
  } finally { await db.exec('rollback'); }
});
