import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { EVAL_SUITES, evalOptions, prepareEvalPlan, assertLiveEvalAllowed } from './eval-plan.mjs'

test('all maintained scenarios are valid and default to planning without live calls', () => {
  let cases = 0, turns = 0
  for (const [suite, file] of Object.entries(EVAL_SUITES)) {
    const input = JSON.parse(readFileSync(new URL('../evals/' + file, import.meta.url), 'utf8'))
    const { manifest } = prepareEvalPlan(input, { all: true, suite })
    cases += manifest.caseCount
    turns += manifest.userTurns
    assert.equal(manifest.mode, 'offline_plan_only')
    assert.equal(manifest.liveQualityValidated, false)
    assert.match(manifest.fixtureHash, /^[a-f0-9]{64}$/)
  }
  assert.ok(cases >= 29)
  assert.ok(turns >= 59)
})

test('paid evaluation requires opt-in and a full-session turn limit before any requests', () => {
  const options = evalOptions(['--live', '--max-turns=10'])
  assert.throws(() => assertLiveEvalAllowed(options, { userTurns: 5 }, {}), /requires_live/)
  assert.throws(() => assertLiveEvalAllowed(options, { userTurns: 11 }, { ONJU_ALLOW_PAID_EVALS: '1' }), /max_turns/)
  assert.throws(() => assertLiveEvalAllowed(options, { userTurns: 5 }, { ONJU_ALLOW_PAID_EVALS: '1', ONJU_OFFLINE: '1' }), /offline_mode/)
  assert.doesNotThrow(() => assertLiveEvalAllowed(options, { userTurns: 10 }, { ONJU_ALLOW_PAID_EVALS: '1' }))
  assert.throws(() => evalOptions(['--max-turns=2.5']), /invalid/)
  assert.throws(() => evalOptions(['--english', '--adaptive']), /select_one/)
  assert.throws(() => evalOptions(['--live', '--dry-run']), /conflict/)
})

test('empty selections and invalid fixtures cannot produce misleading passing plans', () => {
  const fixture = [{ name: 'example', turns: ['hello'] }]
  assert.throws(() => prepareEvalPlan(fixture, { name: 'missing' }), /no_matching/)
  assert.throws(() => prepareEvalPlan([...fixture, ...fixture], {}), /duplicate/)
  assert.throws(() => prepareEvalPlan([{ name: 'blank', turns: [' '] }], {}), /invalid_eval_turns/)
})

test('evaluation CLI and demo report run with outbound networking blocked', () => {
  const guard = new URL('./offline-network-guard.mjs', import.meta.url).href
  const run = args => execFileSync(process.execPath, ['--import', guard, ...args], { encoding: 'utf8', timeout: 10_000 })
  const evalOutput = JSON.parse(run([fileURLToPath(new URL('./run-agent-evals.mjs', import.meta.url)), '--english', '--all']))
  assert.equal(evalOutput.mode, 'offline_plan_only')
  const demo = run([fileURLToPath(new URL('./report-metrics.mjs', import.meta.url)), '--demo', '--json'])
  assert.equal(JSON.parse(demo).source, 'synthetic_demo')
})

test('offline guard blocks fetch and TCP even with paid opt-in set', () => {
  const output = execFileSync(process.execPath, ['--import', new URL('./offline-network-guard.mjs', import.meta.url).href, '--input-type=module', '-e',
    "import assert from 'node:assert/strict'; import {connect} from 'node:net'; await assert.rejects(fetch('https://example.invalid'),/ONJU_OFFLINE_NETWORK_BLOCKED/); assert.throws(()=>connect(443,'example.invalid'),/ONJU_OFFLINE_NETWORK_BLOCKED/); console.log('blocked')"], { encoding: 'utf8' })
  assert.equal(output.trim(), 'blocked')
})
