const tokenPattern = /^[A-Za-z0-9_-]{32,128}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
type DatabaseClient = {
  rpc: (name: string, params: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>
}

const accessStatus: Record<string, number> = {
  invalid_session: 400, invalid_session_token: 400, session_forbidden: 403,
  session_recovery_required: 403, session_expired: 410, session_revoked: 410,
  session_not_found: 404, session_changed: 409, response_not_owned: 403,
  ai_request_in_progress: 409, ai_request_changed: 409, ai_outcome_unknown: 409,
  public_budget_exhausted: 429, evaluation_budget_exhausted: 429,
  session_budget_exhausted: 429, rate_limited: 429,
  ai_cost_store_unavailable: 503, ai_cost_context_missing: 503,
  ai_budget_config_invalid: 503, ai_price_unavailable: 503, ai_provider_action_required: 503,
  ai_provider_deferred: 429,
  export_unavailable: 503, export_schema_changed: 503, export_too_large: 413,
}
export function sessionAccessFailure(error: unknown): { code: string; status: number } | null {
  const code = typeof error === 'string' ? error
    : error && typeof error === 'object' && 'message' in error ? String(error.message) : ''
  return Object.hasOwn(accessStatus, code) ? { code, status: accessStatus[code] } : null
}
export function sessionAccessResponse(error: unknown, headers: Record<string, string>) {
  const failure = sessionAccessFailure(error)
  return failure ? new Response(JSON.stringify({ error: failure.code }), {
    status: failure.status, headers: { ...headers, 'Content-Type': 'application/json' },
  }) : null
}
export function validSessionToken(value: unknown): value is string {
  return typeof value === 'string' && tokenPattern.test(value)
}
export async function sha256(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
async function checkedHash(sessionId: string, sessionToken: unknown) {
  if (!uuidPattern.test(sessionId)) throw new Error('invalid_session')
  if (!validSessionToken(sessionToken)) throw new Error('invalid_session_token')
  return sha256(sessionToken)
}
export async function claimWebMvpSession(db: DatabaseClient, sessionId: string, sessionToken: unknown) {
  const tokenHash = await checkedHash(sessionId, sessionToken)
  // DB owns atomic creation, ownership, expiry and revocation decisions.
  // Never fall back to UUID-only access when the RPC is missing or fails.
  const { data, error } = await db.rpc('web_mvp_authorize_session', {
    p_session_id: sessionId, p_token_hash: tokenHash,
  })
  if (error) throw error
  if (data !== 'authorized' && data !== 'created') {
    throw new Error(sessionAccessFailure(data)?.code ?? 'session_authorization_failed')
  }
  return tokenHash
}
export async function deleteOwnedWebMvpSession(db: DatabaseClient, sessionId: string, sessionToken: unknown) {
  const tokenHash = await checkedHash(sessionId, sessionToken)
  const { data, error } = await db.rpc('web_mvp_delete_owned_session', {
    p_session_id: sessionId, p_token_hash: tokenHash,
  })
  if (error) throw error
  if (data !== 'deleted') throw new Error(sessionAccessFailure(data)?.code ?? 'session_deletion_failed')
  return tokenHash
}

export function trustedRequestAddress(req: Request, header: string | undefined) {
  // Configure ONLY after ingress is verified to overwrite this header and direct
  // access is blocked. Never trust a browser's first X-Forwarded-For entry.
  if (!header) return null
  if (!['cf-connecting-ip', 'x-real-ip'].includes(header)) throw new Error('ai_budget_config_invalid')
  const value = req.headers.get(header)?.trim()
  if (!value || value.length > 45 || !/^[0-9a-f:.]+$/i.test(value)) throw new Error('ai_budget_config_invalid')
  return value
}

export async function enforceWebMvpRateLimits(
  db: DatabaseClient,
  req: Request,
  tokenHash: string,
  limits: { scope: string; minute: number; day: number },
) {
  const address = trustedRequestAddress(req, Deno.env.get('ONJU_TRUSTED_CLIENT_IP_HEADER'))
  const salt = Deno.env.get('ONJU_RATE_LIMIT_SALT')
  if (address && (!salt || salt.length < 32)) throw new Error('ai_budget_config_invalid')
  const now = new Date().toISOString()
  const buckets: [string, number, number][] = [
    [`session:${limits.scope}:minute:${tokenHash}`, 60, limits.minute],
    [`session:${limits.scope}:day:${tokenHash}`, 86400, limits.day],
  ]
  if (address) {
    const addressHash = await sha256(`${salt}:${address}`)
    buckets.push([`address:${limits.scope}:minute:${addressHash}`, 60, limits.minute * 3],
      [`address:${limits.scope}:day:${addressHash}`, 86400, limits.day * 3])
  }
  for (const [bucketKey, windowSeconds, limit] of buckets) {
    const { data, error } = await db.rpc('web_mvp_consume_rate_limit', {
      p_bucket_key: bucketKey,
      p_now: now,
      p_window_seconds: windowSeconds,
      p_limit: limit,
    })
    if (error) throw error
    if (data !== true) throw new Error('rate_limited')
  }
}
