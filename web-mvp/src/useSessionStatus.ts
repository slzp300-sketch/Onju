import { useSyncExternalStore } from 'react'
import { getAgentSessionId, sessionControlState, SESSION_CONTROL_EVENT } from './agentSession'

function subscribe(listener: () => void) {
  window.addEventListener(SESSION_CONTROL_EVENT, listener)
  window.addEventListener('storage', listener)
  window.addEventListener('focus', listener)
  return () => {
    window.removeEventListener(SESSION_CONTROL_EVENT, listener)
    window.removeEventListener('storage', listener)
    window.removeEventListener('focus', listener)
  }
}
export function useSessionStatus(sessionId: string) {
  return useSyncExternalStore(subscribe, () => getAgentSessionId() === sessionId ? sessionControlState(sessionId) : 'changed', () => 'active')
}

