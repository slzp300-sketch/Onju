// A UUID identifies a session; only its independently generated token owns it.
import { loadRegionalContext } from './regionalContext.ts'
const idKey = 'onju-web-mvp-session-id'
const tokenKey = 'onju-web-mvp-session-token'
const pairKey = 'onju-web-mvp-session-v2'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const token = /^[A-Za-z0-9_-]{32,128}$/
type Session = { id: string; token: string; legacy?: boolean }
let volatileSession: Session | undefined
const paused = new Set<string>()
const validPair = (value: unknown): value is Session => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Session>
  return uuid.test(candidate.id ?? '') && token.test(candidate.token ?? '')
}
const fresh = (): Session => ({
  id: crypto.randomUUID(),
  legacy: false,
  token: [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join(''),
})
function storePair(session: Session) {
  try {
    // The pair is authoritative; separate legacy keys are compatibility mirrors.
    localStorage.setItem(pairKey, JSON.stringify(session))
    localStorage.setItem(idKey, session.id)
    localStorage.setItem(tokenKey, session.token)
    volatileSession = undefined
  } catch { volatileSession = session }
  return session
}
function readPair(): Session {
  if (volatileSession) return volatileSession
  try {
    const raw = localStorage.getItem(pairKey)
    if (raw) {
      try {
        const parsed: unknown = JSON.parse(raw)
        if (validPair(parsed)) return parsed
      } catch { /* Do not replace or claim a damaged session. */ }
      const id = localStorage.getItem(idKey)
      if (id && uuid.test(id)) return { id, token: '' }
      return volatileSession = { id: crypto.randomUUID(), token: '' }
    }
    const id = localStorage.getItem(idKey), savedToken = localStorage.getItem(tokenKey)
    if (id) {
      if (!uuid.test(id)) return volatileSession = { id: crypto.randomUUID(), token: '' }
      // Never manufacture a token for an existing UUID without proof of ownership.
      return savedToken && token.test(savedToken) ? storePair({ id, token: savedToken, legacy: true }) : { id, token: '', legacy: true }
    }
    return storePair(fresh())
  } catch (error) {
    if (error instanceof Error && error.message === 'session_recovery_required') throw error
    volatileSession ??= fresh()
    return volatileSession
  }
}
export function getAgentSessionId() { return readPair().id }
export function getAgentSessionToken() {
  const session = readPair()
  if (!token.test(session.token)) throw new Error('session_recovery_required')
  return session.token
}
export function resetAgentSession() { return storePair(fresh()).id }
export function clearAgentSession() {
  const current = readPair()
  paused.add(current.id)
  try {
    localStorage.removeItem(pairKey)
    localStorage.removeItem(idKey)
    localStorage.removeItem(tokenKey)
  } finally { volatileSession = undefined }
}
export const SESSION_CONTROL_EVENT = 'onju:session-control'
export function sessionControlState(sessionId: string): 'active' | 'deleting' | 'deleted' {
  try {
    const state = localStorage.getItem(`onju-session-control:${sessionId}`)
    if (state === 'deleting' || state === 'deleted') return state
  } catch { /* The current tab still uses its in-memory lock. */ }
  return paused.has(sessionId) ? 'deleting' : 'active'
}
export function pauseAgentSession(sessionId: string) {
  paused.add(sessionId)
  // Persist before making the deletion request so reloads and other tabs stop writes.
  localStorage.setItem(`onju-session-control:${sessionId}`, 'deleting')
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_CONTROL_EVENT))
}
export function readSessionLocalState(key: string, sessionId: string) {
  try {
  const current = readPair()
  if (current.id !== sessionId || sessionControlState(sessionId) !== 'active') return null
  const saved = localStorage.getItem(`${key}:${sessionId}`)
  if (saved) return saved
  const legacyOwner = localStorage.getItem(`${key}:legacy-owner`)
  if (legacyOwner === sessionId || (!legacyOwner && current.legacy !== false)) {
    const legacyValue = localStorage.getItem(key)
    if (legacyValue) {
      localStorage.setItem(`${key}:legacy-owner`, sessionId)
      localStorage.setItem(`${key}:${sessionId}`, legacyValue)
      return legacyValue
    }
  }
  return null
  } catch { return null }
}
export function writeSessionLocalState(key: string, sessionId: string, value: string) {
  if (readPair().id !== sessionId || sessionControlState(sessionId) !== 'active') return
  localStorage.setItem(`${key}:${sessionId}`, value)
}
export function withAgentSession(sessionId: string, body: Record<string, unknown> = {}, allowPaused = false) {
  const current = readPair()
  if (current.id !== sessionId) throw new Error('session_changed')
  if (!token.test(current.token)) throw new Error('session_recovery_required')
  if (sessionControlState(sessionId) !== 'active' && !allowPaused) throw new Error('session_revoked')
  // Caller-supplied identity fields cannot override the verified pair.
  return { ...body, regionalContext: body.regionalContext ?? loadRegionalContext(), sessionId: current.id, sessionToken: current.token }
}

export function sessionFailureMessage(code: string, locale = 'ko-KR') {
  const en = locale.toLowerCase().startsWith('en')
  if (code === 'ai_request_in_progress') return en
    ? 'The same request is still processing. Your input is kept. Wait briefly before retrying.'
    : '같은 요청을 아직 처리 중이에요. 입력은 보존했어요. 잠시 기다린 뒤 다시 확인해 주세요.'
  if (code === 'ai_outcome_unknown') return en
    ? 'We could not confirm the previous request outcome. Your input is kept. Automatic retries are paused to avoid another charge; contact support if no reply appears.'
    : '이전 요청의 처리 결과를 확인하지 못했어요. 입력은 보존했어요. 중복 비용을 막기 위해 자동 재호출을 멈췄어요. 답변이 나타나지 않으면 문의해 주세요.'
  if (['public_budget_exhausted', 'evaluation_budget_exhausted', 'session_budget_exhausted'].includes(code)) return en
    ? 'The daily AI usage allowance has been reached. Your input is kept. Check after the service daily reset at 15:00 UTC (midnight Korea time).'
    : '오늘의 AI 사용 한도에 도달했어요. 입력은 보존했어요. 한국시간 자정 이후 다시 확인해 주세요.'
  if (code === 'rate_limited') return en
    ? 'The request limit has been reached. Your input is kept. Wait a minute; if it persists, check after the daily reset.'
    : '요청 횟수 한도에 도달했어요. 입력은 보존했어요. 1분 뒤에도 같다면 일일 한도 초기화 후 확인해 주세요.'
  if (code === 'ai_provider_deferred') return en
    ? 'The AI provider needs a longer wait. Your input is kept. Automatic retries are paused; please check again later.'
    : 'AI 제공사에서 더 긴 대기를 요청했어요. 입력은 보존했어요. 자동 재시도를 멈췄으니 잠시 후 다시 확인해 주세요.'
  if (code === 'ai_request_changed') return en
    ? 'This request ID already belongs to different input. Your input is kept. Reload before sending a new message.'
    : '같은 요청 번호에 다른 내용이 들어왔어요. 입력은 보존했어요. 새로고침한 뒤 새 메시지로 보내 주세요.'
  if (['ai_cost_store_unavailable','ai_cost_context_missing','ai_budget_config_invalid','ai_price_unavailable','ai_provider_action_required'].includes(code)) return en
    ? 'AI usage could not be safely verified. Your input is kept. Please try again later or contact support.'
    : 'AI 사용량을 안전하게 확인할 수 없어 요청을 멈췄어요. 입력은 보존했어요. 잠시 후에도 같다면 문의해 주세요.'
  if (code === 'response_not_owned') return en
    ? 'The previous reply could not be linked to this conversation. Your input is kept. Start a new conversation to continue safely.'
    : '이전 답변이 현재 대화에 속하는지 확인하지 못했어요. 입력은 보존했어요. 새 대화로 안전하게 이어가 주세요.'
  if (['session_recovery_required','invalid_session_token','session_forbidden'].includes(code)) return en
    ? 'This session could not be verified. Your input is kept. Use the original browser or start a new conversation.'
    : '이 대화의 소유자를 확인하지 못했어요. 입력은 보존했어요. 원래 사용하던 브라우저에서 열거나 새 대화를 시작해 주세요.'
  if (['session_expired','session_revoked','session_not_found'].includes(code)) return en
    ? 'This session has expired or been deleted. Your input is kept; start a new conversation to continue.'
    : '만료되거나 삭제된 대화예요. 입력은 보존했어요. 새 대화로 이어가 주세요.'
  if (code === 'session_changed') return en
    ? 'The active session changed in another tab. Your input is kept; reload before continuing.'
    : '다른 탭에서 대화가 변경됐어요. 입력은 보존했어요. 새로고침 후 이어가 주세요.'
  return ''
}
