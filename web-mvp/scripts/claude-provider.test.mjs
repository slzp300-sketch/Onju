import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createAnthropicMessagesAdapter, toAnthropicMessagesRequest, fromAnthropicMessagesResponse, compactAnthropicSchema, normalizeAnthropicCoachTool } from '../../supabase/functions/_shared/anthropicMessagesAdapter.ts'
import { formatReply } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/state.ts'
import { emptyBrief, updateGoalBrief } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalBrief.ts'
import { capacityContractLimits } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/goalCapacityContract.ts'
import { loadState, runAgentTurn } from '../../logs/sites/onju-web-mvp/supabase/functions/onju-agent-v2/agent.ts'
import { createCoachProvider } from '../../supabase/functions/_shared/coachProvider.ts'
import { estimateTokenCost } from '../../supabase/functions/_shared/onjuMetrics.ts'
import { estimateAiReservationMicroUsd, estimateObservedCost } from '../../supabase/functions/_shared/webMvpCostControl.ts'
import { LlmProviderTransportError } from '../../supabase/functions/_shared/llmGateway.ts'

const request = { model: 'claude-sonnet-4-6', input: [{ role: 'user', content: '독서 계획을 세워줘' }], instructions: '온주 규칙',
  tools: [{ type: 'function', name: 'respond', description: '답변', strict: true, parameters: { type: 'object', properties: { message: { type: 'string' } }, required: ['message'], additionalProperties: false } }],
  tool_choice: 'required', parallel_tool_calls: false, max_output_tokens: 4200 }
const raw = { id: 'msg_test', model: request.model, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tool_1', name: 'respond', input: { message: '같이 계획해요' } }],
  usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 200, cache_creation_input_tokens: 50 } }

test('question placement repair preserves content and never changes numeric plans',()=>{
  const value={paragraphs:['화요일 10분, 목요일 20분은 그대로예요.','이 구성으로 진행할까요?'],bullets:[],question:'',choices:[],goal_draft:{actions:[{minimumMinutes:10}]}}
  const before=structuredClone(value)
  assert.throws(()=>formatReply(value),/reply_needs/)
  const fixed=normalizeAnthropicCoachTool('respond',value)
  assert.deepEqual(fixed.input.paragraphs,[value.paragraphs[0]])
  assert.equal(fixed.input.question,value.paragraphs[1])
  assert.equal(formatReply(fixed.input).text,`${value.paragraphs[0]}\n\n**${value.paragraphs[1]}**`)
  assert.deepEqual(fixed.input.goal_draft,value.goal_draft)
  assert.deepEqual(value,before)
  const competing={...value,question:'언제 시작할까요?'}
  assert.deepEqual(normalizeAnthropicCoachTool('respond',competing).repairs,[])
  assert.throws(()=>formatReply(normalizeAnthropicCoachTool('respond',competing).input),/reply_needs/)
})

test('capacity compiles quoted source rather than model arithmetic; fabricated quote is still rejected',()=>{
  const source='월수금 퇴근 뒤 30분씩 가능해.'
  const args={capacity:{summary:'월·수·금 30분, 주 3회 × 30분 = 주 90분',evidence:source,status:'known'}}
  const fixed=normalizeAnthropicCoachTool('record_goal_brief',args)
  assert.equal(fixed.input.capacity.summary,source.slice(0,-1))
  const updated=updateGoalBrief({...emptyBrief(),areas:['파이썬']},fixed.input,source)
  assert.equal(capacityContractLimits(updated.capacity).weeklyMinutes.max,90)
  const forged=normalizeAnthropicCoachTool('record_goal_brief',{capacity:{...args.capacity,evidence:'주 20시간 가능해.'}})
  assert.throws(()=>updateGoalBrief({...emptyBrief(),areas:['파이썬']},forged.input,source),/evidence|grounded/)
})

test('only static Claude policy receives a 5-minute cache breakpoint; dynamic facts remain uncached',async()=>{
  let captured
  await assert.rejects(runAgentTurn(loadState(null),'CACHE_DYNAMIC_SENTINEL_782',{model:request.model,now:'2026-10-23T00:00:00Z',request:async body=>{captured=body;throw Error('offline_capture')}}),/offline_capture/)
  assert.equal(captured.prompt_cache_options.mode,'anthropic_static_prefix')
  assert.ok(!captured.instructions.includes('CACHE_DYNAMIC_SENTINEL_782'))
  const body=toAnthropicMessagesRequest(captured)
  assert.equal(body.system[0].cache_control.type,'ephemeral')
  assert.ok(body.system.slice(1).every(block=>!block.cache_control))
  assert.ok(body.messages.some(m=>m.content.some(block=>block.text?.includes('CACHE_DYNAMIC_SENTINEL_782'))))
})

test('Claude maps system, tools and single required call without changing validation schema', () => {
  const native = toAnthropicMessagesRequest(request)
  assert.equal(native.system, '온주 규칙')
  assert.equal(native.max_tokens, 4200)
  assert.deepEqual(native.tool_choice, { type: 'any', disable_parallel_tool_use: true })
  assert.deepEqual(native.tools[0].input_schema, request.tools[0].parameters)
  assert.equal(native.tools[0].strict, true)
  assert.equal(native.thinking.type, 'disabled')
})

test('strict mode retains enums and required fields, documents unsupported constraints, and leaves original validators unchanged', () => {
  const source = { type: 'object', properties: {
    count: { type: 'integer', minimum: 1, maximum: 7 },
    category: { type: 'string', enum: ['일', '독서'] },
    steps: { type: 'array', minItems: 2, maxItems: 5, items: { type: 'string', minLength: 1 } },
  }, required: ['count', 'category', 'steps'], additionalProperties: false }
  const before = JSON.stringify(source), compact = compactAnthropicSchema(source)
  assert.equal(JSON.stringify(source), before)
  assert.deepEqual(compact.properties.category.enum, ['일', '독서'])
  assert.deepEqual(compact.required, source.required)
  assert.equal(compact.properties.count.minimum, undefined)
  assert.match(compact.properties.count.description, /minimum.*1/)
  assert.match(compact.properties.steps.description, /minItems.*2/)
  assert.equal(compact.properties.steps.items.minLength, undefined)
})

test('large grammars retain their FULL original schema and explicitly defer strict validation to Onju', () => {
  const parameters = { type: 'object', properties: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`field${i}`, { type: 'string', description: 'x'.repeat(80), enum: ['a', 'b'] }])), additionalProperties: false }
  const native = toAnthropicMessagesRequest({ ...request, tools: [{ ...request.tools[0], parameters }] })
  assert.equal(native.tools[0].strict, false)
  assert.deepEqual(native.tools[0].input_schema, parameters)
  assert.equal(Object.keys(native.tools[0].input_schema.properties).length, 100)
})

test('real tool responses round-trip to Claude with matched call IDs', () => {
  const normalized = fromAnthropicMessagesResponse(raw)
  const next = toAnthropicMessagesRequest({ ...request, input: [...request.input, ...normalized.output, { type: 'function_call_output', call_id: 'tool_1', output: '{"ok":true}' }] })
  assert.equal(next.messages[1].content[0].type, 'tool_use')
  assert.equal(next.messages[2].content[0].tool_use_id, 'tool_1')
})

test('Claude usage includes ordinary, read-cache and write-cache input exactly once', () => {
  const normalized = fromAnthropicMessagesResponse(raw)
  assert.equal(normalized.usage.input_tokens, 350)
  assert.deepEqual(normalized.usage.input_tokens_details, { cached_tokens: 200, cache_write_tokens: 50 })
  const cost = estimateObservedCost(normalized, request)
  assert.equal(cost, 848)
  assert.equal(estimateTokenCost(request.model, normalized.usage).estimatedCostUsdMicros, cost)
  assert.ok(estimateAiReservationMicroUsd(request) > cost)
})

test('missing usage is never fabricated as zero; incomplete responses expose no partial tools', () => {
  assert.throws(() => fromAnthropicMessagesResponse({ ...raw, usage: {} }), /usage_missing/)
  const incomplete = fromAnthropicMessagesResponse({ ...raw, stop_reason: 'max_tokens' })
  assert.equal(incomplete.status, 'incomplete')
  assert.deepEqual(incomplete.output, [])
  assert.ok(estimateObservedCost(incomplete, request) > 0)
})

test('unsupported search, chained state, orphan and repeated tool results fail before dispatch', async () => {
  let calls = 0
  const adapter = createAnthropicMessagesAdapter({ apiKey: 'test', fetcher: async () => { calls++; throw Error('unexpected') } })
  await assert.rejects(adapter.generate({ ...request, tools: [{ type: 'web_search_preview' }] }), /unsupported_tool/)
  await assert.rejects(adapter.generate({ ...request, previous_response_id: 'resp_1' }), /stateless_history_required/)
  await assert.rejects(adapter.generate({ ...request, model: 'claude-sonnet-5-5' }), /unsupported_coaching_model/)
  const orphan = { type: 'function_call_output', call_id: 'missing', output: '{}' }
  assert.throws(() => toAnthropicMessagesRequest({ ...request, input: [...request.input, orphan] }), /unmatched_tool_result/)
  const call = fromAnthropicMessagesResponse(raw).output[0]
  const result = { type: 'function_call_output', call_id: 'tool_1', output: '{}' }
  assert.throws(() => toAnthropicMessagesRequest({ ...request, input: [...request.input, call, result, result] }), /unmatched_tool_result/)
  assert.equal(calls, 0)
})

test('HTTP transport uses Anthropic headers and returns only normalized data', async () => {
  let captured
  const adapter = createAnthropicMessagesAdapter({ apiKey: 'private-key', fetcher: async (url, init) => {
    captured = { url, init }; return new Response(JSON.stringify(raw), { headers: { 'request-id': 'req_1' } })
  } })
  const response = await adapter.generate(request)
  assert.equal(captured.url, 'https://api.anthropic.com/v1/messages')
  assert.equal(captured.init.headers['x-api-key'], 'private-key')
  assert.equal(captured.init.headers['anthropic-version'], '2023-06-01')
  assert.equal(response.provider, 'anthropic')
  assert.equal(response.data.output[0].name, 'respond')
  assert.doesNotMatch(JSON.stringify(response), /private-key/)
})

test('HTTP errors and lost body do not leak key or provider error text', async () => {
  const adapter = createAnthropicMessagesAdapter({ apiKey: 'private-key', fetcher: async () => new Response(JSON.stringify({ error: { type: 'authentication_error', message: 'private-key' } }), { status: 401 }) })
  const result = await adapter.generate(request)
  assert.equal(result.errorCode, 'authentication_error')
  assert.equal(result.data, undefined)
  assert.doesNotMatch(JSON.stringify(result), /private-key/)
  const broken = createAnthropicMessagesAdapter({ apiKey: 'private-key', fetcher: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => { throw Error('private-key') } }) })
  await assert.rejects(broken.generate(request), error => error instanceof LlmProviderTransportError && error.provider === 'anthropic' && error.diagnostic.phase === 'body' && !JSON.stringify(error).includes('private-key'))
})

test('Claude is default, missing key never falls back to OpenAI, and rollback is explicit', () => {
  const defaults = createCoachProvider(name => ({ ANTHROPIC_API_KEY: 'test' })[name], 'gpt-4.1')
  assert.equal(defaults.gateway.provider, 'anthropic')
  assert.throws(()=>createCoachProvider(name=>({OPENAI_API_KEY:'test'})[name],'gpt-4.1'),/missing_anthropic_api_key/)
  const rollback=createCoachProvider(name=>({ONJU_AGENT_PROVIDER:'openai',OPENAI_API_KEY:'test'})[name],'gpt-4.1')
  assert.equal(rollback.gateway.provider,'openai')
  const claude = createCoachProvider(name => ({ ONJU_AGENT_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test' })[name], 'gpt-4.1')
  assert.equal(claude.gateway.provider, 'anthropic')
  assert.equal(claude.model, request.model)
  assert.equal(claude.fastModel, claude.model)
  assert.equal(claude.fallbackModel, claude.model)
  assert.throws(() => createCoachProvider(name => ({ ONJU_AGENT_PROVIDER: 'anthropic', ONJU_CLAUDE_MODEL: 'unknown' })[name], 'gpt-4.1'), /ai_price_unavailable/)
})

test('Claude adapter, configuration and prices match both Onju source trees', () => {
  for (const name of ['anthropicMessagesAdapter.ts', 'anthropicPricing.ts', 'coachProvider.ts']) {
    const root = readFileSync(new URL('../../supabase/functions/_shared/' + name, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
    const site = readFileSync(new URL('../../logs/sites/onju-web-mvp/supabase/functions/_shared/' + name, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
    assert.equal(site, root, name)
  }
})

test('plan JSON uses a forced result tool and normalizes to validated output text',async()=>{
  const planned={model:request.model,max_output_tokens:6500,input:'synthetic plan',text:{format:{type:'json_schema',schema:{type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',items:{type:'string'}}}}}}}
  const adapter=createAnthropicMessagesAdapter({apiKey:'test',fetcher:async(url,init)=>{
    assert.equal(String(url),'https://api.anthropic.com/v1/messages')
    const body=JSON.parse(init.body)
    assert.equal(body.tool_choice.name,'onju_structured_result')
    assert.equal(body.tools[0].strict,false)
    assert.equal(body.output_config,undefined)
    return new Response(JSON.stringify({id:'msg_plan',model:request.model,stop_reason:'tool_use',usage:{input_tokens:10,output_tokens:4},content:[{type:'tool_use',id:'result',name:'onju_structured_result',input:{items:['Read']}}]}),{status:200})
  }})
  const result=await adapter.generate(planned)
  assert.equal(result.data.status,'completed')
  assert.deepEqual(JSON.parse(result.data.output[0].content[0].text),{items:['Read']})
  assert.equal(result.data.usage.output_tokens,4)
})


test('capacity repair preserves fixed-day summaries with variable weekends and ambiguous quotes',()=>{
  const capacity={summary:'평일 화·목 저녁 각 20분, 주말은 약속 유동',evidence:'평일 화요일과 목요일 저녁에 20분씩 가능해. 주말에는 약속이 자주 바뀌어.',status:'known'}
  assert.deepEqual(normalizeAnthropicCoachTool('record_goal_brief',{capacity}).input.capacity,capacity)
  const computed={...capacity,summary:'주 2회 × 20분 = 주 40분'}
  const fixed=normalizeAnthropicCoachTool('record_goal_brief',{capacity:computed}).input.capacity
  assert.equal(fixed.summary,'평일 화요일과 목요일 저녁에 20분씩 가능해')
  assert.equal(fixed.evidence,capacity.evidence)
  const ambiguous={...computed,evidence:'화요일 20분 가능해. 목요일 10분 가능해.'}
  assert.deepEqual(normalizeAnthropicCoachTool('record_goal_brief',{capacity:ambiguous}).input.capacity,ambiguous)
})

test('valid embedded arrays and escaped question newlines decode without guessing malformed JSON',()=>{
  const reply={paragraphs:JSON.stringify(['가능한 방법을 함께 골라요.']),bullets:'[]',choices:'[]',question:'수준은 어떤가요?\\n시간은 얼마나 있나요?'}
  const fixed=normalizeAnthropicCoachTool('respond',reply)
  assert.equal(fixed.input.question,'수준은 어떤가요?\n시간은 얼마나 있나요?')
  assert.ok(formatReply(fixed.input).text.includes('시간은 얼마나 있나요?'))
  assert.ok(fixed.repairs.includes('json_array_decoding'))
  const invalid={...reply,paragraphs:'["CSV "매출" 파일"]'}
  const kept=normalizeAnthropicCoachTool('respond',invalid).input
  assert.equal(kept.paragraphs,invalid.paragraphs)
  assert.throws(()=>formatReply(kept),/reply_paragraphs_must_be_array/)
})


test('oversized paragraphs retain the existing rejection with an actionable field and bound',()=>{
  const reply={paragraphs:['x'.repeat(901)],bullets:[],question:'',choices:[]}
  assert.throws(()=>formatReply(reply),/reply_needs_natural_sections_and_optional_question: paragraphs\[0\]: 901 chars; maximum 900/)
  assert.ok(formatReply({...reply,paragraphs:['x'.repeat(900)]}).text)
})
