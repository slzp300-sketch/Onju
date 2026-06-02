import { motion } from 'framer-motion';

interface StampButtonProps {
  label: string;
  active: boolean;
  activeColor: string;   // 찍혔을 때 bg + border (tailwind)
  inkColor: string;      // 찍혔을 때 텍스트
  dryColor: string;      // 안 찍혔을 때 텍스트 (건조한 도장 색)
  rotation?: number;     // 도장 기울기 (deg)
  onClick: (e: React.MouseEvent) => void;
}

export default function StampButton({
  label, active, activeColor, inkColor, dryColor, rotation = -10, onClick,
}: StampButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.58 }}
      animate={{ rotate: active ? rotation : 0 }}
      transition={{ type: 'spring', stiffness: 480, damping: 18 }}
      className={`w-10 h-8 rounded-lg border-2 flex items-center justify-center select-none ${
        active ? activeColor : 'bg-surface border-dashed border-line'
      }`}
    >
      <span
        className={`text-[10px] font-black tracking-tighter leading-none ${
          active ? inkColor : `${dryColor} opacity-30`
        }`}
      >
        {label}
      </span>
    </motion.button>
  );
}
