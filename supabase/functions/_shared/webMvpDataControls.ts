import { sha256, validSessionToken, sessionAccessFailure } from './webMvpAccess.ts'

type ExportDatabase = { rpc: (name: string, parameters: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> }

// Machine secrets/pointers are omitted; arbitrary user text remains unchanged.
function redactAccess(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAccess)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/^(?:access_token_hash|sessionToken|session_token|token|token_hash|api[_-]?key|authorization|response_id|responseId|previousResponseId|.*_response_id|call_key|payload_hash)$/i.test(key))
    .map(([key, nested]) => [key, redactAccess(nested)]))
}

export async function exportOwnedWebMvpSession(db: ExportDatabase, sessionId: string, token: unknown) {
  if (!validSessionToken(token)) throw new Error('invalid_session_token')
  const { data, error } = await db.rpc('web_mvp_export_owned_session', { p_session_id: sessionId, p_token_hash: await sha256(token) })
  if (error) throw new Error('export_unavailable')
  const snapshot = data as { error?: string; sessionId?: string; version?: number; session?: unknown; collections?: unknown } | null
  if (snapshot?.error) throw new Error(sessionAccessFailure(snapshot.error)?.code ?? snapshot.error)
  if (snapshot?.version !== 1 || snapshot.sessionId !== sessionId || !snapshot.session || !snapshot.collections) throw new Error('export_unavailable')
  return redactAccess(snapshot)
}
