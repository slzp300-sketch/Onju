import { LlmProviderTransportError, safeProviderDiagnostic, type LlmProviderAdapter, type LlmProviderDiagnostic, type LlmRequest, type LlmResponseData } from './llmGateway.ts'

type ObjectValue = Record<string, unknown>
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>
type Options = { apiKey: string; timeoutMs?: number | ((request: LlmRequest) => number); fetcher?: Fetcher; createRequestId?: () => string }
const object = (value: unknown): ObjectValue => value && typeof value === 'object' && !Array.isArray(value) ? value as ObjectValue : {}
const text = (value: unknown) => typeof value === 'string' ? value : ''
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const fail = (code: string): never => { throw new Error(`anthropic_${code}`) }

/** Lossless presentation/grounding compilation; never repairs numeric plans or evidence quotes. */
export function normalizeAnthropicCoachTool(name:string,value:unknown) {
  const input=structuredClone(object(value)),repairs:string[]=[]
  const reply=name==='respond'?input:name==='record_goal_brief'?object(input.reply):null
  if(reply) {
    for(const key of ['paragraphs','bullets','choices']) {
      if(typeof reply[key]!=='string')continue
      try {
        const parsed=JSON.parse(reply[key] as string)
        if(Array.isArray(parsed)&&parsed.every(item=>typeof item==='string')) {
          reply[key]=parsed;repairs.push('json_array_decoding')
        }
      } catch { /* Invalid embedded JSON remains invalid for Onju validation. */ }
    }
    if(typeof reply.question==='string'&&/(?:\\r)?\\n/.test(reply.question)) {
      reply.question=reply.question.replace(/(?:\\r)?\\n/g,'\n');repairs.push('question_newline_decoding')
    }
  }
  if(reply&&Array.isArray(reply.paragraphs)&&reply.paragraphs.every(p=>typeof p==='string')&&reply.question==='') {
    const questions=reply.paragraphs.filter(p=>/[?？]/.test(p))
    if(questions.length) {
      reply.paragraphs=reply.paragraphs.filter(p=>!/[?？]/.test(p))
      reply.question=questions.join('\n\n')
      repairs.push('question_field_placement')
    }
  }
  if(name==='record_goal_brief') {
    const capacity=object(input.capacity)
    // Only computed summaries need compilation. Preserve valid summaries that
    // distinguish fixed weekdays from unknown weekends. Keep evidence untouched.
    const computed=typeof capacity.summary==='string'&&/[×=*]|\d+\s*[xX]\s*\d+|(?:주|주당)\s*\d+\s*(?:분|회|번)/.test(capacity.summary)
    if(computed&&typeof capacity.evidence==='string') {
      const clauses=capacity.evidence.split(/[.!?。！？](?!\d)/).map(v=>v.trim()).filter(v=>/\d+\s*(?:분|시간|회|번)/.test(v))
      if(clauses.length===1&&clauses[0].length>=2&&clauses[0].length<=160&&!/미정|모르|유동|바뀌|불확실/.test(clauses[0])) {
        capacity.summary=clauses[0];repairs.push('capacity_summary_from_quote')
      }
    }
  }
  return {input,repairs}
}

/** Anthropic's documented strict-schema subset; original Onju validators stay authoritative. */
export function compactAnthropicSchema(value: unknown): ObjectValue {
  const schema = object(value), result: ObjectValue = {}, constraints: ObjectValue = {}
  const unsupported = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minLength', 'maxLength', 'maxItems', 'uniqueItems', 'pattern'])
  const formats = new Set(['date-time', 'time', 'date', 'duration', 'email', 'hostname', 'uri', 'ipv4', 'ipv6', 'uuid'])
  for (const [key, child] of Object.entries(schema)) {
    if (unsupported.has(key) || key === 'minItems' && child !== 0 && child !== 1 || key === 'format' && !formats.has(text(child))) {
      constraints[key] = child
      continue
    }
    if (['properties', '$defs', 'definitions'].includes(key)) result[key] = Object.fromEntries(Object.entries(object(child)).map(([name, field]) => [name, compactAnthropicSchema(field)]))
    else if (key === 'items') result[key] = compactAnthropicSchema(child)
    else if (['anyOf', 'allOf'].includes(key) && Array.isArray(child)) result[key] = child.map(compactAnthropicSchema)
    else if (key === 'oneOf' || key === '$ref' && /^https?:/.test(text(child))) fail('unsupported_strict_schema')
    else result[key] = child
  }
  if (schema.type === 'object' || Array.isArray(schema.type) && schema.type.includes('object')) {
    if (schema.additionalProperties !== undefined && schema.additionalProperties !== false) fail('unsupported_strict_schema')
    result.additionalProperties = false
  }
  if (Object.keys(constraints).length) result.description = [text(schema.description), `Onju validation constraints: ${JSON.stringify(constraints)}`].filter(Boolean).join('\n')
  return result
}

/** Translate the existing agent protocol; tools still run through Onju's validators. */
export function toAnthropicMessagesRequest(request: LlmRequest): ObjectValue {
  // Onju requires forced function calls. Newer 5.5 models reject that contract.
  if (request.model !== 'claude-sonnet-4-6') fail('unsupported_coaching_model')
  if (request.previous_response_id) fail('stateless_history_required')
  if (request.stream) fail('stream_not_supported')
  const maximum = request.max_output_tokens
  if (!integer(maximum) || maximum < 1 || maximum > 128000) fail('output_limit_required')
  const messages: { role: 'user' | 'assistant'; content: ObjectValue[] }[] = []
  const system: string[] = request.instructions ? [text(request.instructions)] : []
  const calls = new Set<string>()
  const resolved = new Set<string>()
  const append = (role: 'user' | 'assistant', block: ObjectValue) => {
    const last = messages.at(-1)
    if (last?.role === role) last.content.push(block)
    else messages.push({ role, content: [block] })
  }
  const input = typeof request.input === 'string' ? [{ role: 'user', content: request.input }] : request.input
  if (!Array.isArray(input)) fail('input_required')
  for (const raw of input as unknown[]) {
    const item = object(raw)
    if (item.type === 'function_call') {
      const id = text(item.call_id), name = text(item.name)
      if (!id || !name || calls.has(id)) fail('invalid_tool_call')
      let args: unknown = item.arguments
      if (typeof args === 'string') { try { args = JSON.parse(args) } catch { fail('invalid_tool_arguments') } }
      if (!args || typeof args !== 'object' || Array.isArray(args)) fail('invalid_tool_arguments')
      calls.add(id)
      append('assistant', { type: 'tool_use', id, name, input: args })
      continue
    }
    if (item.type === 'function_call_output') {
      const id = text(item.call_id)
      if (!calls.has(id) || resolved.has(id)) fail('unmatched_tool_result')
      resolved.add(id)
      append('user', { type: 'tool_result', tool_use_id: id, content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output ?? {}) })
      continue
    }
    if (item.type === 'reasoning') continue // No provider thinking is replayed across APIs.
    if (item.type && item.type !== 'message') fail('unsupported_input_item')
    const role = text(item.role)
    const parts = typeof item.content === 'string' ? [{ type: 'text', text: item.content }] : item.content
    if (!Array.isArray(parts)) fail('unsupported_content')
    for (const rawPart of parts as unknown[]) {
      const part = object(rawPart)
      if (!['text', 'input_text', 'output_text'].includes(text(part.type)) || typeof part.text !== 'string') fail('unsupported_content')
      if (role === 'system' || role === 'developer') system.push(part.text as string)
      else if (role === 'user' || role === 'assistant') append(role, { type: 'text', text: part.text })
      else fail('unsupported_role')
    }
  }
  if (!messages.length || messages[0].role !== 'user') fail('user_input_required')
  if (calls.size !== resolved.size) fail('missing_tool_result')
  // Anthropic requires tool results before ordinary text within the same user message.
  for (const message of messages) if (message.role === 'user') message.content.sort((a, b) => Number(b.type === 'tool_result') - Number(a.type === 'tool_result'))
  let strictSchemaBytes = 0
  const tools = Array.isArray(request.tools) ? request.tools.map(raw => {
    const tool = object(raw)
    if (tool.type !== 'function' || !text(tool.name)) fail('unsupported_tool')
    const schema = tool.strict === true ? compactAnthropicSchema(tool.parameters) : object(tool.parameters)
    const bytes = new TextEncoder().encode(JSON.stringify(schema)).length
    // Claude rejects Onju's combined large grammars. Preserve the full schema
    // and the existing authoritative validator for those tools; never truncate it.
    const nativeStrict = tool.strict === true && bytes <= 4000 && strictSchemaBytes + bytes <= 8000
    if (nativeStrict) strictSchemaBytes += bytes
    return { name: tool.name, description: text(tool.description),
      ...(typeof tool.strict === 'boolean' ? { strict: nativeStrict } : {}),
      input_schema: nativeStrict ? schema : object(tool.parameters) }
  }) : []
  const choice = request.tool_choice
  let toolChoice: ObjectValue | undefined
  if (choice !== undefined) {
    if (choice === 'required') toolChoice = { type: 'any' }
    else if (choice === 'auto' || choice === 'none') toolChoice = { type: choice }
    else if (object(choice).type === 'function' && text(object(choice).name)) toolChoice = { type: 'tool', name: object(choice).name }
    else fail('unsupported_tool_choice')
    if (!tools.length && choice !== 'none') fail('tool_choice_without_tools')
    if (toolChoice && toolChoice.type !== 'none' && request.parallel_tool_calls === false) toolChoice.disable_parallel_tool_use = true
  }
  const format = object(object(request.text).format)
  if (format.type && format.type !== 'text' && format.type !== 'json_schema') fail('unsupported_output_format')
  // Large plan schemas exceed native grammar compilation limits. Force a
  // schema-bearing result tool; existing domain validators remain authoritative.
  if(format.type==='json_schema') {
    if(tools.length)fail('mixed_structured_output_and_tools')
    tools.push({name:'onju_structured_result',description:'Return the requested structured result. All fields must follow this schema.',strict:false,input_schema:object(format.schema)})
    toolChoice={type:'tool',name:'onju_structured_result',disable_parallel_tool_use:true}
  }
  return {
    model: request.model, max_tokens: maximum, messages,
    ...(system.length ? { system: object(request.prompt_cache_options).mode==='anthropic_static_prefix'
      ? system.map((text,index)=>({type:'text',text,...(index===0?{cache_control:{type:'ephemeral'}}:{})}))
      : system.join('\n\n') } : {}),
    ...(tools.length ? { tools } : {}), ...(toolChoice ? { tool_choice: toolChoice } : {}),
    thinking: { type: 'disabled' },
  }
}

export function fromAnthropicMessagesResponse(raw: unknown): LlmResponseData {
  const response = object(raw), usage = object(response.usage)
  if (!text(response.id) || !/^claude-/.test(text(response.model)) || !Array.isArray(response.content)) fail('invalid_response')
  const cached = usage.cache_read_input_tokens ?? 0, written = usage.cache_creation_input_tokens ?? 0
  if (!integer(usage.input_tokens) || !integer(usage.output_tokens) || !integer(cached) || !integer(written)) fail('usage_missing')
  const complete = response.stop_reason === 'end_turn' || response.stop_reason === 'tool_use'
  const output = complete ? (response.content as unknown[]).map(rawPart => {
    const part = object(rawPart)
    if (part.type === 'tool_use') {
      if (!text(part.id) || !text(part.name) || !part.input || typeof part.input !== 'object' || Array.isArray(part.input)) fail('invalid_tool_response')
      return { type: 'function_call', call_id: part.id, name: part.name, arguments: JSON.stringify(part.input) }
    }
    if (part.type === 'text' && typeof part.text === 'string') return { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: part.text }] }
    return fail('unsupported_response_content')
  }) : []
  return {
    id: response.id, model: response.model, status: complete ? 'completed' : 'incomplete', output,
    usage: { input_tokens: (usage.input_tokens as number) + (cached as number) + (written as number), output_tokens: usage.output_tokens,
      input_tokens_details: { cached_tokens: cached, cache_write_tokens: written } },
    provider_metadata: { anthropic: { stop_reason: response.stop_reason } },
  }
}

export function createAnthropicMessagesAdapter(options: Options): LlmProviderAdapter {
  if (!options.apiKey?.trim()) throw new Error('missing_anthropic_api_key')
  const fetcher = options.fetcher ?? fetch
  return { id: 'anthropic', async generate(request) {
    // Validate before dispatch, so unsupported features cannot incur an API charge.
    const body = toAnthropicMessagesRequest(request)
    const timeoutMs = typeof options.timeoutMs === 'function' ? options.timeoutMs(request) : options.timeoutMs ?? 90_000
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('invalid_provider_timeout')
    const requestId = options.createRequestId?.() ?? crypto.randomUUID()
    const signal = AbortSignal.timeout(timeoutMs), startedAt = Date.now()
    let response: Response | undefined
    let phase: LlmProviderDiagnostic['phase'] = 'request'
    let data: LlmResponseData | undefined, errorCode: string | undefined
    try {
      response = await fetcher('https://api.anthropic.com/v1/messages', { method: 'POST',
        headers: { 'x-api-key': options.apiKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
        body: JSON.stringify(body), signal })
      phase = 'body'
      if (response.ok) {
        data = fromAnthropicMessagesResponse(await response.json())
        const presentationRepairs:string[]=[]
        if(Array.isArray(data.output))for(const raw of data.output){const call=object(raw);if(call.type==='function_call'&&['respond','record_goal_brief'].includes(text(call.name))&&typeof call.arguments==='string') {
          const normalized=normalizeAnthropicCoachTool(text(call.name),JSON.parse(call.arguments));call.arguments=JSON.stringify(normalized.input);presentationRepairs.push(...normalized.repairs)
        }}
        if(object(object(request.text).format).type==='json_schema') {
          const calls=Array.isArray(data.output)?data.output.map(object).filter(item=>item.type==='function_call'):[]
          const valid=data.status==='completed'&&calls.length===1&&calls[0].name==='onju_structured_result'
          data.output=valid?[{type:'message',role:'assistant',content:[{type:'output_text',text:calls[0].arguments}]}]:[]
          if(!valid)data.status='incomplete'
        }
        const metadata = object(object(data.provider_metadata).anthropic)
        const tools = Array.isArray(body.tools) ? body.tools.map(object) : []
        metadata.native_strict_tools = tools.filter(tool => tool.strict === true).map(tool => tool.name)
        metadata.server_validated_tools = tools.filter(tool => tool.strict !== true).map(tool => tool.name)
        metadata.presentation_repairs=presentationRepairs
      }
      else {
        const failure = object(await response.json().catch(() => null))
        const code = text(object(failure.error).type)
        if (/^[a-z_]{1,80}$/.test(code)) errorCode = code
      }
    } catch (cause) {
      const kind = signal.aborted ? 'timeout' : cause instanceof Error && cause.name === 'AbortError' ? 'cancelled' : cause instanceof SyntaxError ? 'invalid_json' : 'network'
      throw new LlmProviderTransportError('anthropic', cause, { kind, phase, requestId,
        providerRequestId: response?.headers.get('request-id') ?? undefined, status: response?.status,
        elapsedMs: Date.now() - startedAt, timeoutMs })
    }
    return { provider: 'anthropic', requestId, ok: response.ok, status: response.status, headers: response.headers, data, errorCode,
      ...(!response.ok || data?.status !== 'completed' ? { diagnostic: safeProviderDiagnostic({
        kind: response.ok ? 'incomplete' : 'http', phase: 'response', requestId, status: response.status,
        providerRequestId: response.headers.get('request-id') ?? undefined, elapsedMs: Date.now() - startedAt, timeoutMs,
      }) } : {}) }
  } }
}
