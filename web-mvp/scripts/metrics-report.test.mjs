import assert from 'node:assert/strict'
import test from 'node:test'
import { buildMetricsReport, reportWindow, renderMarkdownReport, summarizeUsage, summarizeFunnel } from './metrics-report-lib.mjs'
import { demoMetrics, fetchMetrics } from './metrics-report-source.mjs'

const window = reportWindow({ from: '2026-09-15T01:00:00Z', to: '2026-09-16T01:00:00Z' })
const event = (session_id, event_name, hour) => ({ session_id, event_name, occurred_at: '2026-09-15T' + hour + ':00:00Z' })

test('cost and funnel use identical exact boundaries; day one is not lost and end is exclusive', () => {
  const data = demoMetrics()
  data.usageEvents.push({ ...data.usageEvents[0], id: 'early', occurred_at: '2026-09-15T00:59:59Z' })
  data.usageEvents.push({ ...data.usageEvents[0], id: 'late', occurred_at: window.to })
  data.productEvents.push({ ...data.productEvents[0], id: 'late-event', session_id: 'late-session', occurred_at: window.to })
  const report = buildMetricsReport(data, window)
  assert.equal(report.usage.calls, 3)
  assert.equal(report.funnel[0].sessions, 2)
})

test('same session and duplicate events do not inflate calls, totals, or cohorts', () => {
  const data = demoMetrics()
  data.usageEvents.push(data.usageEvents[0])
  data.productEvents.push(data.productEvents[0])
  const report = buildMetricsReport(data, window)
  assert.equal(report.usage.calls, 3)
  assert.equal(report.usage.sessions, 2)
  assert.equal(report.funnel[0].sessions, 2)
  assert.equal(report.funnel.at(-1).sessions, 1)
  assert.equal(report.activity.find(row => row.eventName === 'first_action_completed').sessions, 2)
})

test('cohort excludes unrelated returning users and events before the required previous stage', () => {
  const rows = [
    event('a', 'goal_confirmed', '02'),
    event('a', 'goal_intake_started', '03'),
    event('a', 'goal_draft_created', '04'),
    event('b', 'goal_intake_started', '01'),
    event('b', 'goal_draft_created', '02'),
    event('b', 'goal_confirmed', '03'),
    event('b', 'plan_generated', '04'),
    event('b', 'first_action_completed', '05'),
    event('returning', 'goal_confirmed', '01'),
    event('returning', 'first_action_completed', '02'),
  ]
  const report = summarizeFunnel(rows.reverse())
  assert.deepEqual(report.map(row => row.sessions), [2, 2, 1, 1, 1])
  assert.equal(report[2].fromPrevious, 0.5)
  assert.equal(report.at(-1).fromGoalStart, 0.5)
})

test('unknown cost and empty data are not presented as zero-dollar totals', () => {
  const report = buildMetricsReport(demoMetrics(), window)
  assert.equal(report.usage.knownCostUsd, 0.01)
  assert.equal(report.usage.costUsd, null)
  assert.equal(report.usage.costPerCallUsd, null)
  const empty = summarizeUsage([])
  assert.equal(empty.costUsd, null)
  assert.equal(empty.costPerSessionUsd, null)
  assert.equal(empty.retryRate, null)
  assert.match(renderMarkdownReport(report), /비용 미완전/)
  assert.match(renderMarkdownReport(report), /가상 데이터/)
})

test('partial tool costs, missing prices and malformed numeric metrics cannot masquerade as complete', () => {
  const base = demoMetrics().usageEvents[0]
  assert.equal(summarizeUsage([{ ...base, cost_status: 'partial' }]).costUsd, null)
  assert.equal(summarizeUsage([{ ...base, estimated_cost_usd_micros: null }]).complete, false)
  assert.throws(() => summarizeUsage([{ ...base, latency_ms: 'oops' }]), /invalid_metric/)
  assert.throws(() => summarizeUsage([{ ...base, input_tokens: -1 }]), /invalid_metric/)
  assert.throws(() => summarizeUsage([{ ...base, estimated_cost_usd_micros: 2 ** 55 }]), /invalid_metric/)
})

test('retry rate counts retried calls rather than all attempts; language filters keep exact sessions', () => {
  const base = demoMetrics().usageEvents[0]
  const summary = summarizeUsage([base, { ...base, retries: 3 }])
  assert.equal(summary.retryRate, 0.5)
  assert.equal(summary.retries, 3)
  const report = buildMetricsReport(demoMetrics(), window, { country: 'KR', locale: 'ko-KR' })
  assert.equal(report.usage.costUsd, 0.005)
  assert.equal(report.segments.length, 1)
  assert.equal(report.funnel[0].sessions, 1)
  assert.equal(report.usage.averageLatencyMs, 1500)
})

test('report contains aggregates only, no session IDs or injected source payloads', () => {
  const data = demoMetrics()
  data.usageEvents[0].message = 'PRIVATE MESSAGE'
  data.productEvents[0].properties = { token: 'PRIVATE TOKEN' }
  const report = buildMetricsReport(data, window)
  const output = JSON.stringify(report) + renderMarkdownReport(report)
  for (const value of ['demo-a', 'demo-b', 'session_id', 'PRIVATE MESSAGE', 'PRIVATE TOKEN']) assert.ok(!output.includes(value), value)
})

test('strict dates and days reject truncated arguments and invalid calendar dates', () => {
  for (const days of ['1.5', '30abc', '0', '-1', '366']) assert.throws(() => reportWindow({ days }))
  assert.throws(() => reportWindow({ from: '2026-02-30', to: '2026-03-10' }))
  assert.throws(() => reportWindow({ from: '2026-09-20', to: '2026-09-10' }))
  assert.throws(() => buildMetricsReport(demoMetrics(), window, { country: 'kr' }))
})

test('reader follows actual server page lengths with exact counts and stable ordering', async () => {
  let reads = 0
  const seenQueries = []
  const result = await fetchMetrics({
    url: 'https://onju-test.invalid', key: 'test-only', ...window, country: 'KR', locale: 'ko-KR',
    fetcher: async (url, init) => {
      reads++
      const query = new URL(url)
      seenQueries.push(query)
      assert.equal(init.method, 'GET')
      assert.equal(init.redirect, 'error')
      const offset = Number(init.headers.range.split('-')[0])
      const product = query.pathname.endsWith('web_mvp_product_events')
      const all = product ? [] : [{ id: 'one' }, { id: 'two' }]
      const page = all.slice(offset, offset + 1) // Server caps below requested 1000.
      return new Response(JSON.stringify(page), { headers: { 'content-range': page.length ? offset + '-' + offset + '/' + all.length : '*/0' } })
    },
  })
  assert.equal(result.usageEvents.length, 2)
  assert.equal(result.productEvents.length, 0)
  assert.equal(reads, 3)
  for (const query of seenQueries) {
    assert.deepEqual(query.searchParams.getAll('occurred_at'), ['gte.' + window.from, 'lt.' + window.to])
    assert.equal(query.searchParams.get('order'), 'occurred_at.asc,id.asc')
    assert.equal(query.searchParams.get('country_code'), 'eq.KR')
    for (const field of query.searchParams.get('select').split(',')) assert.ok(!['*', 'message', 'messages', 'properties', 'session_token'].includes(field))
  }
})

test('reader refuses truncated or changing pages and does not expose server error bodies', async () => {
  const input = { url: 'https://onju-test.invalid', key: 'test-only', ...window }
  await assert.rejects(fetchMetrics({ ...input, fetcher: async () => new Response('SECRET', { status: 403 }) }), error => !error.message.includes('SECRET') && error.message.includes('403'))
  await assert.rejects(fetchMetrics({ ...input, fetcher: async () => new Response('[]') }), /incomplete_pagination/)
  await assert.rejects(fetchMetrics({ ...input, fetcher: async () => new Response('[]', { headers: { 'content-range': '*/5' } }) }), /truncated_page/)
  const count = new Map()
  await assert.rejects(fetchMetrics({ ...input, fetcher: async url => {
    const next = (count.get(url) ?? 0) + 1
    count.set(url, next)
    return new Response('[{}]', { headers: { 'content-range': next === 1 ? '0-0/2' : '1-1/3' } })
  } }), /changed_during_read/)
})

test('insecure remote endpoints are rejected before touching fetch', async () => {
  let calls = 0
  await assert.rejects(fetchMetrics({ url: 'http://remote.invalid', key: 'test-only', ...window, fetcher: () => { calls++ } }), /requires_https/)
  assert.equal(calls, 0)
})
