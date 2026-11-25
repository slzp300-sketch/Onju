import { getAgentSessionId, SESSION_CONTROL_EVENT } from './agentSession.ts'
import { loadRegionalContext } from './regionalContext.ts'

const localKeys = ['onju-web-alpha', 'onju-week-map', 'onju-chat-input']
const outboxKey = 'onju-web-mvp-telemetry-outbox-v1'
const enrollmentKey = 'onju-public-beta-enrollment-v1'
const parse = (raw: string | null): unknown => {
  if (raw === null) return null
  try { return JSON.parse(raw) } catch { return raw }
}

// Strip machine credentials/pointers, never alter message string contents.
export function withoutAccessSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutAccessSecrets)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !/^(?:access_token_hash|sessionToken|session_token|token|token_hash|api[_-]?key|authorization|response_id|responseId|previousResponseId|.*_response_id|call_key|payload_hash)$/i.test(key))
    .map(([key, nested]) => [key, withoutAccessSecrets(nested)]))
}

function ownedLegacy(key: string, sessionId: string) {
  const owner = localStorage.getItem(key + ':legacy-owner')
  if (owner) return owner === sessionId
  const pair = parse(localStorage.getItem('onju-web-mvp-session-v2')) as {id?: string; legacy?: boolean} | null
  return pair?.id === sessionId && pair.legacy === true
}

export function readLocalSessionData(sessionId: string) {
  if (getAgentSessionId() !== sessionId) throw new Error('session_changed')
  const conversation: Record<string, unknown> = {}
  for (const key of localKeys) {
    const raw = localStorage.getItem(key + ':' + sessionId)
      ?? (ownedLegacy(key, sessionId) ? localStorage.getItem(key) : null)
    if (raw !== null) conversation[key] = key === 'onju-chat-input' ? raw : parse(raw)
  }
  const outbox = parse(localStorage.getItem(outboxKey))
  const pendingEvents = Array.isArray(outbox)
    ? outbox.filter(event => event && typeof event === 'object' && event.sessionId === sessionId) : []
  const deliveries = parse(localStorage.getItem('onju-reminder-deliveries-v1'))
  const reminderDeliveries = Array.isArray(deliveries) ? deliveries.filter(item => typeof item === 'string' && item.startsWith(sessionId + ':')) : []
  return withoutAccessSecrets({ conversation, pendingEvents, reminderDeliveries, regionalPreferences: loadRegionalContext() })
}

export function completeLocalSessionDeletion(sessionId: string) {
  // This marker is written only after a confirmed server deletion. Credentials stay
  // until Start new conversation, permitting idempotent retry after partial cleanup.
  for (const key of localKeys) {
    localStorage.removeItem(key + ':' + sessionId)
    if (ownedLegacy(key, sessionId)) {
      localStorage.removeItem(key)
      localStorage.removeItem(key + ':legacy-owner')
    }
  }
  const outbox = parse(localStorage.getItem(outboxKey))
  if (Array.isArray(outbox)) {
    localStorage.setItem(outboxKey, JSON.stringify(outbox.filter(event => event?.sessionId !== sessionId)))
  } else if (outbox !== null) throw new Error('local_cleanup_incomplete')
  const enrollment = parse(localStorage.getItem(enrollmentKey))
  if (enrollment && typeof enrollment === 'object' && 'sessionId' in enrollment && enrollment.sessionId === sessionId) {
    localStorage.removeItem(enrollmentKey)
  }
  const deliveries = parse(localStorage.getItem('onju-reminder-deliveries-v1'))
  if (Array.isArray(deliveries)) {
    localStorage.setItem('onju-reminder-deliveries-v1', JSON.stringify(deliveries.filter(item => typeof item !== 'string' || !item.startsWith(sessionId + ':'))))
  } else if (deliveries !== null) throw new Error('local_cleanup_incomplete')
  localStorage.setItem('onju-session-control:' + sessionId, 'deleted')
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_CONTROL_EVENT))
}

export function sessionExportFile(sessionId: string, local: unknown, server: unknown | null) {
  return {
    format: 'onju-session-export', version: 1, exportedAt: new Date().toISOString(),
    sessionId, scope: server ? 'server-and-this-browser' : 'this-browser-only',
    server: withoutAccessSecrets(server), local: withoutAccessSecrets(local),
    exclusions: ['Access credentials', 'Provider response caches and internal traces', 'External provider records, backups and operational logs', 'Other browsers and other sessions'],
  }
}
