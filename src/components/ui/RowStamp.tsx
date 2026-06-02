import { motion } from 'framer-motion';
import StampSeal from './StampSeal';

interface RowStampProps {
  type: 'done' | 'rest';
  color: string;
}

/** 아이템 행 위에 잠깐 찍히는 미니 스탬프 */
export default function RowStamp({ type, color }: RowStampProps) {
  const label    = type === 'done' ? '완료' : '쉼';
  const rotation = type === 'done' ? -10 : 8;

  return (
    <motion.div
      initial={{ scale: 1.4, opacity: 0, rotate: rotation * 0.4 }}
      animate={{ scale: 1,   opacity: 1, rotate: rotation }}
      exit={{ scale: 0.8,  opacity: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 20 }}
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
      style={{ background: `${color}12` }}
    >
      <StampSeal label={label} color={color} size={88} />
    </motion.div>
  );
}
