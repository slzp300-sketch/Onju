import { motion } from 'framer-motion'
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

export default function TreeVisual({
  stage,
  health,
  size = 140,
  animateGrowth = true,
}: TreeVisualProps) {
  const safeStage = Math.max(0, Math.min(5, Math.floor(stage)))
  // The concept has one stressed-state set, so dry and wilted share it.
  const assetHealth = health === 'healthy' ? 'healthy' : 'wilted'
  const imagePath = `/trees/stage-${safeStage}-${assetHealth}.webp`

  return (
    <motion.img
      src={imagePath}
      alt={`${HEALTH_LABELS[health]} 나무 성장 ${safeStage + 1}단계`}
      width={size}
      height={Math.round(size * 0.9)}
      draggable={false}
      className="block shrink-0 select-none object-contain mix-blend-multiply"
      initial={animateGrowth ? { opacity: 0, scale: 0.82 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 18 }}
    />
  )
}
