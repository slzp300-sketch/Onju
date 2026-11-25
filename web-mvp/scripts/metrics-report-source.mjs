// Select metadata only, never messages, application state or credentials.
const TABLES = {
  usageEvents: {
    name: 'web_mvp_ai_usage_events',
    fields: 'id,session_id,occurred_at,country_code,locale,provider,model,surface,operation,input_tokens,cached_input_tokens,output_tokens,retries,latency_ms,estimated_cost_usd_micros,cost_status',
  },
  productEvents: { name: 'web_mvp_product_events', fields: 'id,session_id,occurred_at,country_code,locale,event_name' },
}

export async function fetchMetrics({ url, key, from, to, country, locale, fetcher = fetch }) {
  const base = new URL(url)
  if (base.protocol !== 'https:' && !(base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname))) throw new Error('metrics_URL_requires_https')
  if (base.username || base.password || base.search || base.hash || base.pathname !== '/') throw new Error('invalid_supabase_origin')
  if (!key) throw new Error('missing_service_role_key')
  const read = async ({ name, fields }) => {
    const rows = []
    let offset = 0, expectedTotal
    for (let pages = 0; pages < 10_000; pages++) {
      const query = new URLSearchParams({ select: fields, order: 'occurred_at.asc,id.asc' })
      query.append('occurred_at', 'gte.' + from)
      query.append('occurred_at', 'lt.' + to)
      if (country) query.set('country_code', 'eq.' + country)
      if (locale) query.set('locale', 'eq.' + locale)
      const response = await fetcher(base.origin + '/rest/v1/' + name + '?' + query, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { apikey: key, authorization: 'Bearer ' + key, prefer: 'count=exact', range: offset + '-' + (offset + 999) },
      })
      if (!response.ok) throw new Error('metrics_query_failed_' + name + '_' + response.status)
      const range = response.headers.get('content-range') ?? ''
      const match = /^(?:(\d+)-(\d+)|\*)\/(\d+)$/.exec(range)
      if (!match) throw new Error('metrics_incomplete_pagination')
      const total = Number(match[3])
      if (expectedTotal !== undefined && expectedTotal !== total) throw new Error('metrics_changed_during_read_retry_report')
      expectedTotal = total
      const page = await response.json()
      if (!Array.isArray(page) || (page.length && (Number(match[1]) !== offset || Number(match[2]) !== offset + page.length - 1))) throw new Error('invalid_metrics_page')
      rows.push(...page)
      offset += page.length
      if (offset === total) return rows
      if (!page.length || offset > total) throw new Error('metrics_truncated_page')
    }
    throw new Error('metrics_page_limit_reduce_window')
  }
  const entries = await Promise.all(Object.entries(TABLES).map(async ([field, table]) => [field, await read(table)]))
  return { ...Object.fromEntries(entries), source: 'supabase_recorded_events' }
}

export function demoMetrics() {
  const base = { country_code: 'KR', locale: 'ko-KR', occurred_at: '2026-09-15T01:00:00Z' }
  const usage = { ...base, provider: 'openai', model: 'demo-model', surface: 'setup_chat', operation: 'conversation', input_tokens: 1000, cached_input_tokens: 0, output_tokens: 100, retries: 0, latency_ms: 1500, estimated_cost_usd_micros: 5000, cost_status: 'estimated' }
  return {
    source: 'synthetic_demo',
    usageEvents: [
      { ...usage, id: 'demo-u1', session_id: 'demo-a' },
      { ...usage, id: 'demo-u2', session_id: 'demo-b', country_code: 'US', locale: 'en-US', retries: 2 },
      { ...usage, id: 'demo-u3', session_id: 'demo-b', country_code: 'US', locale: 'en-US', estimated_cost_usd_micros: null, cost_status: 'unpriced' },
    ],
    productEvents: [
      ...['goal_intake_started', 'goal_draft_created', 'goal_confirmed', 'plan_generated', 'first_action_completed', 'daily_checkin_completed'].map((event_name, i) => ({ ...base, id: 'demo-a' + i, session_id: 'demo-a', event_name })),
      { ...base, id: 'demo-b0', session_id: 'demo-b', event_name: 'goal_intake_started', country_code: 'US', locale: 'en-US' },
      { ...base, id: 'demo-c0', session_id: 'demo-returning', event_name: 'first_action_completed' },
    ],
  }
}
