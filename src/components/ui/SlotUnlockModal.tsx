import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useUIStore } from '../../store/uiStore';

export default function SlotUnlockModal() {
  const { pendingUnlockCelebration, newSlotCount, clearPendingUnlock } = useUIStore();

  useEffect(() => {
    if (!pendingUnlockCelebration) return;
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.4 },
      colors: ['#7F77DD', '#EF9F27', '#1D9E75'],
    });
    if ('vibrate' in navigator) {
      navigator.vibrate([50, 30, 50, 30, 100]);
    }
  }, [pendingUnlockCelebration]);

  return (
    <AnimatePresence>
      {pendingUnlockCelebration && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6"
          onClick={clearPendingUnlock}
        >
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="bg-white rounded-3xl p-8 w-full max-w-xs text-center shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-4xl mb-3">🎉</div>
            <h2 className="text-xl font-bold text-label-strong mb-1">목표 칸이 늘어났어요!</h2>
            <p className="text-sm text-label-alt mb-6">
              지난 주 달성률이 80%를 넘었어요.<br />이제 주간 목표를 하나 더 세울 수 있어요!
            </p>

            {/* 목표 칸 표시 */}
            <div className="flex justify-center gap-2 mb-6">
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.1, type: 'spring', stiffness: 500, damping: 25 }}
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm ${
                    i < newSlotCount
                      ? 'bg-primary text-white'
                      : 'bg-fill text-label-assistive'
                  }`}
                >
                  {i < newSlotCount ? '✓' : ''}
                </motion.div>
              ))}
            </div>

            <p className="text-xs text-primary font-semibold mb-4">
              이제 주간 목표를 {newSlotCount}개까지 설정할 수 있어요
            </p>

            <button
              onClick={clearPendingUnlock}
              className="w-full bg-primary text-white font-semibold py-3 rounded-2xl text-sm"
            >
              확인
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
