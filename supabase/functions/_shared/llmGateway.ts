export type LlmRequest = Record<string, unknown>

export type LlmResponseData = Record<string, unknown>

export type LlmResponseHeaders = {
  get: (name: string) => string | null
}

export type LlmProviderDiagnostic = {
  kind: 'timeout' | 'cancelled' | 'network' | 'invalid_json' | 'http' | 'incomplete' | 'unknown'
  phase: 'request' | 'body' | 'response'
  requestId?: string
  providerRequestId?: string
  status?: number
  elapsedMs?: number
  timeoutMs?: number
}

// Never serialize a provider exception or raw response body into operational
// logs. Only identifiers, bounded timings and fixed diagnostic enums may leave.
export function safeProviderDiagnostic(value: LlmProviderDiagnostic): LlmProviderDiagnostic {
  const id = (v: unknown) => typeof v === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(v) ? v : undefined
  const ms = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= 3_600_000 ? v : undefined
  return {
    kind: ['timeout','cancelled','network','invalid_json','http','incomplete','unknown'].includes(value.kind) ? value.kind : 'unknown',
    phase: ['request','body','response'].includes(value.phase) ? value.phase : 'response',
    requestId: id(value.requestId), providerRequestId: id(value.providerRequestId),
    status: Number.isInteger(value.status) && value.status! >= 100 && value.status! <= 599 ? value.status : undefined,
    elapsedMs: ms(value.elapsedMs), timeoutMs: ms(value.timeoutMs),
  }
}

export type LlmProviderResponse = {
  provider: string
  requestId: string
  ok: boolean
  status: number
  headers: LlmResponseHeaders
  data?: LlmResponseData
  errorCode?: string
  diagnostic?: LlmProviderDiagnostic
}

export type LlmProviderAdapter = {
  readonly id: string
  generate: (request: LlmRequest) => Promise<LlmProviderResponse>
}

export type LlmGateway = {
  readonly provider: string
  generate: (request: LlmRequest) => Promise<LlmProviderResponse>
}

export class LlmProviderTransportError extends Error {
  readonly provider: string
  readonly cause: unknown
  readonly diagnostic: LlmProviderDiagnostic

  constructor(provider: string, cause: unknown, diagnostic: LlmProviderDiagnostic = {kind:'unknown',phase:'request'}) {
    super('llm_provider_transport_failed')
    this.name = 'LlmProviderTransportError'
    this.provider = provider
    this.cause = cause
    Object.defineProperty(this, 'cause', { enumerable: false })
    this.diagnostic = safeProviderDiagnostic(diagnostic)
  }
}

const providerIdPattern = /^[a-z][a-z0-9_]{1,31}$/

const assertProviderId = (provider: string) => {
  if (!providerIdPattern.test(provider)) throw new Error('invalid_llm_provider')
}

export function createLlmGateway(adapter: LlmProviderAdapter): LlmGateway {
  assertProviderId(adapter.id)
  return {
    provider: adapter.id,
    async generate(request) {
      const response = await adapter.generate(request)
      if (response.provider !== adapter.id) throw new Error('llm_provider_mismatch')
      return response
    },
  }
}

export const providerStatusCode = (response: Pick<LlmProviderResponse, 'provider' | 'status'>) => {
  assertProviderId(response.provider)
  if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) throw new Error('invalid_llm_provider_status')
  return `${response.provider}_${response.status}`
}

export const providerUnavailableCode = (provider: string) => {
  assertProviderId(provider)
  return `${provider}_503`
}

export const isLlmProviderStatusCode = (value: string) => /^[a-z][a-z0-9_]{1,31}_\d{3}$/.test(value)
