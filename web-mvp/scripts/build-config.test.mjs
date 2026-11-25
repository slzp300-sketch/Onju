import test from 'node:test'
import assert from 'node:assert/strict'
import { prepareBuildEnv } from '../../logs/sites/onju-web-mvp/scripts/build-config.mjs'
const sample = { ONJU_BUILD_ENV: 'process', ONJU_EXPECTED_SUPABASE_HOST: 'fixture.invalid', VITE_SUPABASE_URL: 'https://fixture.invalid', VITE_SUPABASE_ANON_KEY: 'sb_publishable_fixture' }

test('release source is explicit; no implicit file discovery or competing sources', () => {
  assert.throws(() => prepareBuildEnv({}), /exactly one/)
  assert.throws(() => prepareBuildEnv({ ...sample, ONJU_ENV_FILE: '/tmp/fixture' }), /exactly one/)
  assert.throws(() => prepareBuildEnv({ ONJU_ENV_FILE: 'relative' }), /absolute/)
})
test('explicit file is authoritative and provider/admin variables never reach builder', () => {
  const env = prepareBuildEnv({ ONJU_ENV_FILE: '/tmp/synthetic', ONJU_EXPECTED_SUPABASE_HOST: 'fixture.invalid', VITE_SUPABASE_URL: 'https://wrong.invalid', OPENAI_API_KEY: 'synthetic', SUPABASE_SERVICE_ROLE_KEY: 'synthetic' }, () => 'VITE_SUPABASE_URL=https://fixture.invalid\nVITE_SUPABASE_ANON_KEY=sb_publishable_fixture')
  assert.equal(env.VITE_SUPABASE_URL, sample.VITE_SUPABASE_URL)
  assert.equal(env.OPENAI_API_KEY, undefined)
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, undefined)
  assert.equal(env.ONJU_EXPLICIT_BUILD, '1')
})
test('wrong backend, non-origin URL, credentials in URL, secret and extra VITE variables fail closed', () => {
  for (const patch of [{ ONJU_EXPECTED_SUPABASE_HOST: '' }, { VITE_SUPABASE_URL: 'https://wrong.invalid' }, { VITE_SUPABASE_URL: 'http://fixture.invalid' }, { VITE_SUPABASE_URL: 'https://fixture.invalid/path' }, { VITE_SUPABASE_URL: 'https://user:pass@fixture.invalid' }, { VITE_SUPABASE_ANON_KEY: 'sb_secret_fixture' }, { VITE_ADMIN_KEY: 'synthetic' }]) assert.throws(() => prepareBuildEnv({ ...sample, ...patch }))
  const jwt = role => 'header.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.signature'
  assert.throws(() => prepareBuildEnv({ ...sample, VITE_SUPABASE_ANON_KEY: jwt('service_role') }))
  assert.equal(prepareBuildEnv({ ...sample, VITE_SUPABASE_ANON_KEY: jwt('anon') }).VITE_SUPABASE_ANON_KEY, jwt('anon'))
})
test('offline validation cannot be packaged as a release through build-site', () => {
  assert.throws(() => prepareBuildEnv({ ...sample, ONJU_OFFLINE: '1' }), /validation-only/)
})
