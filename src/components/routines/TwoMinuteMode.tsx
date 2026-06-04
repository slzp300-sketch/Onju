import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Check, Zap } from 'lucide-react';
import type { Habit } from '../../types';
import HabitFocusMode from './HabitFocusMode';

interface TwoMinuteModeProps {
  habit: Habit;
  onClose: () => void;
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

type Phase = 'trigger' | 'ready' | 'habit';
const TOTAL = 120; // 2분

export default function TwoMinuteMode({ habit, onClose }: TwoMinuteModeProps) {
  const [phase, setPhase] = useState<Phase>('trigger');
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const goToReady = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('ready');
    setTimeout(() => setPhase('habit'), 900);
  }, []);

  useEffect(() => {
    if (phase !== 'trigger') return;
    intervalRef.current = setInterval(() => {
      setElapsed(e => {
        if (e + 1 >= TOTAL) { goToReady(); return TOTAL; }
        return e + 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [phase, goToReady]);

  const remaining = TOTAL - elapsed;
  const progress = elapsed / TOTAL;
  const circumference = 2 * Math.PI * 44;

  /* ── 전환: 준비 완료 ── */
  if (phase === 'ready') {
    return (
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-[#1a1c24] flex flex-col items-center justify-center max-w-md mx-auto"
      >
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 350, damping: 22 }}
          className="flex flex-col items-center gap-4"
        >
          <span className="text-6xl">🎉</span>
          <p className="text-white text-title3 font-bold">준비 완료!</p>
          <p className="text-cool-60 text-body2">
            이제 <span className="text-white font-semibold">{habit.title}</span> 시작해봐요
          </p>
        </motion.div>
      </motion.div>
    );
  }

  /* ── 2분 이후: 메인 습관으로 전환 ── */
  if (phase === 'habit') {
    return (
      <AnimatePresence>
        <HabitFocusMode habit={habit} onClose={onClose} />
      </AnimatePresence>
    );
  }

  /* ── 2분 트리거 화면 ── */
  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="fixed inset-0 z-50 bg-[#1a1c24] flex flex-col items-center justify-center max-w-md mx-auto"
    >
      <button onClick={onClose} className="absolute top-6 right-6 p-2 text-cool-60 hover:text-white">
        <X size={24} />
      </button>

      {/* 배지 */}
      <div className="flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-amber-500/20 border border-amber-500/30">
        <Zap size={14} className="text-amber-400" fill="currentColor" />
        <span className="text-amber-400 text-caption1 font-bold">2분 트리거</span>
      </div>

      {/* 트리거 텍스트 */}
      <p className="text-white text-title3 font-bold text-center px-8 mb-10 leading-snug">
        {habit.twoMinuteHabit}
      </p>

      {/* 링 타이머 */}
      <div className="relative w-40 h-40 mb-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#2d2f3a" strokeWidth="7" />
          <circle
            cx="50" cy="50" r="44" fill="none"
            stroke="#f59e0b" strokeWidth="7" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * progress}
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-white text-2xl font-mono font-bold tabular-nums">
            {fmt(remaining)}
          </span>
          <span className="text-cool-60 text-caption1">남은 시간</span>
        </div>
      </div>

      {/* 완료 버튼 */}
      <motion.button
        whileTap={{ scale: 0.94 }}
        onClick={goToReady}
        className="flex items-center gap-2 px-10 py-4 rounded-2xl bg-amber-500 text-white font-bold text-body1 shadow-lg"
      >
        <Check size={20} strokeWidth={2.5} />
        준비됐어요!
      </motion.button>

      <p className="text-cool-60 text-caption1 mt-4">
        {habit.title}을(를) 시작하기 전 준비 동작이에요
      </p>
    </motion.div>
  );
}
