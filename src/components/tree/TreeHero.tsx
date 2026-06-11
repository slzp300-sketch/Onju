import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTreeGrowth } from '../../hooks/useTreeGrowth';
import type { TreeStage, TreeHealth } from '../../utils/treeGrowth';
import TreeVisual from './TreeVisual';

const HEALTH_MESSAGES: Record<TreeHealth, string> = {
  healthy: '나무가 싱싱해요 🌿',
  dry: '나무가 목말라요 — 오늘 루틴으로 물을 줘요',
  wilted: '나무가 시들고 있어요 — 다시 시작해봐요',
};

/** Dashboard 히어로 — 나의 나무 + 성장 진행도 */
export default function TreeHero() {
  const navigate = useNavigate();
  const growth = useTreeGrowth();
  const [searchParams] = useSearchParams();

  // dev 한정 미리보기 오버라이드: /?tree=3,wilted
  let { stage, health } = growth;
  if (import.meta.env.DEV) {
    const override = searchParams.get('tree');
    if (override) {
      const [s, h] = override.split(',');
      const sNum = Number(s);
      if (sNum >= 0 && sNum <= 4) stage = sNum as TreeStage;
      if (h === 'healthy' || h === 'dry' || h === 'wilted') health = h;
    }
  }

  return (
    <motion.button
      whileTap={{ scale: 0.99 }}
      transition={{ duration: 0.1 }}
      onClick={() => navigate('/streak')}
      className="mx-4 flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-left flex-shrink-0"
      style={{ background: 'var(--gradient-hero)' }}
    >
      <div className="flex-shrink-0 -my-1">
        <TreeVisual stage={stage} health={health} size={92} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <p className="text-body2 font-bold text-label-strong">{growth.stageName}</p>
          <p className="text-caption2 text-label-assistive tabular-nums">
            {growth.points}pt
            {growth.nextThreshold !== null && ` / ${growth.nextThreshold}pt`}
          </p>
        </div>
        {/* 다음 단계 진행바 */}
        <div className="mt-1.5 h-1.5 rounded-full bg-fill-strong overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'var(--gradient-canopy)' }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(growth.progressToNext * 100)}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
          />
        </div>
        <p className="mt-1.5 text-caption1 text-label-alt truncate">{HEALTH_MESSAGES[health]}</p>
      </div>
    </motion.button>
  );
}
