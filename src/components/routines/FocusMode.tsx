import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Check } from 'lucide-react';
import type { DailyRoutine } from '../../types';
import { useRoutineStore } from '../../store/routineStore';
import { today } from '../../utils/date';

interface FocusModeProps {
  routine: DailyRoutine;
  onClose: () => void;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function FocusMode({ routine, onClose }: FocusModeProps) {
  const { toggleRoutineLog, isCompleted } = useRoutineStore();
  const done = isCompleted(routine.id, today());
  // durationSeconds 우선, 없으면 durationMinutes 변환
  const totalSeconds = routine.durationSeconds ?? (routine.durationMinutes ?? 0) * 60;
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        if (totalSeconds > 0 && next >= totalSeconds) {
          clearInterval(intervalRef.current!);
          setFinished(true);
          return totalSeconds;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current!);
  }, [totalSeconds]);

  const remaining = totalSeconds > 0 ? totalSeconds - elapsed : elapsed;
  const progress = totalSeconds > 0 ? Math.min(elapsed / totalSeconds, 1) : 0;
  const circumference = 2 * Math.PI * 44;
  const color = routine.type === 'faith' ? '#10b981' : '#6366f1';

  const handleComplete = () => {
    if (!done) toggleRoutineLog(routine.id, today());
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950"
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-label hover:text-label-alt transition-colors"
      >
        <X size={24} />
      </button>

      <p className="text-label-alt text-caption1 tracking-widest uppercase mb-2">
        {routine.type === 'faith' ? '신앙 루틴' : '개인 루틴'}
      </p>
      <h2 className="text-white text-title3 font-bold mb-14 text-center px-10 leading-tight">
        {routine.title}
      </h2>

      <div className="relative w-56 h-56 mb-14">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#1f2937" strokeWidth="7" />
          {totalSeconds > 0 && (
            <circle
              cx="50" cy="50" r="44"
              fill="none"
              stroke={color}
              strokeWidth="7"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-white text-4xl font-mono font-bold tabular-nums">
            {totalSeconds > 0 ? fmt(remaining) : fmt(elapsed)}
          </span>
          <span className="text-label text-caption1">
            {totalSeconds > 0 ? (finished ? '완료!' : '남은 시간') : '경과 시간'}
          </span>
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={handleComplete}
        style={{ backgroundColor: color }}
        className="flex items-center gap-2 px-12 py-4 rounded-2xl text-white font-semibold text-body1 shadow-lg"
      >
        <Check size={20} strokeWidth={2.5} />
        완료로 표시
      </motion.button>

      <button
        onClick={onClose}
        className="mt-5 text-label text-body2 hover:text-label-alt transition-colors"
      >
        나중에 할게요
      </button>
    </motion.div>
  );
}
