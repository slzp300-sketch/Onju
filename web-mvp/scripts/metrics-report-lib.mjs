// Use raw events for the same [from, to) window; daily views cannot represent
// partial UTC days or deduplicate sessions across days.
export const FUNNEL_STAGES = [
  ['goal_intake_started', '목표 설계 시작'],
  ['goal_draft_created', '목표 초안 생성'],
  ['goal_confirmed', '목표 확정'],
  ['plan_generated', '계획 생성'],
  ['first_action_completed', '첫 실행 완료'],
]

const integer = (value, field) => {
  if (!['number', 'string'].includes(typeof value) || value === '') throw new Error('invalid_metric_' + field)
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('invalid_metric_' + field)
  return n
}
const sum = (rows, field) => rows.reduce((total, row) => integer(total + integer(row[field], field), field), 0)
const ratio = (n, d) => d > 0 ? n / d : null
const percent = n => n === null ? '—' : (n * 100).toFixed(1) + '%'
const money = n => n === null ? '미산정' : '$' + n.toFixed(6)
const cell = value => String(value ?? '').replaceAll('|', '\\|').replace(/[\r\n]+/g, ' ')
const time = value => {
  const n = Date.parse(value)
  if (!Number.isFinite(n)) throw new Error('invalid_event_timestamp')
  return n
}

export function reportWindow({ days = '30', from, to } = {}, now = new Date()) {
  if (!/^\d+$/.test(String(days)) || Number(days) < 1 || Number(days) > 365) throw new Error('days_must_be_1_to_365')
  const parse = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) throw new Error('use_UTC_ISO_date')
    const ms = time(value)
    if (new Date(ms).toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error('invalid_date')
    return ms
  }
  const end = to ? parse(to) : now.getTime()
  const start = from ? parse(from) : end - Number(days) * 86_400_000
  if (!(end > start) || end - start > 366 * 86_400_000) throw new Error('invalid_report_window')
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() }
}

export function summarizeUsage(rows) {
  for (const row of rows) {
    if (!['estimated', 'partial', 'unpriced'].includes(row.cost_status)) throw new Error('invalid_cost_status')
    if (row.estimated_cost_usd_micros !== null) integer(row.estimated_cost_usd_micros, 'cost')
    if (integer(row.cached_input_tokens, 'cached_input_tokens') > integer(row.input_tokens, 'input_tokens')) throw new Error('invalid_cached_tokens')
  }
  const calls = rows.length
  const known = rows.filter(row => row.estimated_cost_usd_micros !== null && row.cost_status !== 'unpriced')
  const knownCostUsd = sum(known, 'estimated_cost_usd_micros') / 1_000_000
  const missingCostCalls = calls - known.length
  const partialCalls = rows.filter(row => row.cost_status === 'partial').length
  const unpricedCalls = rows.filter(row => row.cost_status === 'unpriced').length
  const complete = calls > 0 && missingCostCalls === 0 && partialCalls === 0
  const sessions = new Set(rows.map(row => row.session_id)).size
  const retries = sum(rows, 'retries')
  return {
    calls, sessions, knownCostUsd, costUsd: complete ? knownCostUsd : null,
    costPerCallUsd: complete ? knownCostUsd / calls : null,
    costPerSessionUsd: complete ? knownCostUsd / sessions : null,
    inputTokens: sum(rows, 'input_tokens'), cachedInputTokens: sum(rows, 'cached_input_tokens'),
    outputTokens: sum(rows, 'output_tokens'), retries,
    retriedCalls: rows.filter(row => Number(row.retries) > 0).length,
    retryRate: ratio(rows.filter(row => Number(row.retries) > 0).length, calls),
    retriesPerCall: ratio(retries, calls),
    averageLatencyMs: calls ? Math.round(sum(rows, 'latency_ms') / calls) : null,
    partialCalls, unpricedCalls, missingCostCalls, complete,
  }
}

export function summarizeFunnel(rows) {
  const bySession = new Map()
  for (const row of rows) {
    if (!bySession.has(row.session_id)) bySession.set(row.session_id, [])
    bySession.get(row.session_id).push(row)
  }
  const counts = FUNNEL_STAGES.map(() => 0)
  for (const events of bySession.values()) {
    let previousTime = -Infinity
    for (const [i, [name]] of FUNNEL_STAGES.entries()) {
      const times = events.filter(row => row.event_name === name).map(row => time(row.occurred_at))
        .filter(t => t >= previousTime)
      if (!times.length) break
      previousTime = Math.min(...times)
      counts[i]++
    }
  }
  return FUNNEL_STAGES.map(([eventName, label], i) => ({
    eventName, label, sessions: counts[i],
    fromPrevious: i ? ratio(counts[i], counts[i - 1]) : null,
    fromGoalStart: ratio(counts[i], counts[0]),
  }))
}

export function summarizeSegments(rows) {
  const groups = new Map()
  for (const row of rows) {
    const fields = ['country_code', 'locale', 'provider', 'model', 'surface', 'operation']
    const group = Object.fromEntries(fields.map(field => [field, row[field]]))
    const key = JSON.stringify(group)
    if (!groups.has(key)) groups.set(key, { group, rows: [] })
    groups.get(key).rows.push(row)
  }
  return [...groups.values()].map(({ group, rows: events }) => ({ ...group, ...summarizeUsage(events) }))
    .sort((a, b) => b.knownCostUsd - a.knownCostUsd)
}

export function buildMetricsReport(data, window, filters = {}) {
  if (!Array.isArray(data.usageEvents) || !Array.isArray(data.productEvents)) throw new Error('invalid_metrics_input')
  if (filters.country && !/^[A-Z]{2}$/.test(filters.country)) throw new Error('invalid_country')
  if (filters.locale && !/^[A-Za-z0-9-]{2,35}$/.test(filters.locale)) throw new Error('invalid_locale')
  const start = time(window.from), end = time(window.to)
  const filter = rows => {
    const ids = new Set()
    return rows.filter(row => {
      if (typeof row.id !== 'string' || !row.id || typeof row.session_id !== 'string' || !row.session_id) throw new Error('missing_event_identity')
      const t = time(row.occurred_at)
      if (t < start || t >= end || (filters.country && row.country_code !== filters.country) || (filters.locale && row.locale !== filters.locale)) return false
      if (ids.has(row.id)) return false
      ids.add(row.id)
      return true
    })
  }
  const usageRows = filter(data.usageEvents), productRows = filter(data.productEvents)
  const eventGroups = new Map()
  for (const row of productRows) {
    if (typeof row.event_name !== 'string' || !/^[a-z][a-z0-9_]{1,59}$/.test(row.event_name)) throw new Error('invalid_event_name')
    if (!eventGroups.has(row.event_name)) eventGroups.set(row.event_name, [])
    eventGroups.get(row.event_name).push(row)
  }
  const activity = [...eventGroups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([eventName, rows]) => ({
    eventName, events: rows.length, sessions: new Set(rows.map(row => row.session_id)).size,
  }))
  return {
    ...window, filters, source: data.source ?? 'local_input',
    usage: summarizeUsage(usageRows), funnel: summarizeFunnel(productRows),
    activity, segments: summarizeSegments(usageRows),
    limitations: [
      '현재 보존 중인 이벤트의 추정치이며, 측정 도입 전·기록 실패·청구됐지만 응답을 받지 못한 요청은 포함되지 않을 수 있습니다.',
      '세션은 브라우저 익명 세션이며 사람 수와 다릅니다. 세션 삭제·만료 시 연결된 측정 행도 삭제될 수 있습니다.',
      '전환율은 기간 내 목표 설계를 시작하고 같은 기간 내 단계 순서를 만족한 세션 기준입니다. 기간 말에 시작한 세션의 전환은 아직 미완료일 수 있습니다.',
      '일일 점검·실험은 첫 실행보다 먼저 발생할 수 있어 별도 활동 표에 표시합니다. 최종 정산은 공급자 청구서 기준입니다.',
    ],
  }
}

export function renderMarkdownReport(report) {
  const { from, to, usage, funnel, segments, activity, filters, source } = report
  return [
    '# 온주 AI 비용·전환 운영 리포트', '',
    '데이터: ' + cell(source) + (source === 'synthetic_demo' ? ' (가상 데이터 · 실제 지출 아님)' : ''),
    '조회 기간(UTC): ' + from + ' 이상 ~ ' + to + ' 미만',
    '필터: 국가 ' + cell(filters.country || '전체') + ' / 언어 ' + cell(filters.locale || '전체'), '',
    '## 핵심 지표', '',
    '- 기록된 AI 호출: **' + usage.calls + '건** / AI 사용 익명 세션: **' + usage.sessions + '개**',
    '- 추정 AI 원가: **' + money(usage.costUsd) + '** / 산정 가능한 금액 합계: **' + money(usage.knownCostUsd) + '**',
    '- 모델 호출당 평균: **' + money(usage.costPerCallUsd) + '** / AI 사용 세션당 평균: **' + money(usage.costPerSessionUsd) + '**',
    '- 사용자 메시지 한 건이 여러 모델 호출을 만들 수 있으므로 모델 호출 단가를 채팅 한 건 단가로 보지 않습니다.',
    '- 평균 지연: **' + (usage.averageLatencyMs ?? '—') + ' ms**',
    '- 재시도가 발생한 호출: ' + usage.retriedCalls + '건 (' + percent(usage.retryRate) + ') / 추가 시도: ' + usage.retries + '회',
    '- 입력 토큰 ' + usage.inputTokens + ' (캐시 ' + usage.cachedInputTokens + ' 포함) / 출력 토큰 ' + usage.outputTokens, '',
    usage.calls === 0 ? '> 기록된 호출이 없습니다. 실제 사용 비용이 0이라는 뜻은 아닙니다.'
      : !usage.complete ? '> 비용 미완전: 도구 비용 미포함 ' + usage.partialCalls + '건 / 단가·사용량 미확인 ' + usage.unpricedCalls + '건 / 금액 미산정 ' + usage.missingCostCalls + '건. 총액과 평균은 미산정으로 표시합니다.'
        : '> 기록된 호출의 토큰 비용 추정치입니다. 기록되지 않은 과거 지출까지 포함하는 총 청구액은 아닙니다.', '',
    '## 목표 설계 시작 세션의 순차 전환', '',
    '| 단계 | 고유 세션 | 직전 단계 대비 | 목표 시작 대비 |', '|---|---:|---:|---:|',
    ...funnel.map(row => '| ' + row.label + ' | ' + row.sessions + ' | ' + percent(row.fromPrevious) + ' | ' + percent(row.fromGoalStart) + ' |'), '',
    '## 기간 내 활동 (단계 순서와 무관)', '',
    '| 이벤트 | 횟수 | 고유 세션 |', '|---|---:|---:|',
    ...activity.map(row => '| ' + cell(row.eventName) + ' | ' + row.events + ' | ' + row.sessions + ' |'), '',
    '## 국가·언어·모델·작업별 원가', '',
    '| 국가 / 언어 | 공급자 / 모델 | 화면 / 작업 | 호출 | 추정 원가 | 산정 금액 합계 |', '|---|---|---|---:|---:|---:|',
    ...segments.map(row => '| ' + cell(row.country_code) + ' / ' + cell(row.locale) + ' | ' + cell(row.provider) + ' / ' + cell(row.model) + ' | ' + cell(row.surface) + ' / ' + cell(row.operation) + ' | ' + row.calls + ' | ' + money(row.costUsd) + ' | ' + money(row.knownCostUsd) + ' |'), '',
    '## 해석 범위', '', ...report.limitations.map(note => '- ' + note), '',
  ].join('\n')
}
