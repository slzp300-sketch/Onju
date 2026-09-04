import { useCallback, useLayoutEffect, useRef, useState } from 'react'

// Follow the conversation, but never pull someone away from older messages.
export function useChatScroll(revision: string, ready: boolean) {
  const historyRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [showLatest, setShowLatest] = useState(false)

  const scrollToLatest = useCallback(() => {
    following.current = true
    setShowLatest(false)
    const history = historyRef.current
    if (history) history.scrollTop = history.scrollHeight
  }, [])

  const onScroll = useCallback(() => {
    const history = historyRef.current
    if (!history) return
    following.current = history.scrollHeight - history.clientHeight - history.scrollTop < 64
    setShowLatest(!following.current)
  }, [])

  useLayoutEffect(() => {
    if (ready && following.current) scrollToLatest()
  }, [revision, ready, scrollToLatest])

  useLayoutEffect(() => {
    if (!ready || !historyRef.current || !contentRef.current) return
    const observer = new ResizeObserver(() => {
      if (following.current) scrollToLatest()
    })
    observer.observe(historyRef.current)
    observer.observe(contentRef.current)
    return () => observer.disconnect()
  }, [ready, scrollToLatest])

  return { historyRef, contentRef, onScroll, scrollToLatest, showLatest }
}
