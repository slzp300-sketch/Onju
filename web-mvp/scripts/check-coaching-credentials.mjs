import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const root = fileURLToPath(new URL('../../', import.meta.url))
const filename = resolve(root, '.env.local')
const env = { ...(existsSync(filename) ? parseEnv(readFileSync(filename, 'utf8')) : {}), ...process.env }
if (env.ONJU_OFFLINE === '1' || env.ONJU_ALLOW_PAID_EVALS === '0') throw Error('offline_mode_blocks_network')
const checks = [
  { provider: 'anthropic', url: 'https://api.anthropic.com/v1/models', model: env.ONJU_CLAUDE_MODEL || 'claude-sonnet-4-6', key: 'ANTHROPIC_API_KEY',
    headers: () => ({ 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' }) },
  { provider: 'openai', url: 'https://api.openai.com/v1/models', model: env.ONJU_BASELINE_MODEL || env.ONJU_AGENT_MODEL || 'gpt-5.6-sol', key: 'OPENAI_API_KEY',
    headers: () => ({ Authorization: `Bearer ${env.OPENAI_API_KEY}` }) },
]
const results = []
for (const check of checks) {
  if (!env[check.key]) { results.push({ provider: check.provider, status: 'missing_key' }); continue }
  try {
    const response = await fetch(check.url, { headers: check.headers(), signal: AbortSignal.timeout(20_000) })
    const data = await response.json().catch(() => null)
    results.push({ provider: check.provider, httpStatus: response.status, authenticated: response.ok, model: check.model,
      modelListed: response.ok && Array.isArray(data?.data) && data.data.some(item => item.id === check.model),
      ...(response.ok ? {} : { error: 'provider_rejected_credential_check' }) })
  } catch { results.push({ provider: check.provider, status: 'network_or_timeout', authenticated: false }) }
}
const report = { checkedAt: new Date().toISOString(), inferenceCalls: 0, generationCostUsd: 0, checks: results }
const output = resolve(root, 'logs/claude-coaching-comparison-2026-10-23')
mkdirSync(output, { recursive: true })
writeFileSync(resolve(output, 'credential-check.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify(report, null, 2))
if (results.some(item => !item.authenticated || !item.modelListed)) process.exitCode = 2
