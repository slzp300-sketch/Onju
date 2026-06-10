import { useState, useEffect, useRef, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
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

function fmtLabel(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m === 0) return `${sec}초`;
  return sec > 0 ? `${m}분 ${sec}초` : `${m}분`;
}

type Phase = 'timer' | 'done';

export default function HabitFocusMode({ habit, onClose }: HabitFocusModeProps) {
  const { toggleHabitLog, isHabitCompleted } = useHabitStore();
  const totalSeconds = habit.durationSeconds ?? 0;
  const color = '#1f6bff';

  const [elapsed, setElapsed] = useState(0);
  const [phase, setPhase] = useState<Phase>('timer');
  const [actualSecs, setActualSecs] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(0);

  const finish = useCallback((actual: number) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!isHabitCompleted(habit.id, today())) toggleHabitLog(habit.id, today());
    setActualSecs(actual);
    setPhase('done');
    confetti({ particleCount: 100, spread: 70, origin: { y: 0.3 }, colors: [color, '#1f8a4c', '#f59e0b'] });
  }, [habit.id, isHabitCompleted, toggleHabitLog]);

  useEffect(() => {
    startRef.current = Date.now();
    intervalRef.current = setInterval(() => {
      setElapsed(e => {
        const next = e + 1;
        if (totalSeconds > 0 && next >= totalSeconds) {
          finish(totalSeconds);
          return totalSeconds;
        }
        return next;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [totalSeconds, finish]);

  const remaining = totalSeconds > 0 ? totalSeconds - elapsed : elapsed;
  const progress = totalSeconds > 0 ? Math.min(elapsed / totalSeconds, 1) : 0;
  const circumference = 2 * Math.PI * 44;

  /* ── 완료 화면 ── */
  if (phase === 'done') {
    const diff = actualSecs - totalSeconds;
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, y: 40 }}
        className="fixed inset-0 z-50 bg-cool-22 flex flex-col items-center justify-between px-6"
        style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full">
          {/* 성공 아이콘 */}
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="w-20 h-20 rounded-full flex items-center justify-center shadow-lg"
            style={{ backgroundColor: color, boxShadow: `0 8px 24px ${color}50` }}
          >
            <Check size={38} className="text-white" strokeWidth={2.5} />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="flex flex-col items-center gap-1">
            <p className="text-white text-title3 font-bold">완료했어요!</p>
            <p className="text-cool-60 text-body2">{habit.emoji} {habit.title}</p>
          </motion.div>

          {/* 통계 카드 */}
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="w-full bg-cool-25 rounded-2xl px-5 py-5 flex flex-col gap-4"
          >
            {totalSeconds > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-cool-60 text-body2">목표 시간</span>
                <span className="text-white font-bold text-body1">{fmtLabel(totalSeconds)}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-cool-60 text-body2">실제 소요</span>
              <span className="text-white font-bold text-body1">{fmtLabel(actualSecs)}</span>
            </div>
            {totalSeconds > 0 && (
              <div className="flex justify-between items-center border-t border-cool-30 pt-3">
                <span className="text-cool-60 text-body2">차이</span>
                <span className={`font-bold text-body1 ${diff <= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {diff > 0 ? `+${fmtLabel(diff)} 초과` : diff < 0 ? `${fmtLabel(-diff)} 단축` : '정확히 완료'}
                </span>
              </div>
            )}
          </motion.div>
        </div>

        <motion.button
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          whileTap={{ scale: 0.97 }}
          onClick={onClose}
          className="w-full py-4 rounded-2xl text-white font-bold text-body1 shadow-lg"
          style={{ backgroundColor: color }}
        >
          닫기
        </motion.button>
      </motion.div>
    );
  }

  /* ── 타이머 화면 ── */
  return (
    <motion.div
      initial={{ opacity: 0, y: '100%' }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="fixed inset-0 z-50 bg-gray-950 flex flex-col items-center justify-center max-w-md mx-auto"
    >
      <button onClick={onClose} className="absolute top-6 right-6 p-2 text-label hover:text-label-alt transition-colors">
        <X size={24} />
      </button>

      <span className="text-6xl mb-5">{habit.emoji}</span>
      <p className="text-white text-title3 font-bold mb-10 px-6 text-center leading-tight">{habit.title}</p>

      {/* 링 타이머 */}
      <div className="relative w-40 h-40 mb-10">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="44" fill="none" stroke="#1f2937" strokeWidth="7" />
          {totalSeconds > 0 && (
            <circle cx="50" cy="50" r="44" fill="none" stroke={color} strokeWidth="7"
              strokeLinecap="round" strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - progress)}
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <span className="text-white text-2xl font-mono font-bold tabular-nums">
            {totalSeconds > 0 ? fmt(remaining) : fmt(elapsed)}
          </span>
          <span className="text-label text-caption1">
            {totalSeconds > 0 ? '남은 시간' : '경과 시간'}
          </span>
        </div>
      </div>

      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={() => finish(Math.round((Date.now() - startRef.current) / 1000))}
        style={{ backgroundColor: color }}
        className="flex items-center gap-2 px-12 py-4 rounded-2xl text-white font-semibold text-body1 shadow-lg"
      >
        <Check size={20} strokeWidth={2.5} />
        완료
      </motion.button>

      <button onClick={onClose} className="mt-5 text-label text-body2 hover:text-label-alt transition-colors">
        나중에 할게요
      </button>
    </motion.div>
  );
}
