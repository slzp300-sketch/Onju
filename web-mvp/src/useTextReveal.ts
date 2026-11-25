import { useEffect, useLayoutEffect, useRef, useState } from 'react'

// Presentation only: the complete reply is already received and saved.
export function useTextReveal(text: string, length: number, animate: boolean, onComplete?: () => void) {
  const [progress, setProgress] = useState({ text, animate, count: 0 })
  if (progress.text !== text || progress.animate !== animate) {
    setProgress({ text, animate, count: 0 })
  }
  const complete = useRef(onComplete)
  useLayoutEffect(() => { complete.current = onComplete }, [onComplete])

  useEffect(() => {
    if (!animate) return
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      cancelAnimationFrame(frame)
      setProgress({ text, animate, count: length })
      complete.current?.()
    }
    if (motion.matches || !length) { finish(); return }

    const duration = Math.min(2200, Math.max(240, length / 180 * 1000))
    const started = performance.now()
    const tick = (now: number) => {
      if (now - started >= duration) { finish(); return }
      setProgress({ text, animate, count: Math.floor(length * Math.max(0, now - started) / duration) })
      frame = requestAnimationFrame(tick)
    }
    const onMotionChange = () => { if (motion.matches) finish() }
    frame = requestAnimationFrame(tick)
    motion.addEventListener('change', onMotionChange)
    return () => {
      cancelAnimationFrame(frame)
      motion.removeEventListener('change', onMotionChange)
    }
  }, [text, length, animate])

  const count = animate ? progress.text === text ? progress.count : 0 : length
  return { count, revealing: count < length }
}
