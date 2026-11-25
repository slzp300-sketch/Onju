import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, randomUUID } from 'node:crypto'
import { parseEnv } from 'node:util'
import { openComparisonBudget } from './claude-comparison-budget.mjs'
import { claudeCoachingCases, comparisonRubric } from './claude-coaching-cases.mjs'
import { estimateAiReservationMicroUsd, estimateObservedCost } from '../../supabase/functions/_shared/webMvpCostControl.ts'
import { createAnthropicMessagesAdapter } from '../../supabase/functions/_shared/anthropicMessagesAdapter.ts'
import { createOpenAiResponsesAdapter } from '../../supabase/functions/_shared/openAiResponsesAdapter.ts'

const root = fileURLToPath(new URL('../../', import.meta.url))
const site = resolve(root, 'logs/sites/onju-web-mvp')
const campaign = resolve(root, 'logs/claude-coaching-comparison-2026-10-23')
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const args = process.argv.slice(2)
if (args.some(arg => !['--live', '--dry-run', '--provider=anthropic', '--provider=openai', '--claude-improvement'].includes(arg)) || args.includes('--live') && args.includes('--dry-run')
  || args.filter(arg => arg.startsWith('--provider=')).length > 1) throw Error('invalid_comparison_arguments')
const claudeImprovement=args.includes('--claude-improvement')
if(claudeImprovement&&args.includes('--provider=openai'))throw Error('claude_improvement_blocks_openai')
const selectedProvider = claudeImprovement?'anthropic':args.find(arg => arg.startsWith('--provider='))?.split('=')[1]
for (const filename of [resolve(root, '.env.local')]) {
  if (!existsSync(filename)) continue
  // Read only this project's environment; never print values or copy it to artifacts.
  for (const [name, value] of Object.entries(parseEnv(readFileSync(filename, 'utf8')))) if (!process.env[name]) process.env[name] = value
}
const models = [
  { provider: 'openai', model: process.env.ONJU_BASELINE_MODEL || process.env.ONJU_AGENT_MODEL || 'gpt-5.6-sol',
    fastModel: process.env.ONJU_AGENT_FAST_MODEL || 'gpt-5.6-terra', key: 'OPENAI_API_KEY' },
  { provider: 'anthropic', model: process.env.ONJU_CLAUDE_MODEL || 'claude-sonnet-4-6', key: 'ANTHROPIC_API_KEY' },
]
const selectedModels = selectedProvider ? models.filter(item => item.provider === selectedProvider) : models
for (const item of models) for (const model of new Set([item.model, item.fastModel ?? item.model])) estimateAiReservationMicroUsd({ model, input: 'preflight', max_output_tokens: 6500 })
const prepared = { limitUsd: 10, scope: 'both_providers_all_runs_in_this_campaign', models: models.map(({ provider, model, fastModel }) => ({ provider, model, fastModel: fastModel ?? model })),
  selectedProviders: selectedModels.map(item => item.provider), providerLimitsUsd: { openai: 5, anthropic: claudeImprovement?10:5 },
  purpose:claudeImprovement?'claude_only_improvement':'provider_comparison',
  scenarios: claudeCoachingCases.map(item => ({ id: item.id, turns: item.turns.length })),
  totalUserTurns: claudeCoachingCases.reduce((sum, item) => sum + item.turns.length, 0) * selectedModels.length,
  credentials: Object.fromEntries(models.map(item => [item.key, Boolean(process.env[item.key])])),
  databaseWrites: false, automaticRetries: false, productionModelChanged: false, fixtureHash: hash(claudeCoachingCases),
  providerTerms: 'Synthetic inputs only; real provider responses retained privately in ignored logs.',
  schemaCompatibility: 'Same Onju validators; Anthropic uses native strict only for small grammars, with full original schemas and Onju validation for large tools.',
}
if (!args.includes('--live')) {
  console.log(JSON.stringify({ ...prepared, status: 'prepared_not_executed', paidCalls: 0 }, null, 2))
  process.exit(0)
}
if (process.env.ONJU_OFFLINE === '1' || process.env.ONJU_ALLOW_PAID_EVALS === '0') throw Error('offline_mode_blocks_paid_evaluation')
const missing = selectedModels.filter(item => !process.env[item.key]).map(item => item.key)
if (missing.length) { console.log(JSON.stringify({ status: 'blocked_missing_credentials', missing, paidCalls: 0 })); process.exit(2) }

// Both arms run the same complete Onju agent, schemas and validators; no production sessions.
const { loadState, runAgentTurn } = await import(pathToFileURL(resolve(site, 'supabase/functions/onju-agent-v2/agent.ts')))
const { coachingSourceHash } = await import(pathToFileURL(resolve(site, 'web-mvp/scripts/reference-coaching-evaluation.mjs')))
const sourceSha256 = coachingSourceHash(site)
const harnessHash = () => hash(['web-mvp/scripts/compare-claude-coaching.mjs', 'web-mvp/scripts/claude-comparison-budget.mjs', 'web-mvp/scripts/claude-coaching-cases.mjs',
  'supabase/functions/_shared/anthropicMessagesAdapter.ts', 'supabase/functions/_shared/anthropicPricing.ts', 'supabase/functions/_shared/webMvpCostControl.ts']
  .map(name => [name, readFileSync(resolve(root, name), 'utf8').replaceAll('\r\n', '\n')]))
const runId = randomUUID(), output = resolve(campaign, runId)
const budget = openComparisonBudget(resolve(campaign, 'budget.json'),{claudeOnlyRemainder:claudeImprovement})
mkdirSync(output, { recursive: true })
const report = { ...prepared, runId, startedAt: new Date().toISOString(), sourceSha256, harnessSha256: harnessHash(),
  executionMode: 'live_local_onju_agent_no_database', status: 'running', cases: [], calls: [],
  contentReview: { status: 'pending', rubric: comparisonRubric }, liveQualityValidated: false }
const saveReport = () => {
  report.budget = budget.snapshot()
  writeFileSync(resolve(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
}
let blocked = false
try {
  saveReport()
  for (const [scenarioIndex, scenario] of claudeCoachingCases.entries()) {
    // Alternate provider order deterministically to avoid always giving one arm the first slot.
    const ordered = scenarioIndex % 2 ? [...selectedModels].reverse() : selectedModels
    for (const arm of ordered) {
      let state = loadState(null)
      const resultCase = { caseId: scenario.id, name: scenario.name, provider: arm.provider, model: arm.model, transcript: [], status: 'running' }
      report.cases.push(resultCase)
      const adapter = (arm.provider === 'anthropic' ? createAnthropicMessagesAdapter : createOpenAiResponsesAdapter)({
        apiKey: process.env[arm.key], timeoutMs: 90_000,
        fetcher: async (url, init) => {
          const response = await fetch(url, init)
          if (response.ok) {
            const raw = await response.clone().json()
            writeFileSync(resolve(output, `provider-response-${report.calls.length + 1}.json`), JSON.stringify(raw, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
          } else {
            const failure = await response.clone().json().catch(() => null)
            let message = typeof failure?.error?.message === 'string' ? failure.error.message : ''
            for (const item of models) if (process.env[item.key]) message = message.replaceAll(process.env[item.key], '[redacted]')
            message = message.replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 1200)
            writeFileSync(resolve(output, `provider-error-${report.calls.length + 1}.json`), JSON.stringify({
              httpStatus: response.status, errorType: failure?.error?.type ?? failure?.error?.code, message,
            }, null, 2) + '\n', { mode: 0o600, flag: 'wx' })
          }
          return response
        },
      })
      const request = async original => {
        if (blocked) throw Error('comparison_stopped')
        const model = original.model || arm.model
        if (![arm.model, arm.fastModel ?? arm.model].includes(model)) throw Error('comparison_unapproved_model')
        const body = { ...original, model, max_output_tokens: Math.min(Number(original.max_output_tokens || 6500), 6500) }
        resultCase.validationFeedback??=[]
        if(Array.isArray(body.input))for(const item of body.input.filter(item=>item.type==='function_call_output')) {
          try{const data=JSON.parse(item.output);if(data.error&&!resultCase.validationFeedback.some(entry=>entry.callId===item.call_id))resultCase.validationFeedback.push({callId:item.call_id,error:data.error})}catch{/* malformed output is rejected by adapter */}
        }
        // Include native tool wrappers and hidden tool preambles in the conservative reserve.
        const upperBound = estimateAiReservationMicroUsd({ ...body, reservation_padding: 'x'.repeat(32768) })
        const reservation = budget.reserve(upperBound, { ...arm, model, runId, requestHash: hash(body) })
        const started = performance.now()
        try {
          const response = await adapter.generate(body)
          if (!response.ok || !response.data) throw Error(`provider_http_${response.status}`)
          const actual = estimateObservedCost(response.data, body)
          if (actual === null) throw Error('comparison_usage_unpriced')
          budget.settle(reservation, actual, response.data.id)
          report.calls.push({ provider: arm.provider, model: response.data.model, responseId: response.data.id,
            requestId: response.requestId, latencyMs: Math.round(performance.now() - started), usage: response.data.usage,
            estimatedCostUsd: actual / 1e6, status: response.data.status ?? 'completed' })
          report.calls.at(-1).providerMetadata = response.data.provider_metadata ?? null
          saveReport()
          if (response.data.status && response.data.status !== 'completed') throw Error('comparison_incomplete_response')
          return response.data
        } catch (error) {
          blocked = true // No automatic retry, provider fallback, or silently free lost response.
          report.stopCode = error?.message && /^[a-zA-Z0-9_:-]{1,100}$/.test(error.message) ? error.message : 'comparison_provider_failure'
          saveReport()
          throw Error(report.stopCode)
        }
      }
      try { for (const [turnIndex, message] of scenario.turns.entries()) {
        const started = performance.now(), firstCall = report.calls.length
        const result = await runAgentTurn(state, message, { request, now: '2026-10-23T09:00:00+09:00', today: '2026-10-23',
          regionalContext: { locale: 'ko-KR', countryCode: 'KR', timeZone: 'Asia/Seoul', currencyCode: 'KRW', weekStartsOn: 1 },
          model: arm.model, fastModel: arm.fastModel ?? arm.model, maxModelTurns: 6,
          lookupTerm: async query => {
            // Identical knowledge-only lookup on both arms; no paid search tools or invented citations.
            const data = await request({ model: arm.model, instructions: '공개 용어의 일반적 뜻만 설명하고 출처를 검색했다고 주장하지 않는다.',
              input: query, max_output_tokens: 500 })
            return { summary: data.output.filter(item => item.type === 'message').flatMap(item => item.content ?? []).map(item => item.text ?? '').join('\n'), sources: [] }
          },
        }, undefined, { userMessageId: randomUUID() })
        state = result.state
        resultCase.transcript.push({ turn: turnIndex + 1, user: message, assistant: result.assistant_message,
          latencyMs: Math.round(performance.now() - started), calls: report.calls.length - firstCall, state,
          toolEvents: result.events.filter(event => event.tool !== 'model_usage') })
        saveReport()
        console.log(JSON.stringify({ case: scenario.id, provider: arm.provider, turn: turnIndex + 1, budget: budget.snapshot() }))
      }
        resultCase.status = 'delivered_pending_content_review'
      } catch (error) {
        // A known, fully metered semantic failure is evidence, not a reason to
        // regenerate until it passes. Stop this case; retain it and try the other
        // independent fixtures. Transport/budget uncertainty still stops ALL work.
        if (blocked || error?.message !== 'no_valid_agent_reply') throw error
        resultCase.status = 'failed_delivery'
        resultCase.error = 'no_valid_agent_reply'
        resultCase.failedTurn = resultCase.transcript.length + 1
        console.log(JSON.stringify({ case: scenario.id, provider: arm.provider, status: resultCase.status, failedTurn: resultCase.failedTurn }))
      }
      saveReport()
    }
  }
  report.status = claudeImprovement||selectedModels.length === models.length ? 'delivered_pending_content_review' : 'partial_pending_other_provider'
  if (report.cases.some(item => item.status === 'failed_delivery')) {
    report.status = claudeImprovement||selectedModels.length === models.length ? 'completed_with_delivery_failures' : 'partial_with_delivery_failures'
  }
} catch (error) {
  report.status = 'blocked'
  report.stopCode ??= error?.message && /^[a-zA-Z0-9_:-]{1,100}$/.test(error.message) ? error.message : 'comparison_failed'
  process.exitCode = 2
} finally {
  report.finishedAt = new Date().toISOString()
  report.sourceUnchanged = sourceSha256 === coachingSourceHash(site)
  report.harnessUnchanged = report.harnessSha256 === harnessHash()
  saveReport()
  budget.close()
  console.log(JSON.stringify({ status: report.status, stopCode: report.stopCode, budget: report.budget, reportPath: resolve(output, 'report.json') }))
}
