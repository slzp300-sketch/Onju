import { motion } from 'framer-motion';
import { ChevronRight, CheckCircle2 } from 'lucide-react';

interface ReviewBannerProps {
  completed: boolean;
  weekRangeText: string;
  onStart: () => void;
}

export default function ReviewBanner({ completed, weekRangeText, onStart }: ReviewBannerProps) {
  return (
    <motion.button
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onStart}
      className={`w-full text-left rounded-2xl p-4 flex items-center gap-3 transition-colors ${
        completed
          ? 'bg-surface-alt border border-line-soft'
          : 'border-l-4 border-[#7F77DD] bg-[#EEEDFE]'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-caption1 text-label-alt mb-0.5">{weekRangeText}</p>
        {completed ? (
          <p className="text-label1 font-semibold text-label-alt flex items-center gap-1.5">
            <CheckCircle2 size={15} className="text-primary" />
            이번 주 리뷰 완료
          </p>
        ) : (
          <>
            <p className="text-label1 font-bold text-[#5854C7]">이번 주 리뷰하기</p>
            <p className="text-caption1 text-[#7F77DD] mt-0.5">루틴을 점검하고 다음 주를 준비해요</p>
          </>
        )}
      </div>
      <ChevronRight size={18} className={completed ? 'text-label-assistive' : 'text-[#7F77DD]'} />
    </motion.button>
  );
}
