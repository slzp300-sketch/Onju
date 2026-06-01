import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pause, Play, SkipForward, Check } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useHabitStore } from '../store/habitStore';
import type { Habit } from '../types';

const DEFAULT_SECS = 60;

type Status = 'running' | 'paused' | 'done';

function fmt(secs: number) {
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

function fmtHHMM(date: Date) {
  return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
}

export default function RoutineTimer() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { personalRoutines, habits, toggleHabitLog } = useHabitStore();

  const routine = personalRoutines.find(r => r.id === id);
  const routineHabits = (routine?.habitIds ?? [])
    .map(hId => habits.find(h => h.id === hId))
    .filter(Boolean) as Habit[];

  const getDuration = useCallback((hId: string) =>
    routine?.habitDurations?.[hId] ?? DEFAULT_SECS,
  [routine]);

  const [idx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(() => getDuration(routineHabits[0]?.id ?? ''));
  const [status, setStatus] = useState<Status>('running');
  const [elapsed, setElapsed] = useState<Record<string, number>>({}); // actual seconds per habit
  // eslint-disable-next-line react-hooks/purity
  const habitStart = useRef(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // eslint-disable-next-line react-hooks/purity
  const estimatedEnd = new Date(Date.now() + routineHabits.slice(idx + 1).reduce((s, h) => s + getDuration(h.id), 0) * 1000 + timeLeft * 1000);

  const advance = useCallback((skipped = false) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const currentHabit = routineHabits[idx];
    const actualSecs = skipped ? 0 : Math.round((Date.now() - habitStart.current) / 1000);
    setElapsed(prev => ({ ...prev, [currentHabit.id]: actualSecs }));
    if (!skipped) toggleHabitLog(currentHabit.id);

    if (idx >= routineHabits.length - 1) {
      setStatus('done');
      confetti({ particleCount: 120, spread: 80, origin: { y: 0.25 }, colors: ['#6366f1', '#10b981', '#f59e0b', '#ef4444'] });
    } else {
      const nextIdx = idx + 1;
      setIdx(nextIdx);
      setTimeLeft(getDuration(routineHabits[nextIdx].id));
      habitStart.current = Date.now();
      setStatus('running');
    }
  }, [idx, routineHabits, getDuration, toggleHabitLog]);

  useEffect(() => {
    if (status !== 'running') {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          advance();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [status, advance]);

  if (!routine || routineHabits.length === 0) {
    navigate(-1);
    return null;
  }

  const current = routineHabits[idx];
  const next = routineHabits[idx + 1];
  const planned = getDuration(current?.id ?? '');
  const progress = planned > 0 ? Math.min((planned - timeLeft) / planned, 1) : 0;

  /* ── 완료 화면 ── */
  if (status === 'done') {
    const totalActual = Object.values(elapsed).reduce((s, v) => s + v, 0);
    return (
      <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col items-center justify-between px-6"
        style={{ paddingTop: 'max(3rem, env(safe-area-inset-top))', paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full">
          {/* 성공 아이콘 */}
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
            <Check size={38} className="text-white" strokeWidth={2.5} />
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-2xl font-bold text-white">루틴을 성공했어요!</motion.h1>

          {/* 총 소요 시간 */}
          <div className="w-full bg-gray-800 rounded-2xl px-5 py-4 text-center">
            <p className="text-gray-400 text-sm">⏱️ 총 소요시간 <span className="text-white font-bold">{totalActual}초</span></p>
          </div>

          {/* 습관별 결과 */}
          <div className="w-full flex flex-col gap-3">
            {routineHabits.map((h, i) => {
              const actual = elapsed[h.id] ?? 0;
              const plan = getDuration(h.id);
              const diff = actual - plan;
              return (
                <motion.div key={h.id}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.07 }}
                  className="flex items-center justify-between">
                  <span className="text-white text-sm">{h.emoji} {h.title}</span>
                  <div className="text-right">
                    <span className="text-white text-sm font-semibold">{actual}초</span>
                    <span className={`text-xs ml-1.5 ${diff <= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ({diff > 0 ? '+' : ''}{diff}초)
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* 버튼 */}
        <div className="w-full flex flex-col gap-3">
          <motion.button whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
            onClick={() => navigate(-1)}
            className="w-full py-4 rounded-2xl bg-green-500 text-white font-bold text-base shadow-lg shadow-green-500/20">
            완료
          </motion.button>
          <button onClick={() => navigate(`/personal-routines/edit/${routine.id}`)}
            className="text-gray-500 text-sm text-center py-2 hover:text-gray-300 transition-colors">
            수정하기
          </button>
        </div>
      </div>
    );
  }

  /* ── 타이머 실행 화면 ── */
  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4">
        <div className="w-8" />
        <p className="text-gray-400 text-sm font-medium">{routine.emoji} {routine.title}</p>
        <motion.button whileTap={{ scale: 0.88 }} onClick={() => navigate(-1)} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center">
          <X size={16} className="text-gray-400" />
        </motion.button>
      </div>

      {/* 진행 도트 */}
      <div className="flex items-center justify-center gap-1.5 pb-2">
        {routineHabits.map((_, i) => (
          <div key={i} className={`rounded-full transition-all ${i === idx ? 'w-5 h-1.5 bg-green-400' : i < idx ? 'w-1.5 h-1.5 bg-green-600' : 'w-1.5 h-1.5 bg-gray-700'}`} />
        ))}
      </div>

      {/* 메인 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
        <AnimatePresence mode="wait">
          <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center gap-4">
            {/* 이모지 */}
            <span className="text-6xl">{current?.emoji}</span>
            {/* 이름 */}
            <h2 className="text-2xl font-bold text-white text-center">{current?.title}</h2>
          </motion.div>
        </AnimatePresence>

        {/* 카운트다운 */}
        <motion.p
          key={`${idx}-${timeLeft > 0}`}
          className="text-7xl font-bold text-white tabular-nums tracking-tight"
          animate={{ scale: timeLeft <= 5 && timeLeft > 0 ? [1, 1.05, 1] : 1 }}
          transition={{ duration: 0.3 }}
        >
          {fmt(timeLeft)}
        </motion.p>
        <p className="text-gray-500 text-sm">{getDuration(current?.id ?? '')}초</p>

        {/* 프로그레스 바 */}
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <motion.div className="h-full bg-green-400 rounded-full"
            animate={{ width: `${progress * 100}%` }} transition={{ duration: 1, ease: 'linear' }} />
        </div>

        {/* 다음 습관 */}
        {next ? (
          <p className="text-gray-500 text-sm">다음: {next.emoji} {next.title}</p>
        ) : (
          <p className="text-gray-600 text-sm">마지막 습관이에요</p>
        )}
      </div>

      {/* 컨트롤 */}
      <div className="px-6 pb-6 flex flex-col gap-5">
        <div className="flex items-center justify-center gap-14">
          {/* 정지/재개 */}
          <div className="flex flex-col items-center gap-1.5">
            <motion.button whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              onClick={() => setStatus(s => s === 'running' ? 'paused' : 'running')}
              className="w-13 h-13 w-[52px] h-[52px] rounded-full bg-gray-700 flex items-center justify-center">
              {status === 'running'
                ? <Pause size={22} className="text-white" />
                : <Play size={22} className="text-white" fill="white" />
              }
            </motion.button>
            <span className="text-gray-500 text-xs">{status === 'running' ? '정지' : '재개'}</span>
          </div>

          {/* 완료 */}
          <div className="flex flex-col items-center gap-1.5">
            <motion.button whileTap={{ scale: 0.9 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              onClick={() => advance(false)}
              className="w-[64px] h-[64px] rounded-full bg-green-500 flex items-center justify-center shadow-xl shadow-green-500/30">
              <Check size={30} className="text-white" strokeWidth={2.5} />
            </motion.button>
          </div>

          {/* 스킵 */}
          <div className="flex flex-col items-center gap-1.5">
            <motion.button whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              onClick={() => advance(true)}
              className="w-[52px] h-[52px] rounded-full bg-gray-700 flex items-center justify-center">
              <SkipForward size={22} className="text-white" />
            </motion.button>
            <span className="text-gray-500 text-xs">스킵</span>
          </div>
        </div>

        {/* 예상 종료 시간 */}
        <p className="text-center text-gray-600 text-sm">
          루틴이 <span className="text-gray-300 font-medium">{fmtHHMM(estimatedEnd)}</span>에 끝나요
        </p>
      </div>
    </div>
  );
}
