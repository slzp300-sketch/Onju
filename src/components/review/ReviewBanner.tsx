import { motion } from 'framer-motion';
import { ChevronRight, CheckCircle2, Sparkles, AlarmClock } from 'lucide-react';

interface ReviewBannerProps {
  completed: boolean;
  overdue?: boolean;
  weekRangeText: string;
  streak?: number;
  onStart: () => void;
}

export default function ReviewBanner({ completed, overdue = false, weekRangeText, streak = 0, onStart }: ReviewBannerProps) {
  // 완료 상태 — 차분한 배너 + 스트릭 뱃지
  if (completed) {
    return (
      <motion.button
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        onClick={onStart}
        className="w-full text-left rounded-2xl p-4 flex items-center gap-3 bg-surface-alt border border-line-soft transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-caption1 text-label-alt mb-0.5">{weekRangeText}</p>
          <p className="text-label1 font-semibold text-label-alt flex items-center gap-1.5">
            <CheckCircle2 size={15} className="text-primary" />
            이번 주 리뷰 완료
          </p>
        </div>
        {streak >= 2 && (
          <span className="flex items-center gap-1 text-caption2 font-bold text-primary bg-primary-soft px-2.5 py-1 rounded-full flex-shrink-0">
            🔥 {streak}주 연속
          </span>
        )}
        <ChevronRight size={18} className="text-label-assistive flex-shrink-0" />
      </motion.button>
    );
  }

  // 미완료 — 승격 카드 (overdue면 더 강한 톤)
  const accent = overdue ? '#E0792B' : '#5854C7';
  const softBg = overdue ? '#FCF1E6' : '#EEEDFE';
  const iconBg = overdue ? '#F7DFC8' : '#DEDCFB';

  return (
    <motion.button
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.98 }}
      onClick={onStart}
      className="w-full text-left rounded-2xl p-4 flex items-center gap-3.5 shadow-emphasize"
      style={{ backgroundColor: softBg, borderLeft: `4px solid ${accent}` }}
    >
      <div
        className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: iconBg }}
      >
        {overdue
          ? <AlarmClock size={22} style={{ color: accent }} />
          : <Sparkles size={22} style={{ color: accent }} />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-caption1 mb-0.5" style={{ color: accent, opacity: 0.85 }}>{weekRangeText}</p>
        <p className="text-body1 font-bold" style={{ color: accent }}>
          {overdue ? '지난주 리뷰가 아직 남아있어요' : '한 주를 마무리할 시간이에요'}
        </p>
        <p className="text-caption1 mt-0.5" style={{ color: accent, opacity: 0.8 }}>
          {overdue ? '오늘 안에 마무리하고 새로운 주를 시작해요' : '루틴을 점검하고 다음 주를 준비해요'}
        </p>
      </div>

      <ChevronRight size={20} style={{ color: accent }} className="flex-shrink-0" />
    </motion.button>
  );
}
