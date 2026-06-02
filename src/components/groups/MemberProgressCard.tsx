import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, X } from 'lucide-react';
import type { MemberGroupProgress, CheerType } from '../../types';

const CHEER_ICONS: Record<CheerType, string> = {
  heart: '❤️',
  fire: '🔥',
  pray: '🙏',
};

const CHEER_LABELS: Record<CheerType, string> = {
  heart: '사랑',
  fire: '대단해',
  pray: '기도',
};

interface MemberProgressCardProps {
  member: MemberGroupProgress;
  canCheer?: boolean;
  onCheer?: (type: CheerType) => void;
}

export default function MemberProgressCard({ member, canCheer = true, onCheer }: MemberProgressCardProps) {
  const initial = member.userName.slice(0, 1);
  const [showCheerPop, setShowCheerPop] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [floatingCheers, setFloatingCheers] = useState<{ id: number; type: CheerType }[]>([]);

  const handleCheer = (type: CheerType) => {
    setShowCheerPop(false);
    setFloatingCheers(c => [...c, { id: Date.now(), type }]);
    setTimeout(() => setFloatingCheers(c => c.slice(1)), 1200);
    onCheer?.(type);
  };

  return (
    <>
      <div
        className="bg-white rounded-2xl p-4 border border-line-soft shadow-sm relative overflow-hidden"
        onClick={() => setShowDetail(true)}
      >
        {/* 상단: 아바타 + 이름 + 응원 */}
        <div className="flex items-center gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-primary-soft flex items-center justify-center text-primary font-semibold text-sm flex-shrink-0">
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-label-strong truncate">{member.userName}</p>
            <div className="flex items-center gap-1 text-orange-500">
              <Flame size={12} />
              <span className="text-xs font-medium">{member.streak}일 연속</span>
            </div>
          </div>
          <span className="text-xs font-semibold text-label">{member.weeklyRate}%</span>

          {/* 응원 버튼 */}
          <div className="relative" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => canCheer && setShowCheerPop(p => !p)}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
                canCheer ? 'bg-pink-50 text-pink-400 hover:bg-pink-100' : 'bg-fill text-label-assistive cursor-not-allowed'
              }`}
              disabled={!canCheer}
            >
              ❤️
            </button>

            {/* 응원 팝오버 */}
            <AnimatePresence>
              {showCheerPop && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: 8 }}
                  transition={{ type: 'spring', stiffness: 650, damping: 22 }}
                  className="absolute right-0 bottom-10 bg-white rounded-2xl shadow-xl border border-line-soft p-2 flex gap-2 z-10"
                >
                  {(['heart', 'fire', 'pray'] as CheerType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => handleCheer(type)}
                      className="flex flex-col items-center gap-0.5 p-2 rounded-xl hover:bg-surface-alt transition-colors"
                    >
                      <span className="text-xl">{CHEER_ICONS[type]}</span>
                      <span className="text-xs text-label-alt">{CHEER_LABELS[type]}</span>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* 달성률 바 */}
        <div className="grid grid-cols-2 gap-2">
          <MiniBar label="개인" rate={member.todayPersonalRate} color="#6366f1" />
          <MiniBar label="신앙" rate={member.todayFaithRate} color="#10b981" />
        </div>

        {/* float 애니메이션 */}
        <AnimatePresence>
          {floatingCheers.map(({ id, type }) => (
            <motion.div
              key={id}
              initial={{ opacity: 1, y: 0, x: '50%' }}
              animate={{ opacity: 0, y: -60 }}
              exit={{}}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="absolute right-12 bottom-8 text-2xl pointer-events-none"
            >
              {CHEER_ICONS[type]}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* 상세 바텀시트: 주간 히트맵 */}
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
              className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary-soft flex items-center justify-center text-primary font-semibold text-sm">
                    {initial}
                  </div>
                  <p className="font-semibold text-label-strong">{member.userName}</p>
                </div>
                <button onClick={() => setShowDetail(false)}>
                  <X size={20} className="text-label-alt" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-5">
                <StatPill label="이번 주" value={`${member.weeklyRate}%`} />
                <StatPill label="개인" value={`${member.todayPersonalRate}%`} color="indigo" />
                <StatPill label="신앙" value={`${member.todayFaithRate}%`} color="emerald" />
              </div>

              <div className="flex items-center gap-1 text-orange-500 justify-center">
                <Flame size={16} />
                <span className="text-sm font-semibold">{member.streak}일 연속 달성</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function MiniBar({ label, rate, color }: { label: string; rate: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-xs text-label-alt">{label}</span>
        <span className="text-xs font-medium text-label">{rate}%</span>
      </div>
      <div className="bg-fill rounded-full h-1.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${rate}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color?: 'indigo' | 'emerald' }) {
  const colorMap = {
    indigo: 'text-primary',
    emerald: 'text-emerald-600',
  };
  return (
    <div className="bg-surface-alt rounded-2xl p-3 text-center">
      <p className="text-xs text-label-alt mb-1">{label}</p>
      <p className={`text-lg font-bold ${color ? colorMap[color] : 'text-label-strong'}`}>{value}</p>
    </div>
  );
}
