// Isolated live A/B benchmark. Never changes the production model or user sessions.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(root, 'logs/agent-ab')
const functionDir = resolve(root, 'supabase/functions/onju-agent-ab-eval')
const sourceDir = resolve(root, 'supabase/functions/onju-agent-v2')
const hash = text => createHash('sha256').update(text).digest('hex')
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const writeJson = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const models = ['gpt-4.1-2025-04-14', 'gpt-4.1-mini-2025-04-14']
const bounds = [{ days: [0, 1, 2, 3, 4, 5, 6], wake: '06:00', bedtime: '23:00', variable: false }]
const work = { days: [0, 1, 2, 3, 4], title: '근무', start: '09:00', end: '18:00', kind: 'fixed' }
const base = { stage: 1, day_bounds: bounds, blocks: [], messages: [] }
const history = (user, assistant) => [{ id: 'u', role: 'user', text: user }, { id: 'a', role: 'assistant', text: assistant }]
const draft = '**독서 초안**: 우선 2주 동안 주 3회, 한 번에 10분 읽기를 제안해요. 결과 기준은 2주간 6회 실행이에요. 현재 독서량은 미정으로 둘게요.\n\n이 초안으로 시작할까요?'
const proposedState = { ...base, stage: 5, messages: history('독서 습관을 만들고 싶어. 수치와 기간은 네가 가볍게 추천해줘.', draft) }
// Frozen-context cases isolate model decisions from divergent earlier model replies.
const cases = [
  { id: 'two-blocks', name: '이동·근무 동시 추출', initial: base, message: '평일 6:30-8:30까지 이동하고, 8:30-17:30까지 근무해', rules: ['commuteWork'] },
  { id: 'unknown-weekend', name: '주말 미정 허용', initial: {}, message: '평일은 6시 기상 23시 취침. 주말 기상 취침은 전혀 일정하지 않아, 그때그때 알려줄게', rules: ['weekdayOnly', 'scheduleFocus'] },
  { id: 'partial-sleep', name: '토요일 답변을 일요일에 복제하지 않기', initial: { ...base, stage: 0, day_bounds: [{ ...bounds[0], days: [0, 1, 2, 3, 4] }], messages: history('평일은 6시 기상 23시 취침, 토요일 8시 기상이고 일요일 7시 기상이야', '평일 기상·취침을 반영했어요. 토요일에는 몇 시에 잠드나요?') }, message: '토요일에는 자정에 자요', rules: ['saturdayOnly', 'askSunday'] },
  { id: 'correct-wednesday', name: '수요일 수정·나머지 요일 보존', initial: { ...base, blocks: [work], messages: history('평일 9시부터 18시까지 근무해', '평일 근무 시간을 반영했어요.') }, message: '수요일만 종료 시간을 17시로 바꿔줘', rules: ['wednesdayCorrection'] },
  { id: 'schedule-done', name: '일정 완료 후 목표 전환', initial: { ...base, blocks: [work] }, message: '더이상 일정에 대해 설명할게 없어. 이제 목표를 세우자', rules: ['goalsFocus', 'goalReply'] },
  { id: 'three-goals', name: '일·건강·신앙 초안 능동 제안', initial: { ...base, blocks: [work] }, message: '목표를 세우고 달성하고 싶어. 일적인 부분과 건강, 신앙 세 파트야. 너무 질문이 많으니까 네가 작게 시작할 초안부터 추천해줘', rules: ['goalsFocus', 'threeDomains', 'draftChoices', 'noUnapprovedNumbers'] },
  { id: 'approve-draft', name: '동의한 기간·수치·루틴 정확히 저장', initial: proposedState, message: '그 초안 그대로 시작할게. 현재 독서량은 미정으로 두고 반영해줘', rules: ['approvedReading'] },
  { id: 'reject-draft', name: '초안 거절·축소 제안은 미확정', initial: proposedState, message: '아니, 그건 부담돼. 더 가벼운 다른 초안을 제안해줘. 아직 확정하지는 말고.', rules: ['noUnapprovedNumbers', 'draftChoices'] },
  { id: 'overnight', name: '자정 넘는 일정 구조 한계', structuralControl: true, initial: base, message: '매주 금요일 밤 11시부터 토요일 새벽 1시까지 모임이 있어. 시간 지도에 반영해줘', rules: ['overnightCoverage'] },
]

function prepare() {
  // This instrumenter is retained for the historical v2 source snapshot only.
  if (readFileSync(resolve(sourceDir, 'index.ts'), 'utf8').includes('runAgentTurn')) throw new Error('Historical v2 A/B instrumenter: current v3 uses verify-agent-quality.mjs prepare|run|export. Preserved A/B results remain in docs/evals/agent-model-comparison-2026-09-04.json.')
  if (existsSync(resolve(output, 'config.local.json'))) throw new Error('Benchmark already prepared; reuse it or explicitly clean up first.')
  mkdirSync(output, { recursive: true })
  mkdirSync(functionDir, { recursive: true })
  const token = randomBytes(32).toString('hex')
  const expires = Date.now() + 2 * 60 * 60 * 1000
  const manifest = { createdAt: new Date().toISOString(), expiresAt: new Date(expires).toISOString(), models, sourceHashes: {}, fixtureHash: hash(JSON.stringify(cases)), maxObservedCostUsd: 3, deviations: ['In-memory request/response state instead of database; no production user records.', 'Fixed KST timestamp for paired inputs.', 'store:false for synthetic provider responses.', '429-only retry instrumentation; time waiting is recorded separately.'] }
  let source = readFileSync(resolve(sourceDir, 'index.ts'), 'utf8').replaceAll('\r\n', '\n')
  manifest.sourceHashes['index.ts'] = hash(source)
  const replace = (needle, replacement) => {
    if (!source.includes(needle)) throw new Error(`Instrumentation anchor missing: ${needle.slice(0, 60)}`)
    source = source.replace(needle, replacement)
  }
  replace("import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'\n", '')
  replace("Deno.serve(async req=>{if(req.method==='OPTIONS')return new Response('ok',{headers:cors});try{", `Deno.serve(async req=>{const events:any[]=[];const transport:any[]=[];let currentModel='';try{
 if(req.method!=='POST'||Date.now()>${expires})return new Response('expired',{status:403});
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(req.headers.get('x-eval-token')||''));
 if(Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,'0')).join('')!=='${hash(token)}')return new Response('forbidden',{status:403});`)
  replace(" const apiKey=Deno.env.get('OPENAI_API_KEY'),url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');if(!apiKey||!url||!key)throw new Error('missing environment')", " const apiKey=Deno.env.get('OPENAI_API_KEY');if(!apiKey)throw new Error('missing environment')")
  replace(" const db=createClient(url,key,{auth:{persistSession:false}});const {data,error}=await db.from('web_mvp_agent_sessions').select('*').eq('session_id',body.sessionId).maybeSingle();if(error)throw error", ` if(!${JSON.stringify(models)}.includes(body.model)||JSON.stringify(body).length>100000)return new Response('invalid eval request',{status:400});currentModel=body.model;const data=body.evalState||{};`)
  replace("const events:any[]=[];const now=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'full',timeStyle:'short'}).format(new Date())", "const now='2026년 9월 4일 금요일 오전 9:00'")
  replace("model:Deno.env.get('ONJU_AGENT_MODEL')||'gpt-4.1',store:true", "model:body.model,store:false")
  replace("const res=await openai(apiKey,request);if(!res.ok)throw new Error(`openai_${res.status}`)", `let res:Response|undefined;for(let attempt=0;attempt<4;attempt++){const started=Date.now();res=await openai(apiKey,request);const entry:any={status:res.status,elapsedMs:Date.now()-started,requestId:res.headers.get('x-request-id'),retryWaitMs:0};transport.push(entry);if(res.status!==429||attempt===3)break;entry.retryWaitMs=20000;await new Promise(resolve=>setTimeout(resolve,entry.retryWaitMs));}if(!res?.ok)throw new Error('openai_'+res?.status)`)
  const saveStart = source.indexOf(' const payload={session_id:')
  const saveEnd = source.indexOf(' return new Response(JSON.stringify({assistant_message:', saveStart)
  if (saveStart < 0 || saveEnd < 0) throw new Error('Save instrumentation anchor missing')
  source = source.slice(0, saveStart) + source.slice(saveEnd)
  replace('JSON.stringify({assistant_message:final,suggestions,', 'JSON.stringify({evalState:state,evalEvents:events,transport,assistant_message:final,suggestions,')
  replace('JSON.stringify({error:code})', 'JSON.stringify({error:code,evalEvents:events,transport,model:currentModel})')
  writeFileSync(resolve(functionDir, 'index.ts'), source)
  for (const file of ['state.ts', 'goal.ts', 'prompt.ts']) {
    const content = readFileSync(resolve(sourceDir, file), 'utf8')
    manifest.sourceHashes[file] = hash(content.replaceAll('\r\n', '\n'))
    writeFileSync(resolve(functionDir, file), content)
  }
  writeJson(resolve(output, 'config.local.json'), { token, expires })
  writeJson(resolve(output, 'manifest.json'), manifest)
  writeJson(resolve(output, 'fixtures.json'), cases)
  console.log(`Prepared ${cases.length} paired fixtures. No keys printed; temporary function expires ${manifest.expiresAt}.`)
}

const dayMap = blocks => Object.fromEntries(blocks.flatMap(b => b.days.map(d => [d, b])))
function checks(test, result) {
  if (result.error) return { transportSuccess: false }
  const state = result.state, reply = result.assistant_message || '', card = state.goalCard || {}, b = state.blocks, d = dayMap(state.dayBounds)
  const answer = { transportSuccess: true, readableParagraphs: reply.includes('\n\n'), boundedLength: reply.length <= 900, atMostOneQuestionMark: (reply.match(/[?？]/g) || []).length <= 1 }
  const actions = card.weeklyActions || []
  const hasBlock = (days, start, end) => days.every(day => b.some(x => x.days.includes(day) && x.start === start && x.end === end))
  for (const rule of test.rules) {
    answer[rule] = ({
      commuteWork: () => b.length === 2 && hasBlock([0, 1, 2, 3, 4], '06:30', '08:30') && hasBlock([0, 1, 2, 3, 4], '08:30', '17:30'),
      weekdayOnly: () => Object.keys(d).length === 5 && [0, 1, 2, 3, 4].every(day => d[day]?.wake === '06:00' && d[day]?.bedtime === '23:00'),
      scheduleFocus: () => state.stage === 1,
      saturdayOnly: () => state.stage === 0 && d[5]?.wake === '08:00' && d[5]?.bedtime === '00:00' && !d[6],
      askSunday: () => /일요일/.test(reply) && /(취침|잠|자나요)/.test(reply),
      wednesdayCorrection: () => b.length === 2 && hasBlock([0, 1, 3, 4], '09:00', '18:00') && hasBlock([2], '09:00', '17:00') && !b.some(x => x.days.includes(2) && x.end === '18:00'),
      goalsFocus: () => state.stage === 5,
      goalReply: () => /목표/.test(reply),
      threeDomains: () => /일/.test(reply) && /건강/.test(reply) && /신앙/.test(reply) && /\d/.test(reply),
      draftChoices: () => /초안/.test(reply) && result.suggestions?.length >= 2,
      noUnapprovedNumbers: () => actions.length === 0 && !card.durationWeeks && !card.targetMetric && !card.baselineMetric,
      approvedReading: () => state.stage === 5 && card.durationWeeks === 2 && /6/.test(card.targetMetric || '') && !card.baselineMetric && actions.some(a => /독서|읽기|책/.test(a.title) && a.frequencyPerWeek === 3 && a.durationMinutes === 10),
      overnightCoverage: () => hasBlock([4], '23:00', '24:00') && hasBlock([5], '00:00', '01:00'),
    })[rule]()
  }
  return answer
}

function costs(result, model) {
  const rate = model.includes('mini') ? [0.4, 0.1, 1.6] : [2, 0.5, 8]
  return (result.evalEvents || []).filter(e => e.tool === 'model_usage').reduce((acc, e) => {
    const input = e.usage.input_tokens, cached = e.usage.input_tokens_details?.cached_tokens || 0, out = e.usage.output_tokens
    acc.input += input; acc.cached += cached; acc.output += out; acc.calls++
    acc.usd += ((input - cached) * rate[0] + cached * rate[1] + out * rate[2]) / 1e6
    acc.uncachedUsd += (input * rate[0] + out * rate[2]) / 1e6
    return acc
  }, { input: 0, cached: 0, output: 0, calls: 0, usd: 0, uncachedUsd: 0 })
}

async function run() {
  const config = json(resolve(output, 'config.local.json')), manifest = json(resolve(output, 'manifest.json'))
  if (Date.now() >= config.expires) throw new Error('Temporary evaluation token expired')
  for (const [file, expected] of Object.entries(manifest.sourceHashes)) if (hash(readFileSync(resolve(sourceDir, file), 'utf8').replaceAll('\r\n', '\n')) !== expected) throw new Error(`Frozen source changed: ${file}`)
  if (manifest.fixtureHash !== hash(JSON.stringify(cases))) throw new Error('Frozen fixtures changed')
  const env = Object.fromEntries(readFileSync(resolve(root, '.env.local'), 'utf8').split(/\r?\n/).filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
  const endpoint = `${env.VITE_SUPABASE_URL}/functions/v1/onju-agent-ab-eval`
  const resultPath = resolve(output, 'results.json')
  const results = existsSync(resultPath) ? json(resultPath) : []
  const repetitions = Number(process.argv.find(a => a.startsWith('--repeats='))?.split('=')[1] || 2)
  for (let rep = 0; rep < repetitions; rep++) for (const [i, test] of cases.entries()) {
    const order = (rep + i) % 2 ? [...models].reverse() : models
    for (const model of order) {
      if (results.some(r => r.rep === rep && r.id === test.id && r.model === model)) continue
      if (results.reduce((sum, r) => sum + r.cost.usd, 0) >= manifest.maxObservedCostUsd) throw new Error('Observed cost ceiling reached; stopped before another turn')
      const startedAt = new Date().toISOString(), started = performance.now()
      let result, status
      try {
        const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`, 'x-eval-token': config.token }, body: JSON.stringify({ sessionId: randomUUID(), message: test.message, model, evalState: test.initial }), signal: AbortSignal.timeout(180000) })
        status = response.status
        result = await response.json()
      } catch (error) { result = { error: String(error), usageUnknown: true } }
      const check = checks(test, result), cost = costs(result, model)
      const record = { id: test.id, name: test.name, structuralControl: !!test.structuralControl, rep, model, startedAt, elapsedMs: performance.now() - started, httpStatus: status, checks: check, pass: Object.values(check).every(Boolean), cost, result }
      results.push(record); writeJson(resultPath, results)
      console.log(JSON.stringify({ case: test.id, rep: rep + 1, model, pass: record.pass, failed: Object.entries(check).filter(([, v]) => !v).map(([k]) => k), seconds: +(record.elapsedMs / 1000).toFixed(1), calls: cost.calls, usd: +cost.usd.toFixed(5), httpStatus: status, error: result.error }))
      // Pace separate turns, outside the measured request latency. A 429 is still recorded, never hidden.
      await pause(result.error ? 20000 : 8000)
    }
  }
  summarize()
}

function summarize() {
  const results = json(resolve(output, 'results.json'))
  const median = values => { const v = [...values].sort((a, b) => a - b); const i = Math.floor(v.length / 2); return v.length ? (v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2) : null }
  const summaries = models.map(model => {
    const all = results.filter(r => r.model === model), normal = all.filter(r => !r.structuralControl), successful = all.filter(r => !r.result.error)
    return {
      model, cases: normal.length, passed: normal.filter(r => r.pass).length,
      completed: successful.length, total: all.length,
      usd: all.reduce((s, r) => s + r.cost.usd, 0),
      uncachedUsd: all.reduce((s, r) => s + r.cost.uncachedUsd, 0),
      calls: all.reduce((s, r) => s + r.cost.calls, 0),
      input: all.reduce((s, r) => s + r.cost.input, 0),
      cached: all.reduce((s, r) => s + r.cost.cached, 0),
      output: all.reduce((s, r) => s + r.cost.output, 0),
      medianSeconds: median(successful.map(r => r.elapsedMs / 1000)),
      medianNo429Seconds: median(successful.filter(r => !(r.result.transport || []).some(t => t.status === 429)).map(r => r.elapsedMs / 1000)),
      rateLimits: all.reduce((s, r) => s + (r.result.transport || []).filter(t => t.status === 429).length, 0),
      failed: all.filter(r => !r.pass).map(r => ({ id: r.id, rep: r.rep + 1, checks: Object.entries(r.checks).filter(([, v]) => !v).map(([k]) => k) })),
    }
  })
  writeJson(resolve(output, 'summary.json'), summaries)
  console.log(JSON.stringify(summaries, null, 2))
}

const mode = process.argv[2]
if (mode === 'prepare') prepare()
else if (mode === 'run') await run()
else if (mode === 'summary') summarize()
else if (mode === 'export') {
  summarize()
  const destination = resolve(root, 'docs/evals')
  mkdirSync(destination, { recursive: true })
  // Only synthetic fixtures, responses and metering. Never export config.local.json.
  writeJson(resolve(destination, 'agent-model-comparison-2026-09-04.json'), {
    manifest: json(resolve(output, 'manifest.json')),
    fixtures: json(resolve(output, 'fixtures.json')),
    summary: json(resolve(output, 'summary.json')),
    results: json(resolve(output, 'results.json')),
  })
} else throw new Error('Usage: node compare-agent-models.mjs prepare|run|summary|export [--repeats=2]')
