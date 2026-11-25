import { LlmProviderTransportError, safeProviderDiagnostic, type LlmProviderAdapter, type LlmProviderDiagnostic, type LlmRequest, type LlmResponseData } from './llmGateway.ts'

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

type OpenAiResponsesAdapterOptions = {
  apiKey: string
  timeoutMs?: number | ((request: LlmRequest) => number)
  fetcher?: Fetcher
  createRequestId?: () => string
}

const responsesUrl = 'https://api.openai.com/v1/responses'

export function createOpenAiResponsesAdapter(options: OpenAiResponsesAdapterOptions): LlmProviderAdapter {
  if (!options.apiKey) throw new Error('missing_openai_api_key')
  const fetcher = options.fetcher ?? fetch
  const createRequestId = options.createRequestId ?? (() => crypto.randomUUID())

  return {
    id: 'openai',
    async generate(request: LlmRequest) {
      const requestId = createRequestId()
      const timeoutMs = typeof options.timeoutMs === 'function' ? options.timeoutMs(request) : options.timeoutMs ?? 45_000
      if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) throw new Error('invalid_provider_timeout')
      const startedAt = Date.now()
      const signal = AbortSignal.timeout(timeoutMs)
      let response: Response | undefined
      let phase: LlmProviderDiagnostic['phase'] = 'request'
      let data: LlmResponseData | undefined
      let errorCode: string | undefined
      try {
        response = await fetcher(responsesUrl, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
            'X-Client-Request-Id': requestId,
          },
          body: JSON.stringify(request),
          signal,
        })
        // Headers alone do not prove a complete response. Body reads belong to
        // the same timed transport and must not leak partial function calls.
        phase = 'body'
        if (response.ok) {
          const body: unknown = await response.json()
          if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SyntaxError('invalid_provider_response_object')
          data = body as LlmResponseData
        }
        else {
          const failure = await response.json().catch(() => undefined)
          errorCode = typeof failure?.error?.code === 'string' ? failure.error.code : undefined
        }
      } catch (cause) {
        const kind = signal.aborted || cause instanceof Error && cause.name === 'TimeoutError' ? 'timeout'
          : cause instanceof Error && cause.name === 'AbortError' ? 'cancelled'
            : cause instanceof SyntaxError ? 'invalid_json' : 'network'
        throw new LlmProviderTransportError('openai', cause, {kind, phase, requestId,
          providerRequestId: response?.headers.get('x-request-id') ?? undefined, status: response?.status,
          elapsedMs: Date.now() - startedAt, timeoutMs})
      }
      return {
        provider: 'openai',
        requestId,
        ok: response.ok,
        status: response.status,
        headers: response.headers,
        data,
        errorCode,
        ...(!response.ok || data?.status && data.status !== 'completed' ? {diagnostic: safeProviderDiagnostic({
          kind: !response.ok ? 'http' : 'incomplete', phase:'response', requestId,
          providerRequestId: response.headers.get('x-request-id') ?? undefined, status: response.status,
          elapsedMs: Date.now() - startedAt, timeoutMs,
        })} : {}),
      }
    },
  }
}
