import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

// Real PostgreSQL/WASM, in-memory only. Install the pinned QA dependency with
// npm ci --prefix qa/session-db --ignore-scripts. No provider/remote DB calls.
const require = createRequire(new URL('../qa/session-db/package.json', import.meta.url))
const { PGlite } = require('@electric-sql/pglite')
const root = fileURLToPath(new URL('../../', import.meta.url))
const db = new PGlite()
const hash = 'a'.repeat(64), wrong = 'b'.repeat(64)
const legacy = '55555555-5555-4555-8555-555555555555', expired = '66666666-6666-4666-8666-666666666666'
const rpc = async (name, id, token = hash) => (await db.query(`select public.${name}($1::uuid,$2::text) as result`, [id, token])).rows[0].result
const authorize = (id, token) => rpc('web_mvp_authorize_session', id, token)
const remove = (id, token) => rpc('web_mvp_delete_owned_session', id, token)

before(async () => {
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
  // Execute the recovered site's original schema in a clean, non-production DB.
  const directory = resolve(root, 'logs/sites/onju-web-mvp/supabase/migrations')
  const files = (await readdir(directory)).filter(name => /^00\d\d_.*\.sql$/.test(name) && Number(name.slice(0,4)) >= 7).sort()
  for (const name of files) await db.exec(await readFile(resolve(directory, name), 'utf8'))
  await db.query('insert into web_mvp_agent_sessions(session_id) values ($1)', [legacy])
  await db.query("insert into web_mvp_agent_sessions(session_id,access_token_hash,expires_at) values ($1,$2,now()-interval '1 day')", [expired, hash])
  await db.exec(await readFile(resolve(root, 'supabase/migrations/202609150001_web_mvp_session_ownership.sql'), 'utf8'))
  const regionalMigration = await readFile(resolve(root, 'supabase/migrations/202609150003_web_mvp_regional_context.sql'), 'utf8')
  await db.exec(regionalMigration)
  await db.exec(regionalMigration)
})
after(async () => { await db.close() })

test('PostgreSQL: additive regional migration accepts international values without changing historical dates', async () => {
  const id=crypto.randomUUID(); await authorize(id)
  await db.query("insert into web_mvp_daily_logs(session_id,log_date,timezone) values ($1,'2026-09-14','Asia/Seoul')",[id])
  await db.query("update web_mvp_agent_sessions set locale='en-GB',country_code='ZZ',currency_code='XXX',time_zone='America/Los_Angeles',week_starts_on=0 where session_id=$1",[id])
  await db.query("insert into web_mvp_daily_logs(session_id,log_date,timezone) values ($1,'2026-09-15','America/Los_Angeles')",[id])
  const rows=(await db.query('select log_date::text,timezone from web_mvp_daily_logs where session_id=$1 order by log_date',[id])).rows
  assert.deepEqual(rows,[{log_date:'2026-09-14',timezone:'Asia/Seoul'},{log_date:'2026-09-15',timezone:'America/Los_Angeles'}])
  await assert.rejects(db.query('update web_mvp_agent_sessions set week_starts_on=6 where session_id=$1',[id]), /check/)
})

test('PostgreSQL: authorize creates once, denies a different owner and preserves conversation version', async () => {
  const id = crypto.randomUUID()
  assert.equal(await authorize(id), 'created')
  const before = (await db.query('select updated_at from web_mvp_agent_sessions where session_id=$1', [id])).rows[0]
  assert.equal(await authorize(id, wrong), 'session_forbidden')
  assert.equal(await authorize(id), 'authorized')
  assert.deepEqual((await db.query('select updated_at from web_mvp_agent_sessions where session_id=$1', [id])).rows[0], before)
})
test('PostgreSQL: legacy ownerless rows cannot be claimed; expired rows cannot be renewed', async () => {
  assert.equal(await authorize(legacy), 'session_recovery_required')
  assert.equal(await authorize(expired), 'session_expired')
  await assert.rejects(db.query("update web_mvp_agent_sessions set expires_at=now()+interval '30 days' where session_id=$1", [expired]), /session_expired/)
  assert.equal(await remove(expired), 'deleted')
})
test('PostgreSQL: concurrent queued requests cannot replace the first owner (single-engine queue)', async () => {
  const id = crypto.randomUUID()
  assert.deepEqual(await Promise.all([authorize(id), authorize(id,wrong), authorize(id)]), ['created','session_forbidden','authorized'])
  // PGlite queues queries: this does not prove independent-connection lock timing.
})
test('PostgreSQL: deletion cascades, retries are idempotent, late writes cannot resurrect data', async () => {
  const id = crypto.randomUUID()
  await authorize(id)
  await db.query('insert into web_mvp_provider_responses(response_id,session_id) values ($1,$2)', ['resp_delete',id])
  assert.equal(await remove(id,wrong),'session_forbidden')
  assert.equal(await remove(id),'deleted')
  assert.equal(await remove(id),'deleted')
  assert.equal(await authorize(id),'session_revoked')
  assert.equal((await db.query('select * from web_mvp_provider_responses where session_id=$1',[id])).rows.length,0)
  await assert.rejects(db.query('insert into web_mvp_agent_sessions(session_id,access_token_hash) values ($1,$2)',[id,hash]), /session_revoked/)
  await assert.rejects(db.query('insert into web_mvp_provider_responses(response_id,session_id) values ($1,$2)',['resp_late',id]), /session_revoked/)
})
test('PostgreSQL: unknown deletion never creates a session, invalid hashes are rejected', async () => {
  const id=crypto.randomUUID()
  assert.equal(await remove(id),'session_not_found')
  assert.equal(await authorize(id,null),'invalid_session_token')
  assert.equal(await authorize(id,'short'),'invalid_session_token')
  assert.equal((await db.query('select * from web_mvp_agent_sessions where session_id=$1',[id])).rows.length,0)
})
test('PostgreSQL: child ownership cannot be moved to another session', async () => {
  const a=crypto.randomUUID(), b=crypto.randomUUID()
  await authorize(a); await authorize(b)
  await db.query('insert into web_mvp_provider_responses(response_id,session_id) values ($1,$2)',['resp_immutable',a])
  await assert.rejects(db.query('update web_mvp_provider_responses set session_id=$1 where response_id=$2',[b,'resp_immutable']), /session_forbidden/)
  await assert.rejects(db.query('update web_mvp_agent_sessions set access_token_hash=$1 where session_id=$2',[wrong,a]), /session_forbidden/)
})
test('PostgreSQL: every existing session FK table has the late-write guard', async () => {
  const missing=await db.query(`select distinct c.relname from pg_constraint fk
    join pg_class c on c.oid=fk.conrelid
    where fk.contype='f' and fk.confrelid='public.web_mvp_agent_sessions'::regclass
    and not exists (select 1 from pg_trigger t where t.tgrelid=c.oid and t.tgname='web_mvp_guard_child_session')`)
  assert.deepEqual(missing.rows,[])
})
test('PostgreSQL: public roles cannot execute ownership RPCs or read ownership ledgers', async () => {
  for(const role of ['anon','authenticated']) {
    for(const fn of ['web_mvp_authorize_session(uuid,text)','web_mvp_delete_owned_session(uuid,text)']) {
      assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') as allowed',[role,fn])).rows[0].allowed,false)
    }
    for(const table of ['web_mvp_provider_responses','web_mvp_session_tombstones']) {
      assert.equal((await db.query('select has_table_privilege($1,$2,\'select\') as allowed',[role,table])).rows[0].allowed,false)
    }
  }
})
