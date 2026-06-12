import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useUIStore } from '../../store/uiStore';
import { useThemeStore, THEME_TIERS } from '../../store/themeStore';
import { STAGE_NAMES, type TreeStage } from '../../utils/treeGrowth';
import TreeVisual from './TreeVisual';
import { CONFETTI_FOREST } from './treePalette';

/** 나무 단계 상승 축하 모달 — useTreeStageWatcher가 트리거 */
export default function StageUpModal() {
  const { pendingStageUp, clearPendingStageUp } = useUIStore();

  useEffect(() => {
    if (pendingStageUp === null) return;
    confetti({ particleCount: 110, spread: 75, origin: { y: 0.4 }, colors: CONFETTI_FOREST });
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 30, 50, 30, 100]);
    }
  }, [pendingStageUp]);

  if (pendingStageUp === null) return null;
  const stage = Math.min(4, Math.max(0, pendingStageUp)) as TreeStage;
  const unlockedTheme = THEME_TIERS.find(t => t.requiredStage === stage);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
        onClick={clearPendingStageUp}
      >
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 28 }}
          className="bg-surface rounded-3xl p-8 w-full max-w-xs text-center shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex justify-center mb-2">
            <TreeVisual stage={stage} health="healthy" size={140} animateGrowth />
          </div>
          <h2 className="text-heading1 font-bold text-label-strong mb-1">나무가 자랐어요!</h2>
          <p className="text-body2 text-label-alt mb-4">
            꾸준한 루틴으로 나무가 <span className="font-bold text-primary">{STAGE_NAMES[stage]}</span>이 되었어요.
          </p>

          {unlockedTheme && (
            <div className="bg-fill rounded-xl px-3 py-2.5 mb-4">
              <div className="flex items-center justify-center gap-2">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: unlockedTheme.preview.accent }}
                />
                <p className="text-caption1 text-label">
                  <span className="font-bold">'{unlockedTheme.name}'</span> 테마가 열렸어요 — 마이페이지 · 숲 테마에서 미리보고 적용할 수 있어요
                </p>
              </div>
              {unlockedTheme.perks.length > 1 && (
                <p className="text-caption2 font-bold text-primary mt-1.5">
                  ✨ 새 효과: {unlockedTheme.perks.slice(1).join(' · ')}
                </p>
              )}
            </div>
          )}

          <ApplyButtons unlockedThemeId={unlockedTheme?.id} onClose={clearPendingStageUp} />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ApplyButtons({ unlockedThemeId, onClose }: { unlockedThemeId?: string; onClose: () => void }) {
  const setTheme = useThemeStore(s => s.setTheme);
  const tier = THEME_TIERS.find(t => t.id === unlockedThemeId);
  return (
    <div className="flex flex-col gap-2">
      {tier && (
        <button
          onClick={() => { setTheme(tier.id); onClose(); }}
          className="w-full bg-primary text-white font-semibold py-3 rounded-2xl text-body2"
        >
          새 테마 바로 적용하기
        </button>
      )}
      <button
        onClick={onClose}
        className={`w-full font-semibold py-3 rounded-2xl text-body2 ${
          tier ? 'bg-fill text-label' : 'bg-primary text-white'
        }`}
      >
        {tier ? '나중에 할게요' : '확인'}
      </button>
    </div>
  );
}
