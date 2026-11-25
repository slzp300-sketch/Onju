import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { createHash } from 'node:crypto'
import { toAnthropicMessagesRequest } from '../../supabase/functions/_shared/anthropicMessagesAdapter.ts'
import { claudeCoachingCases } from './claude-coaching-cases.mjs'
import { openComparisonBudget } from './claude-comparison-budget.mjs'
import { estimateAiReservationMicroUsd, estimateObservedCost } from '../../supabase/functions/_shared/webMvpCostControl.ts'

if (process.env.ONJU_OFFLINE === '1') throw Error('offline_mode_blocks_network')
const root = fileURLToPath(new URL('../../', import.meta.url))
const env = { ...parseEnv(readFileSync(resolve(root, '.env.local'), 'utf8')), ...process.env }
if (!env.ANTHROPIC_API_KEY) throw Error('missing_anthropic_api_key')
const { loadState, runAgentTurn } = await import(pathToFileURL(resolve(root, 'logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts')))
const { coachingSourceHash } = await import(pathToFileURL(resolve(root, 'logs/sites/onju-web-mvp/web-mvp/scripts/reference-coaching-evaluation.mjs')))
const siteRoot = resolve(root, 'logs/sites/onju-web-mvp'), sourceSha256 = coachingSourceHash(siteRoot)
let captured
try {
  await runAgentTurn(loadState(null), claudeCoachingCases[0].turns[0], {
    now: '2026-10-23T09:00:00+09:00', today: '2026-10-23', model: env.ONJU_CLAUDE_MODEL || 'claude-sonnet-4-6',
    fastModel: env.ONJU_CLAUDE_MODEL || 'claude-sonnet-4-6', maxModelTurns: 1,
    regionalContext: { locale: 'ko-KR', countryCode: 'KR', timeZone: 'Asia/Seoul', currencyCode: 'KRW', weekStartsOn: 1 },
    request: async body => { captured = body; throw Error('diagnostic_no_generation') },
  })
} catch { /* Capture the genuine first request without dispatching a generation. */ }
if (!captured) throw Error('diagnostic_request_not_captured')
const native = toAnthropicMessagesRequest(captured)
const probe = process.argv.includes('--generate-schema-probe')
if (probe) native.max_tokens = 1
else { delete native.max_tokens; delete native.output_config }
const output = resolve(root, 'logs/claude-coaching-comparison-2026-10-23')
mkdirSync(output, { recursive: true })
const budget = probe ? openComparisonBudget(resolve(output, 'budget.json')) : null
const runId = crypto.randomUUID(), sourceHash = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex')
const reservation = budget?.reserve(estimateAiReservationMicroUsd({ ...captured, max_output_tokens: 1, reservation_padding: 'x'.repeat(32768) }),
  { provider: 'anthropic', model: captured.model, runId, requestHash: createHash('sha256').update(JSON.stringify(native)).digest('hex') })
try {
const response = await fetch(probe ? 'https://api.anthropic.com/v1/messages' : 'https://api.anthropic.com/v1/messages/count_tokens', {
  method: 'POST', headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
  body: JSON.stringify(native), signal: AbortSignal.timeout(30_000),
})
const result = await response.json()
if (probe && response.ok && result.usage) {
  const usage = result.usage
  const observed = estimateObservedCost({ model: result.model, usage: { input_tokens: usage.input_tokens + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0),
    output_tokens: usage.output_tokens, input_tokens_details: { cached_tokens: usage.cache_read_input_tokens || 0, cache_write_tokens: usage.cache_creation_input_tokens || 0 } } }, { model: captured.model })
  if (observed === null) throw Error('schema_probe_usage_unknown')
  budget.settle(reservation, observed, result.id)
}
const message = typeof result?.error?.message === 'string'
  ? result.error.message.replaceAll(env.ANTHROPIC_API_KEY, '[redacted]').replace(/sk-[A-Za-z0-9_-]+/g, '[redacted]').slice(0, 1200) : undefined
const report = { checkedAt: new Date().toISOString(), runId, generationCalls: probe ? 1 : 0, httpStatus: response.status, requestHash: createHash('sha256').update(JSON.stringify(native)).digest('hex'),
  status: response.ok ? 'validated' : 'blocked', stopCode: response.ok ? undefined : `provider_http_${response.status}`,
  sourceSha256, sourceUnchanged: sourceSha256 === coachingSourceHash(siteRoot), harnessUnchanged: sourceHash === createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  budget: budget?.snapshot(), inputTokens: result?.input_tokens, errorType: result?.error?.type, message }
const file = probe ? `schema-probe-${runId}.json` : 'request-diagnostic.json'
writeFileSync(resolve(output, file), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify(report, null, 2))
if (!response.ok) process.exitCode = 2
} finally { budget?.close() }
