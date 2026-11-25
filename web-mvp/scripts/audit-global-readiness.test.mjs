import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { inspectSource, inspectSql, buildInventory, compareInventories, readTree, runAudit } from './audit-global-readiness.mjs'

test('static inspection finds calls but does not execute source or expose env values', () => {
  const result = inspectSource('test.ts', `throw new Error('must not execute');
    const key=Deno.env.get('SECRET_API_KEY'); const url=import.meta.env.VITE_SUPABASE_URL;
    // db.rpc('comment_only')
    db.rpc('web_mvp_rpc', {}); db.rpc(rpcName, {});
    db.from('web_mvp_sessions'); supabase.functions.invoke<Result>('onju-memory', {body:{action:'save'}});
    if(body.action==='load'){}; fetch('https://api.openai.com/v1/responses');`)
  assert.deepEqual(result.envNames, ['SECRET_API_KEY', 'VITE_SUPABASE_URL'])
  assert.deepEqual(result.actions, ['load', 'save'])
  assert.deepEqual(result.rpcs, ['web_mvp_rpc'])
  assert.equal(result.dynamicRpcs.length, 1)
  assert.equal(result.invocations[0].target, 'onju-memory')
  assert.deepEqual(result.providers, ['api.openai.com'])
})

test('SSE templates and dynamic service calls stay visible', () => {
  const result = inspectSource('test.ts', "fetch(`${url}/functions/v1/onju-agent-v2`); fetch(`${url}/functions/v1/${resolveAgentFunction()}`); supabase.functions.invoke(resolveAgentService('memory'), {});")
  assert.deepEqual(result.invocations.map(item => item.dynamic), [false, true, true])
})

test('SQL parser ignores comments and captures CREATE OR REPLACE functions', () => {
  assert.deepEqual(inspectSql(`-- create table web_mvp_fake (id uuid);
    /* create function public.web_mvp_fake() returns void; */
    create table if not exists public.web_mvp_budget(id uuid);
    create or replace function public.web_mvp_reserve(a bigint) returns boolean;
    alter table public.web_mvp_sessions add column access_token_hash text;`), {
    tables: ['web_mvp_budget'], functions: ['web_mvp_reserve'], accessTokenColumn: true,
  })
})

test('entry wrappers inherit runtime dependencies, not type-only imports', () => {
  const files = {
    'supabase/functions/v3/index.ts': "import '../v2/index.ts'",
    'supabase/functions/v2/index.ts': "import { claimWebMvpSession } from '../_shared/access.ts'; import type {OnlyType} from './unused.ts'; claimWebMvpSession(); db.from('web_mvp_sessions');",
    'supabase/functions/_shared/access.ts': "db.rpc('web_mvp_rate');",
    'supabase/functions/v2/unused.ts': "db.rpc('web_mvp_unused');",
    'supabase/migrations/0007_sessions.sql': 'create table public.web_mvp_sessions(id uuid);',
  }
  const result = buildInventory(files)
  assert.equal(result.handlers.find(item => item.name === 'v3').guardReferences.session, true)
  assert.deepEqual(result.missingRpcs, ['web_mvp_rate'])
  assert.deepEqual(result.missingTables, [])
})

test('same migration number with different SQL is a conflict, not a replacement', () => {
  const a = buildInventory({'supabase/migrations/0019_global.sql': 'select 1;'}), b = buildInventory({'supabase/migrations/0019_stability.sql': 'select 2;'})
  assert.equal(compareInventories(a, b).migrationVersionCollisions[0].version, '0019')
})

test('fingerprints are independent of CRLF and input insertion order', () => {
  const a = {'a.ts':'hello\r\n', 'b.ts':'world'}, b = {'b.ts':'world', 'a.ts':'hello\n'}
  assert.equal(buildInventory(a).sourceSha256, buildInventory(b).sourceSha256)
})

test('CLI requires explicit local source and output, rejecting live flags', () => {
  assert.throws(() => runAudit([]), /Usage/)
  assert.throws(() => runAudit(['--reference=x','--out=y','--live']), /Usage/)
})

test('named type-only imports do not count as executed guard dependencies', () => {
  assert.deepEqual(inspectSource('test.ts', "import {type Guard} from './guard.ts';").imports, [])
})

const root = fileURLToPath(new URL('../../', import.meta.url))
const baseline = JSON.parse(readFileSync(new URL('../../docs/agent/global-beta/stage-1-baseline.json', import.meta.url), 'utf8'))
const referenceSql = baseline.referenceMigrations.map(item => {
  const name = item.path.split('/').at(-1)
  return { ...item, text: readFileSync(new URL('../../docs/agent/global-beta/reference-migrations/' + name, import.meta.url), 'utf8') }
})

test('recovered SQL references match the pinned release commit hashes', () => {
  assert.equal(referenceSql.length, 15)
  for (const file of referenceSql) {
    assert.equal(createHash('sha256').update(file.text.replaceAll('\r\n', '\n')).digest('hex'), file.sha256, file.path)
  }
})

test('all local server entry points are accounted for in the reviewed inventory', () => {
  const inventory = buildInventory(readTree(root))
  assert.deepEqual(inventory.handlers.map(item => item.name).sort(), [...baseline.localHandlerNames].sort(), 'Review and update the endpoint register when adding or removing an entry point.')
})

test('every missing literal web DB dependency has recovered source, not guessed SQL', () => {
  const inventory = buildInventory(readTree(root))
  const definitions = referenceSql.map(item => inspectSql(item.text))
  const tables = new Set(definitions.flatMap(item => item.tables)), rpcs = new Set(definitions.flatMap(item => item.functions))
  assert.deepEqual(inventory.missingTables.filter(name => !tables.has(name)), [])
  assert.deepEqual(inventory.missingRpcs.filter(name => !rpcs.has(name)), [])
  assert.ok(definitions.some(item => item.accessTokenColumn))
  // Does not mean the references have been applied or SQL executes successfully.
})
