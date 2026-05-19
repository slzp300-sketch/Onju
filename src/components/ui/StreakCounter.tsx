import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100];

function nextMilestone(streak: number) {
  return STREAK_MILESTONES.find(m => m > streak) ?? null;
}

interface StreakCounterProps {
  personalStreak: number;
  faithStreak: number;
  personalBest: number;
  faithBest: number;
}

export default function StreakCounter({
  personalStreak,
  faithStreak,
  personalBest,
  faithBest,
}: StreakCounterProps) {
  const [showDetail, setShowDetail] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowDetail(true)}
        className="flex items-center gap-4 bg-white rounded-2xl px-4 py-3 border border-gray-100 shadow-sm w-full"
      >
        <StreakPill icon="🔥" value={personalStreak} label="개인" color="text-orange-500" />
        <div className="w-px h-6 bg-gray-100" />
        <StreakPill icon="✝" value={faithStreak} label="신앙" color="text-emerald-500" />
      </button>

      <AnimatePresence>
        {showDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 px-4 pb-6"
            onClick={() => setShowDetail(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 350, damping: 32 }}
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-bold text-gray-900">연속 달성 현황</h3>
                <button onClick={() => setShowDetail(false)}>
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <DetailCard
                  icon="🔥"
                  label="개인 루틴"
                  streak={personalStreak}
                  best={personalBest}
                  color="orange"
                />
                <DetailCard
                  icon="✝"
                  label="신앙 루틴"
                  streak={faithStreak}
                  best={faithBest}
                  color="emerald"
                />
              </div>

              <p className="text-xs text-gray-400 text-center">
                달성률 50% 이상이면 그날 연속 달성으로 인정돼요
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function StreakPill({ icon, value, label, color }: {
  icon: string;
  value: number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <span className="text-lg">{icon}</span>
      <div>
        <p className={`text-base font-bold ${color}`}>{value}일</p>
        <p className="text-xs text-gray-400">{label}</p>
      </div>
    </div>
  );
}

function DetailCard({ icon, label, streak, best, color }: {
  icon: string;
  label: string;
  streak: number;
  best: number;
  color: 'orange' | 'emerald';
}) {
  const next = nextMilestone(streak);
  const colorMap = {
    orange: 'bg-orange-50 border-orange-100 text-orange-500',
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-500',
  };

  return (
    <div className={`rounded-2xl border p-4 ${colorMap[color]}`}>
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">{streak}<span className="text-sm font-medium text-gray-400 ml-1">일</span></p>
      <p className="text-xs text-gray-400 mt-1">최고 {best}일</p>
      {next && (
        <p className="text-xs mt-2 font-medium">
          다음 기록 목표까지 {next - streak}일
        </p>
      )}
    </div>
  );
}
