import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'

export const COMPARISON_LIMIT_MICRO_USD = 10_000_000

/** One durable campaign budget covers BOTH providers, all runs, and lost replies. */
export function openComparisonBudget(file, { rejectionEvidenceFile, claudeOnlyRemainder = false } = {}) {
  mkdirSync(dirname(file), { recursive: true })
  const lock = `${file}.lock`
  const descriptor = openSync(lock, 'wx', 0o600)
  const save = value => {
    const temporary = `${file}.tmp`
    writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
    renameSync(temporary, file)
  }
  let state
  let closed = false
  const release = () => {
    if (closed) return
    closed = true
    closeSync(descriptor)
    unlinkSync(lock)
  }
  const snapshot = () => {
    const pending = state.calls.filter(call => call.status === 'reserved')
    const retained = state.calls.filter(call => call.status === 'retained_rejection')
    return { limitUsd: 10, measuredUsd: state.measuredMicroUsd / 1e6,
      uncertainUpperBoundUsd: pending.reduce((sum, call) => sum + call.reservedMicroUsd, 0) / 1e6,
      retainedRejectedUpperBoundUsd: retained.reduce((sum, call) => sum + call.reservedMicroUsd, 0) / 1e6,
      retainedRejectedCalls: retained.length,
      committedUpperBoundUsd: (state.measuredMicroUsd + [...pending, ...retained].reduce((sum, call) => sum + call.reservedMicroUsd, 0)) / 1e6,
      uncertainCalls: pending.length, paidAttempts: state.calls.length,
      providers: Object.fromEntries(['openai', 'anthropic'].map(provider => [provider, {
        limitUsd: provider==='anthropic'&&state.claudeOnlyRemainder?10:5, disabled:provider==='openai'&&Boolean(state.claudeOnlyRemainder), measuredUsd: state.calls.filter(call => call.provider === provider && call.status === 'settled').reduce((sum, call) => sum + call.actualMicroUsd, 0) / 1e6,
      }])) }
  }
  try {
    state = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {
      version: 1, campaign: 'onju-claude-comparison-2026-10-23', limitMicroUsd: COMPARISON_LIMIT_MICRO_USD, measuredMicroUsd: 0, calls: [],
    }
    if (state.version !== 1 || state.limitMicroUsd !== COMPARISON_LIMIT_MICRO_USD || !Number.isSafeInteger(state.measuredMicroUsd)
      || state.measuredMicroUsd < 0 || state.measuredMicroUsd > COMPARISON_LIMIT_MICRO_USD || !Array.isArray(state.calls)
      || state.calls.some(call => !['reserved', 'settled', 'retained_rejection'].includes(call.status) || !Number.isSafeInteger(call.reservedMicroUsd) || call.reservedMicroUsd <= 0
        || call.status === 'retained_rejection' && !/^[a-f0-9]{64}$/.test(call.rejectionEvidenceSha256 ?? '')
        || call.status === 'settled' && (!Number.isSafeInteger(call.actualMicroUsd) || call.actualMicroUsd < 0))
      || state.calls.filter(call => call.status === 'settled').reduce((sum, call) => sum + call.actualMicroUsd, 0) !== state.measuredMicroUsd) throw Error('comparison_budget_corrupt')
    if (rejectionEvidenceFile) {
      // A recorded HTTP rejection is different from a lost reply. Keep its FULL
      // reservation charged to the cap; never infer zero billing or erase history.
      const bytes = readFileSync(rejectionEvidenceFile)
      const report = JSON.parse(bytes.toString())
      const pending = state.calls.filter(call => call.status === 'reserved')
      if (pending.length !== 1 || report.status !== 'blocked' || report.stopCode !== 'provider_http_400'
        || !report.sourceUnchanged || !report.harnessUnchanged || pending[0].runId !== report.runId
        || report.budget?.paidAttempts !== state.calls.length || report.budget?.measuredUsd !== state.measuredMicroUsd / 1e6) throw Error('invalid_rejection_evidence')
      pending[0].status = 'retained_rejection'
      pending[0].httpStatus = 400
      pending[0].rejectionEvidenceSha256 = createHash('sha256').update(bytes).digest('hex')
      save(state)
    }
    if (snapshot().uncertainCalls) throw Error('comparison_has_unresolved_paid_call')
    if(claudeOnlyRemainder&&!state.claudeOnlyRemainder){state.claudeOnlyRemainder=true;state.allocationChange={at:new Date().toISOString(),reason:'User requested Claude-only improvements within the original total $10; all prior spend/reservations retained.'}}
    save(state)
  } catch (error) { release(); throw error }
  return {
    snapshot,
    reserve(upperBoundMicroUsd, metadata) {
      if (closed) throw Error('comparison_budget_closed')
      if (snapshot().uncertainCalls) throw Error('comparison_has_unresolved_paid_call')
      if (!Number.isSafeInteger(upperBoundMicroUsd) || upperBoundMicroUsd <= 0) throw Error('invalid_comparison_reservation')
      const retained = state.calls.filter(call => call.status === 'retained_rejection').reduce((sum, call) => sum + call.reservedMicroUsd, 0)
      if (state.measuredMicroUsd + retained + upperBoundMicroUsd > COMPARISON_LIMIT_MICRO_USD) throw Error('comparison_10_usd_limit')
      if (!['openai', 'anthropic'].includes(metadata.provider)) throw Error('invalid_comparison_provider')
      if(state.claudeOnlyRemainder&&metadata.provider==='openai')throw Error('comparison_openai_disabled')
      const providerSpent = state.calls.filter(call => call.provider === metadata.provider).reduce((sum, call) => sum + (call.status === 'settled' ? call.actualMicroUsd : call.reservedMicroUsd), 0)
      if (providerSpent + upperBoundMicroUsd > (metadata.provider==='anthropic'&&state.claudeOnlyRemainder?10_000_000:5_000_000)) throw Error('comparison_provider_5_usd_limit')
      const id = randomUUID()
      state.calls.push({ id, status: 'reserved', reservedMicroUsd: upperBoundMicroUsd,
        provider: metadata.provider, model: metadata.model, requestHash: metadata.requestHash, runId: metadata.runId, startedAt: new Date().toISOString() })
      save(state) // Persist BEFORE network dispatch; a crash does not erase a charge.
      return id
    },
    settle(id, actualMicroUsd, responseId) {
      if (closed) throw Error('comparison_budget_closed')
      const call = state.calls.find(item => item.id === id)
      if (!call || call.status !== 'reserved' || !Number.isSafeInteger(actualMicroUsd) || actualMicroUsd < 0) throw Error('invalid_comparison_settlement')
      if (actualMicroUsd > call.reservedMicroUsd) throw Error('comparison_reservation_exceeded')
      call.status = 'settled'; call.actualMicroUsd = actualMicroUsd; call.responseId = responseId
      state.measuredMicroUsd += actualMicroUsd
      save(state)
    },
    close: release,
  }
}
