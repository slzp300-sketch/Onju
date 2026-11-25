import { useMemo, useSyncExternalStore } from 'react'
import { loadRegionalContext, regionalDateKey, REGIONAL_CHANGE_EVENT, REGIONAL_SETTINGS_KEY, saveRegionalContext, type UserRegionalContext } from './regionalContext'

function subscribe(listener: () => void) {
  const storage = (event: StorageEvent) => {
    if (!event.key || event.key === REGIONAL_SETTINGS_KEY || event.key === 'onju-regional-context-v1') listener()
  }
  window.addEventListener(REGIONAL_CHANGE_EVENT, listener)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(REGIONAL_CHANGE_EVENT, listener)
    window.removeEventListener('storage', storage)
  }
}

const snapshot = () => JSON.stringify(loadRegionalContext())
export function useRegionalContext(): [UserRegionalContext, typeof saveRegionalContext] {
  const value = useSyncExternalStore(subscribe, snapshot, snapshot)
  return [useMemo(() => JSON.parse(value) as UserRegionalContext, [value]), saveRegionalContext]
}

function subscribeClock(listener: () => void) {
  const timer = window.setInterval(listener, 1000)
  window.addEventListener('focus', listener)
  document.addEventListener('visibilitychange', listener)
  return () => {
    window.clearInterval(timer)
    window.removeEventListener('focus', listener)
    document.removeEventListener('visibilitychange', listener)
  }
}

/** Update an open screen at local midnight or when returning to the tab. */
export function useRegionalDate(context: UserRegionalContext) {
  return useSyncExternalStore(subscribeClock, () => regionalDateKey(context), () => regionalDateKey(context))
}
