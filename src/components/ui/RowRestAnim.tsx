import { motion } from 'framer-motion';

/** 쉬어가기 전용 — 구름이 떠오르며 사라지는 부드러운 애니메이션 */
export default function RowRestAnim() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-20 rounded-xl overflow-hidden"
      style={{ background: 'rgba(251,191,36,0.06)' }}
    >
      <motion.div
        initial={{ y: 4, opacity: 0 }}
        animate={{ y: -18, opacity: [0, 1, 1, 0] }}
        transition={{ duration: 0.9, ease: 'easeOut', times: [0, 0.15, 0.6, 1] }}
        className="flex flex-col items-center gap-1"
      >
        <span className="text-3xl leading-none">☁️</span>
        <span className="text-caption2 font-semibold text-amber-500 whitespace-nowrap">
          오늘은 쉬어가요
        </span>
      </motion.div>
    </motion.div>
  );
}
