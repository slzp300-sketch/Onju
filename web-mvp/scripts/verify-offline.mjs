import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { EVAL_SUITES, prepareEvalPlan } from './eval-plan.mjs'
import { coachingSourceHash } from '../../logs/sites/onju-web-mvp/web-mvp/scripts/reference-coaching-evaluation.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const web = resolve(root, 'web-mvp')
const startedAt = new Date().toISOString()
const folder = resolve(root, 'logs/offline-development', startedAt.replace(/[:.]/g, '-'))
const guard = new URL('./offline-network-guard.mjs', import.meta.url).href
// Resolve installed packages through Node so workspace-hoisted dependencies work.
const webRequire = createRequire(resolve(web, 'package.json'))
const webBin = (pkg, entry) => resolve(dirname(webRequire.resolve(pkg + '/package.json')), entry)
const env = { ...process.env, ONJU_OFFLINE: '1', ONJU_ALLOW_PAID_EVALS: '0', NODE_OPTIONS: '--import=' + guard, NO_COLOR: '1' }
for (const key of Object.keys(env)) {
  if (/^(?:VITE_)?(?:OPENAI_|GEMINI_|ANTHROPIC_|SUPABASE_)/i.test(key)) delete env[key]
}

async function fingerprint() {
  const hash = createHash('sha256')
  let files = 0
  async function walk(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['node_modules', 'dist', '.git'].includes(entry.name) || entry.name.endsWith('.local')) continue
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) await walk(path)
      else if (/\.(ts|tsx|mjs|json|css|sql)$/.test(entry.name)) {
        hash.update(path.slice(root.length).replaceAll('\\', '/'))
        hash.update('\0' + (await readFile(path, 'utf8')).replaceAll('\r\n', '\n'))
        files++
      }
    }
  }
  for (const path of ['src', 'web-mvp', 'supabase/functions', 'supabase/migrations', 'docs/agent/global-beta',
    'logs/sites/onju-web-mvp/web-mvp/src', 'logs/sites/onju-web-mvp/web-mvp/scripts', 'logs/sites/onju-web-mvp/web-mvp/evals', 'logs/sites/onju-web-mvp/scripts',
    'logs/sites/onju-web-mvp/supabase/functions', 'logs/sites/onju-web-mvp/supabase/migrations']) await walk(resolve(root, path))
  for (const path of ['package.json', 'package-lock.json', 'eslint.config.js', 'knip.config.ts', 'logs/sites/onju-web-mvp/web-mvp/package.json', 'logs/sites/onju-web-mvp/web-mvp/package-lock.json', 'logs/sites/onju-web-mvp/web-mvp/vite.config.ts', 'logs/sites/onju-web-mvp/supabase/config.toml', 'logs/sites/onju-web-mvp/.openai/hosting.json']) {
    hash.update(path + '\0' + (await readFile(resolve(root, path), 'utf8')).replaceAll('\r\n', '\n'))
    files++
  }
  return { sha256: hash.digest('hex'), files }
}

await mkdir(folder, { recursive: true })
const before = await fingerprint()
const coachingSourceSha256=coachingSourceHash(resolve(root,'logs/sites/onju-web-mvp'))
const plans = []
for (const [suite, file] of Object.entries(EVAL_SUITES)) {
  const cases = JSON.parse(await readFile(resolve(web, 'evals', file), 'utf8'))
  plans.push(prepareEvalPlan(cases, { all: true, suite }).manifest)
}
plans.push(prepareEvalPlan(JSON.parse(await readFile(resolve(root, 'logs/sites/onju-web-mvp/web-mvp/evals/onju-reference-coaching.json'), 'utf8')), { all: true, suite: 'reference-coaching' }).manifest)
await writeFile(resolve(folder, 'evaluation-plan.json'), JSON.stringify(plans, null, 2))
const agentTests = (await readdir(resolve(web, 'scripts'))).filter(file => file.endsWith('.test.mjs')).sort().map(file => 'scripts/' + file)
const siteWeb = resolve(root, 'logs/sites/onju-web-mvp/web-mvp')
const sitePackage = JSON.parse(await readFile(resolve(siteWeb, 'package.json'), 'utf8'))
// Execute only the explicit offline test list, never candidate/live evaluation scripts.
const siteTests = sitePackage.scripts['test:agent'].split(' ').slice(2)
if (!siteTests.every(file => /^scripts\/[a-z0-9-]+\.test\.mjs$/.test(file))) throw new Error('Unexpected site test command')
const steps = [
  ['agent-tests', web, ['--test', ...agentTests]],
  ['site-agent-tests', siteWeb, ['--test', ...siteTests]],
  ['persona-state-diagnostics', root, ['web-mvp/qa/persona-pilot/run.mjs']],
  ['expanded-persona-diagnostics', root, ['web-mvp/qa/persona-pilot/run-expanded.mjs']],
  ['round3-persona-diagnostics', root, ['web-mvp/qa/persona-pilot/run-round3.mjs']],
  ['round4-persona-diagnostics', root, ['web-mvp/qa/persona-pilot/run-round4.mjs']],
  ['round5-persona-diagnostics', root, ['web-mvp/qa/persona-pilot/run-round5.mjs']],
  ['round6-persona-diagnostics', root, ['web-mvp/qa/persona-pilot/run-round6.mjs']],
  ['round7-persona-diagnostics', root, ['web-mvp/qa/persona-pilot/run-round7.mjs']],
  ['round8-persona-diagnostics', root, ['web-mvp/qa/persona-pilot/run-round8.mjs']],
  ['round9-persona-diagnostics', root, ['web-mvp/qa/persona-pilot/run-round9.mjs']],
  ['round10-persona-diagnostics', root, ['web-mvp/qa/persona-pilot/run-round10.mjs']],
  ['round11-persona-diagnostics', root, ['web-mvp/qa/persona-pilot/run-round11.mjs']],
  ['site-agent-types', root, [webBin('typescript', 'bin/tsc'), '--ignoreConfig', '--noEmit', '--allowImportingTsExtensions', '--skipLibCheck', '--strict', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'bundler', 'logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts']],
  ['site-web-types', siteWeb, [webBin('typescript', 'bin/tsc'), '-b']],
  ['site-web-build', siteWeb, [webBin('vite', 'bin/vite.js'), 'build']],
  ['app-tests', root, ['node_modules/vitest/vitest.mjs', 'run', '--maxWorkers=2']],
  ['session-ui-tests', root, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'web-mvp/qa/session-ui/vitest.config.ts', '--maxWorkers=1']],
  ['journey-ui-tests', root, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'web-mvp/qa/journey-ui/vitest.config.ts', '--maxWorkers=1']],
  ['web-types', web, [webBin('typescript', 'bin/tsc'), '-b']],
  ['metrics-types', root, [webBin('typescript', 'bin/tsc'), '--ignoreConfig', '--noEmit', '--allowImportingTsExtensions', '--skipLibCheck', '--strict', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'bundler', 'supabase/functions/_shared/onjuMetrics.ts']],
  ['cost-control-types', root, [webBin('typescript', 'bin/tsc'), '--ignoreConfig', '--noEmit', '--allowImportingTsExtensions', '--skipLibCheck', '--strict', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'bundler', 'web-mvp/qa/edge-runtime.d.ts', 'supabase/functions/_shared/webMvpCostControl.ts', 'logs/sites/onju-web-mvp/supabase/functions/_shared/webMvpCostControl.ts']],
  ['web-build', web, [webBin('vite', 'bin/vite.js'), 'build']],
  ['release-inventory', root, ['web-mvp/scripts/release-inventory.mjs', folder]],
  ['data-control-types', root, [webBin('typescript', 'bin/tsc'), '--ignoreConfig', '--noEmit', '--allowImportingTsExtensions', '--skipLibCheck', '--strict', '--target', 'ES2023', '--module', 'ESNext', '--moduleResolution', 'bundler', 'web-mvp/qa/edge-runtime.d.ts', 'supabase/functions/_shared/webMvpDataControls.ts', 'logs/sites/onju-web-mvp/supabase/functions/_shared/webMvpDataControls.ts']],
  ['eslint', root, ['node_modules/eslint/bin/eslint.js', '.']],
  ['knip', root, ['node_modules/knip/bin/knip.js']],
  ['metrics-demo', web, ['scripts/report-metrics.mjs', '--demo', '--out=' + resolve(folder, 'metrics-demo.md')]],
  ['eval-preview', web, ['scripts/run-agent-evals.mjs', '--english', '--all']],
  ['reference-coaching-evidence', root, ['web-mvp/scripts/report-reference-coaching.mjs']],
]
const results = []
for (const [name, cwd, args] of steps) {
  console.log('Running ' + name + ' (offline)')
  const start = Date.now()
  const result = await new Promise(resolveResult => {
    const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', data => { output += data })
    child.stderr.on('data', data => { output += data })
    child.on('error', error => { output += error.message })
    child.on('close', (code, signal) => resolveResult({ name, code, signal, elapsedMs: Date.now() - start, output }))
  })
  await writeFile(resolve(folder, name + '.log'), result.output)
  results.push({ name, code: result.code, signal: result.signal, elapsedMs: result.elapsedMs })
  console.log(name + ': ' + (result.code === 0 ? 'PASS' : 'FAIL') + ' (' + (result.elapsedMs / 1000).toFixed(1) + 's)')
  if (result.code !== 0) console.error(result.output.slice(-5000))
}
const after = await fingerprint()
const report = {
  startedAt, finishedAt: new Date().toISOString(), source: before, coachingSourceSha256,
  sourceUnchangedDuringChecks: before.sha256 === after.sha256,
  passed: results.every(result => result.code === 0) && before.sha256 === after.sha256,
  paidProviderCalls: 0, incrementalModelApiCostUsd: 0, liveQualityValidated: false,
  preparedCases: plans.reduce((n, plan) => n + plan.caseCount, 0), preparedUserTurns: plans.reduce((n, plan) => n + plan.userTurns, 0),
  checks: results,
}
await writeFile(resolve(folder, 'summary.json'), JSON.stringify(report, null, 2))
await writeFile(resolve(folder, 'summary.md'), [
  '# 온주 무료 개발 검증 기록', '',
  '- 시작: ' + startedAt,
  '- 결과: ' + (report.passed ? '통과' : '수정 필요'),
  '- 소스 SHA-256: ' + before.sha256,
  '- 검사 중 소스 변경: ' + (report.sourceUnchangedDuringChecks ? '없음' : '있음 — 결과 재확인 필요'),
  '- 이번 검증의 외부 모델 API 호출: 0회 / 추가 API 비용: $0',
  '- 실제 모델의 대화 품질·속도 검증: 사용자 요청에 따라 보류', '',
  ...results.map(result => '- ' + result.name + ': ' + (result.code === 0 ? 'PASS' : 'FAIL')), '',
  '실행 계획만 준비한 유료 평가: ' + report.preparedCases + '개 시나리오 / ' + report.preparedUserTurns + '개 사용자 턴. 이 숫자는 유료 평가 통과 건수가 아닙니다.', '',
].join('\n'))
console.log('Report: ' + resolve(folder, 'summary.md'))
if (!report.passed) process.exitCode = 1
