import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openComparisonBudget } from './claude-comparison-budget.mjs'

function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(), 'onju-claude-budget-')), file = join(directory, 'budget.json')
  try { run(file) } finally { for (const suffix of ['', '.lock', '.tmp', '.rejection.json']) { try { unlinkSync(file + suffix) } catch {} }; rmdirSync(directory) }
}
const metadata = { provider: 'openai', model: 'test', requestHash: 'hash', runId: 'run' }

test('Claude-only continuation preserves total history, blocks OpenAI and survives restart',()=>fixture(file=>{
  let budget=openComparisonBudget(file)
  let id=budget.reserve(1_000_000,metadata);budget.settle(id,1_000_000,'old');budget.close()
  budget=openComparisonBudget(file,{claudeOnlyRemainder:true})
  assert.equal(budget.snapshot().measuredUsd,1)
  assert.throws(()=>budget.reserve(1,metadata),/openai_disabled/)
  id=budget.reserve(8_000_000,{...metadata,provider:'anthropic'});budget.settle(id,8_000_000,'claude');budget.close()
  budget=openComparisonBudget(file)
  assert.throws(()=>budget.reserve(1,metadata),/openai_disabled/)
  assert.throws(()=>budget.reserve(1_000_001,{...metadata,provider:'anthropic'}),/10_usd_limit/)
  assert.equal(budget.snapshot().measuredUsd,9);budget.close()
}))

test('both providers and repeated runs share the same durable ten-dollar limit', () => fixture(file => {
  let budget = openComparisonBudget(file)
  let reservation = budget.reserve(5_000_000, { ...metadata, provider: 'openai' })
  budget.settle(reservation, 5_000_000, 'resp-a'); budget.close()
  budget = openComparisonBudget(file)
  assert.throws(() => budget.reserve(1, metadata), /provider_5_usd_limit/)
  reservation = budget.reserve(5_000_000, { ...metadata, provider: 'anthropic' })
  budget.settle(reservation, 5_000_000, 'msg-b')
  assert.throws(() => budget.reserve(1, metadata), /10_usd_limit/)
  assert.equal(budget.snapshot().measuredUsd, 10)
  budget.close()
}))

test('lost response remains reserved after process restart and blocks any further paid attempt', () => fixture(file => {
  let budget = openComparisonBudget(file)
  budget.reserve(500_000, metadata)
  assert.equal(JSON.parse(readFileSync(file)).calls[0].status, 'reserved')
  assert.throws(() => budget.reserve(1, metadata), /unresolved_paid_call/)
  budget.close()
  assert.throws(() => openComparisonBudget(file), /unresolved_paid_call/)
}))

test('a second process cannot spend concurrently and duplicate settlement is rejected', () => fixture(file => {
  const budget = openComparisonBudget(file)
  assert.throws(() => openComparisonBudget(file), /EEXIST/)
  const reservation = budget.reserve(1000, metadata)
  budget.settle(reservation, 500, 'resp-a')
  assert.throws(() => budget.settle(reservation, 500, 'resp-a'), /invalid_comparison_settlement/)
  budget.close()
}))

test('corrupt budget and actual usage beyond reserve block further spending', () => fixture(file => {
  const budget = openComparisonBudget(file)
  const reservation = budget.reserve(1000, metadata)
  assert.throws(() => budget.settle(reservation, 1001, 'resp-a'), /reservation_exceeded/)
  assert.equal(budget.snapshot().uncertainCalls, 1)
  budget.close()
  writeFileSync(file, JSON.stringify({ version: 1, limitMicroUsd: 10_000_000, measuredMicroUsd: 0, calls: [{ status: 'settled', reservedMicroUsd: 1000, actualMicroUsd: 10 }] }))
  assert.throws(() => openComparisonBudget(file), /budget_corrupt/)
}))

test('recorded HTTP rejection can be reviewed without erasing or releasing its full budget reserve', () => fixture(file => {
  let budget = openComparisonBudget(file)
  budget.reserve(1_000_000, metadata)
  const evidence = file + '.rejection.json'
  writeFileSync(evidence, JSON.stringify({ status: 'blocked', stopCode: 'provider_http_400', runId: 'run', sourceUnchanged: true, harnessUnchanged: true, budget: budget.snapshot() }))
  budget.close()
  budget = openComparisonBudget(file, { rejectionEvidenceFile: evidence })
  assert.equal(budget.snapshot().measuredUsd, 0)
  assert.equal(budget.snapshot().retainedRejectedUpperBoundUsd, 1)
  assert.equal(budget.snapshot().committedUpperBoundUsd, 1)
  assert.throws(() => budget.reserve(4_000_001, metadata), /provider_5_usd_limit/)
  const id = budget.reserve(4_000_000, metadata)
  budget.settle(id, 4_000_000, 'resp-new')
  assert.equal(budget.snapshot().committedUpperBoundUsd, 5)
  budget.close()
}))

test('a timeout or mismatched run can never be reclassified as an HTTP rejection', () => fixture(file => {
  const budget = openComparisonBudget(file)
  budget.reserve(1000, metadata)
  const evidence = file + '.rejection.json'
  writeFileSync(evidence, JSON.stringify({ status: 'blocked', stopCode: 'llm_provider_transport_failed', runId: 'run', sourceUnchanged: true, harnessUnchanged: true, budget: budget.snapshot() }))
  budget.close()
  assert.throws(() => openComparisonBudget(file, { rejectionEvidenceFile: evidence }), /invalid_rejection_evidence/)
  assert.throws(() => openComparisonBudget(file), /unresolved_paid_call/)
}))
