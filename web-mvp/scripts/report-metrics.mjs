import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { buildMetricsReport, renderMarkdownReport, reportWindow } from './metrics-report-lib.mjs'
import { demoMetrics, fetchMetrics } from './metrics-report-source.mjs'

async function main() {
  const { values } = parseArgs({ options: {
    days: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' },
    country: { type: 'string' }, locale: { type: 'string' },
    out: { type: 'string' }, json: { type: 'boolean' },
    input: { type: 'string' }, demo: { type: 'boolean' }, live: { type: 'boolean' }, help: { type: 'boolean' },
  } })
  if (values.help || (!values.input && !values.demo && !values.live)) {
    console.log('report:metrics --demo | --input=<raw-events.json> | --live\n  [--days=30 | --from=UTC --to=UTC] [--country=KR --locale=ko-KR] [--json] [--out=file]\n기본 실행은 안내만 표시합니다. --demo/--input은 네트워크와 키 없이 동작합니다.')
    return
  }
  if ([values.input, values.demo, values.live].filter(Boolean).length !== 1) throw new Error('select_one_source')
  const window = reportWindow(values, values.demo ? new Date('2026-09-16T00:00:00Z') : new Date())
  const filters = Object.fromEntries(['country', 'locale'].filter(k => values[k]).map(k => [k, values[k]]))
  buildMetricsReport({ usageEvents: [], productEvents: [] }, window, filters)
  const data = values.demo ? demoMetrics()
    : values.input ? JSON.parse(await readFile(resolve(values.input), 'utf8'))
      : await fetchMetrics({ ...window, ...filters, url: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY })
  const report = buildMetricsReport(data, window, filters)
  const output = values.json ? JSON.stringify(report, null, 2) + '\n' : renderMarkdownReport(report)
  if (values.out) {
    const outputPath = resolve(values.out)
    await mkdir(dirname(outputPath), { recursive: true })
    await writeFile(outputPath, output, { encoding: 'utf8', flag: 'wx' })
    console.log('Saved metrics report to ' + outputPath)
  } else console.log(output)
}

main().catch(error => { console.error(error.message); process.exitCode = 1 })
