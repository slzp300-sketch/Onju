import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X, Check } from 'lucide-react';
import type { Habit } from '../../types';
import { useHabitStore } from '../../store/habitStore';
import { today } from '../../utils/date';

interface HabitFocusModeProps {
  habit: Habit;
  onClose: () => void;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function HabitFocusMode({ habit, onClose }: HabitFocusModeProps) {
  const { toggleHabitLog, isHabitCompleted } = useHabitStore();
  const done = isHabitCompleted(habit.id, today());
  const totalSeconds = habit.durationSeconds ?? 0;
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

  const handleComplete = () => {
    if (!done) toggleHabitLog(habit.id, today());
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="fixed inset-0 z-50 bg-surface flex flex-col items-center justify-center max-w-md mx-auto"
    >
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 text-label-alt hover:text-label-strong transition-colors"
      >
        <X size={24} />
      </button>

      <span className="text-6xl mb-5">{habit.emoji}</span>
      <p className="text-headline1 font-bold text-label-strong mb-10 px-6 text-center">{habit.title}</p>

      {/* 링 타이머 */}
      <div className="relative w-40 h-40 mb-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--color-fill-strong)" strokeWidth="7" />
          <circle
            cx="50" cy="50" r="44" fill="none"
            stroke="var(--color-primary)" strokeWidth="7"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-label-strong font-mono tabular-nums">
            {totalSeconds > 0 ? fmt(remaining) : fmt(elapsed)}
          </span>
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={handleComplete}
        className={`w-16 h-16 rounded-full flex items-center justify-center shadow-strong transition-colors ${
          finished || done ? 'bg-primary text-white' : 'bg-fill-strong text-label-alt'
        }`}
      >
        <Check size={28} strokeWidth={2.5} />
      </motion.button>
      <p className="text-caption1 text-label-alt mt-3">
        {finished || done ? '완료했어요! 🎉' : '완료하면 체크해요'}
      </p>
    </motion.div>
  );
}
