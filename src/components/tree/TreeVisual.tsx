import { useRef, useSyncExternalStore } from 'react'
import { motion, useInView } from 'framer-motion'
import type { TreeHealth } from '../../utils/treeGrowth'

interface TreeVisualProps {
  stage: number
  health: TreeHealth
  size?: number
  animateGrowth?: boolean
}

const HEALTH_LABELS: Record<TreeHealth, string> = {
  healthy: '건강한',
  dry: '힘을 잃은',
  wilted: '시든',
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

function subscribeMotionPreference(onChange: () => void) {
  const media = window.matchMedia(REDUCED_MOTION_QUERY)
  media.addEventListener('change', onChange)
  document.addEventListener('visibilitychange', onChange)
  return () => {
    media.removeEventListener('change', onChange)
    document.removeEventListener('visibilitychange', onChange)
  }
}

function canAnimate() {
  return !document.hidden && !window.matchMedia(REDUCED_MOTION_QUERY).matches
}

export default function TreeVisual({
  stage,
  health,
  size = 140,
  animateGrowth = true,
}: TreeVisualProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isInView = useInView(containerRef)
  const motionAllowed = useSyncExternalStore(subscribeMotionPreference, canAnimate, () => false)

  const safeStage = Math.max(0, Math.min(5, Math.floor(stage)))
  // The concept has one stressed-state set, so dry and wilted share it.
  const assetHealth = health === 'healthy' ? 'healthy' : 'wilted'
  const imagePath = `/trees/stage-${safeStage}-${assetHealth}.webp`
  const swaying = isInView && motionAllowed
  const sway = health === 'healthy' ? (safeStage < 2 ? 0.8 : 1.2) : 0.45

  return (
    <motion.div
      ref={containerRef}
      className="shrink-0 mix-blend-multiply"
      style={{ width: size, height: Math.round(size * 0.9) }}
      initial={animateGrowth && motionAllowed ? { opacity: 0, scale: 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: motionAllowed ? 0.24 : 0, ease: 'easeOut' }}
    >
      {/* Keep the image box and surrounding text still; pivot near the roots. */}
      <motion.img
        src={imagePath}
        alt={`${HEALTH_LABELS[health]} 나무 성장 ${safeStage + 1}단계`}
        width={size}
        height={Math.round(size * 0.9)}
        draggable={false}
        className="block h-full w-full select-none object-contain"
        style={{ transformOrigin: '50% 80%' }}
        animate={swaying ? { rotate: [0, -sway, sway * 0.8, 0] } : { rotate: 0 }}
        transition={swaying
          ? { duration: health === 'healthy' ? 7.5 : 9, repeat: Infinity, ease: 'easeInOut' }
          : { duration: 0 }}
      />
    </motion.div>
  )
}
