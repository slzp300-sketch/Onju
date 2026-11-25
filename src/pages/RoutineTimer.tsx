import { useState, useRef } from 'react';
import { useElapsedTimer } from '../hooks/useElapsedTimer';
import { useUIStore } from '../store/uiStore';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import EmptyState from '../components/ui/EmptyState';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pause, Play, SkipForward, Check, Timer } from '../icons';
import confetti from 'canvas-confetti';
import { useHabitStore } from '../store/habitStore';
import type { Habit, PersonalRoutine } from '../types';
import OnjuIcon from '../components/ui/OnjuIcon';
import { isHabitDue } from '../utils/scheduledItems';
import { today } from '../utils/date';

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
  const { personalRoutines, habits } = useHabitStore();

  const routine = personalRoutines.find(r => r.id === id);
  const routineHabits = (routine?.habitIds ?? [])
    .map(hId => habits.find(h => h.id === hId))
    .filter((habit): habit is Habit => !!habit && isHabitDue(habit, today()));

  const dataHydrated = useUIStore(s => s.dataHydrated);
  if (!routine || routineHabits.length === 0) {
    if (!dataHydrated) return <LoadingSpinner />;
    return <EmptyState title="실행할 습관이 없어요" description="오늘 예정된 습관이 없거나 루틴이 삭제되었어요. 홈에서 다시 확인해주세요."
      action={<button className="min-h-11 px-4 text-primary font-bold" onClick={() => navigate('/', { replace: true })}>홈으로</button>} />;
  }
  return <RoutineSession key={`${routine.id}:${routineHabits.map(h => h.id).join(',')}`} routine={routine} routineHabits={routineHabits} />;
}

function RoutineSession({ routine, routineHabits }: { routine: PersonalRoutine; routineHabits: Habit[] }) {
  const navigate = useNavigate();
  const { toggleHabitLog, isHabitCompleted } = useHabitStore();
  const getDuration = (habitId: string) => Math.max(1, routine.habitDurations?.[habitId] ?? DEFAULT_SECS);
  const [idx, setIdx] = useState(0);
  const [status, setStatus] = useState<Status>('running');
  const [elapsed, setElapsed] = useState<Record<string, number | null>>({});
  const advancedStep = useRef(-1);
  const advance = (skipped: boolean, seconds: number) => {
    if (advancedStep.current === idx || status === 'done') return;
    advancedStep.current = idx;
    const currentHabit = routineHabits[idx];
    const result = { ...elapsed, [currentHabit.id]: skipped ? null : seconds };
    setElapsed(result);
    if (!skipped && !isHabitCompleted(currentHabit.id)) toggleHabitLog(currentHabit.id);
    if (idx >= routineHabits.length - 1) {
      setStatus('done');
      if (Object.values(result).some(value => value !== null)) {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.25 }, colors: ['#2f9e60', '#1f8a4c', '#f59e0b'] });
      }
    } else {
      setIdx(idx + 1);
      setStatus('running');
    }
  };
  const timer = useElapsedTimer(getDuration(routineHabits[idx].id), status === 'running', seconds => advance(false, seconds), idx);
  const timeLeft = Math.max(0, getDuration(routineHabits[idx].id) - timer.elapsed);
  // eslint-disable-next-line react-hooks/purity
  const estimatedEnd = new Date(Date.now() + (routineHabits.slice(idx + 1).reduce((sum, h) => sum + getDuration(h.id), 0) + timeLeft) * 1000);
  const current = routineHabits[idx];
  const next = routineHabits[idx + 1];
  const planned = getDuration(current?.id ?? '');
  const progress = planned > 0 ? Math.min((planned - timeLeft) / planned, 1) : 0;

  /* ── 완료 화면 ── */
  if (status === 'done') {
    const totalActual = Object.values(elapsed).reduce<number>((sum, value) => sum + (value ?? 0), 0);
    return (
      <div className="focus-paper fixed inset-0 z-50 flex flex-col items-center justify-between px-6"
        style={{ paddingTop: 'max(3rem, var(--app-safe-top))', paddingBottom: 'max(2rem, var(--app-safe-bottom))' }}>

        <div className="flex-1 flex flex-col items-center justify-center gap-6 w-full">
          {/* 성공 아이콘 */}
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            className="w-20 h-20 rounded-full bg-positive flex items-center justify-center shadow-lg shadow-positive/30">
            <Check size={38} className="text-white" strokeWidth={2.5} />
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="text-title3 font-bold text-white">루틴을 마쳤어요</motion.h1>

          {/* 총 소요 시간 */}
          <div className="w-full bg-cool-25 rounded-xl px-5 py-4 text-center">
            <p className="text-cool-60 text-body2 inline-flex items-center gap-1"><Timer size={14} strokeWidth={1.9} /> 총 소요시간 <span className="text-white font-bold">{totalActual}초</span></p>
          </div>

          {/* 습관별 결과 */}
          <div className="w-full flex flex-col gap-3">
            {routineHabits.map((h, i) => {
              const skipped = elapsed[h.id] === null; const actual = elapsed[h.id] ?? 0;
              const plan = getDuration(h.id);
              const diff = actual - plan;
              return (
                <motion.div key={h.id}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.07 }}
                  className="flex items-center justify-between">
                  <span className="text-white text-body2 flex items-center gap-1.5"><OnjuIcon emoji={h.emoji} size={22} /> {h.title}</span>
                  <div className="text-right">
                    <span className="text-white text-body2 font-semibold">{skipped ? '건너뜀' : `${actual}초`}</span>
                    {!skipped && <span className={`text-caption1 ml-1.5 ${diff <= 0 ? 'text-positive' : 'text-negative'}`}>
                      ({diff > 0 ? '+' : ''}{diff}초)
                    </span>}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* 버튼 */}
        <div className="w-full flex flex-col gap-3">
          <motion.button whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
            onClick={() => navigate('/', { replace: true })}
            className="w-full py-4 rounded-xl bg-positive text-white font-bold text-body1 shadow-lg shadow-positive/20">
            완료
          </motion.button>
          <button onClick={() => navigate(`/personal-routines/edit/${routine.id}`)}
            className="text-cool-50 text-body2 text-center py-2 hover:text-cool-90 transition-colors">
            수정하기
          </button>
        </div>
      </div>
    );
  }

  /* ── 타이머 실행 화면 ── */
  return (
    <div className="focus-paper fixed inset-0 z-50 flex flex-col"
      style={{ paddingTop: 'var(--app-safe-top)', paddingBottom: 'var(--app-safe-bottom)' }}>

      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4">
        <div className="w-8" />
        <p className="text-cool-60 text-body2 font-medium flex items-center gap-1.5"><OnjuIcon emoji={routine.emoji} size={22} /> {routine.title}</p>
        <motion.button whileTap={{ scale: 0.88 }} onClick={() => navigate('/', { replace: true })} aria-label="타이머 닫기" className="focus-close-button flex items-center justify-center">
          <X size={16} className="text-cool-60" />
        </motion.button>
      </div>

      {/* 진행 도트 */}
      <div className="flex items-center justify-center gap-1.5 pb-2">
        {routineHabits.map((_, i) => (
          <div key={i} className={`rounded-full transition-all ${i === idx ? 'w-5 h-1.5 bg-positive' : i < idx ? 'w-1.5 h-1.5 bg-green-600' : 'w-1.5 h-1.5 bg-cool-30'}`} />
        ))}
      </div>

      {/* 메인 */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8">
        <AnimatePresence mode="wait">
          <motion.div key={idx} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center gap-4">
            {/* 이모지 */}
            <OnjuIcon emoji={current?.emoji} size={76} />
            {/* 이름 */}
            <h2 className="text-title3 font-bold text-white text-center">{current?.title}</h2>
          </motion.div>
        </AnimatePresence>

        {/* 카운트다운 */}
        <motion.p
          key={`${idx}-${timeLeft > 0}`}
          className="focus-timer-number text-7xl font-bold text-white tabular-nums tracking-tight"
          animate={{ scale: timeLeft <= 5 && timeLeft > 0 ? [1, 1.05, 1] : 1 }}
          transition={{ duration: 0.3 }}
        >
          {fmt(timeLeft)}
        </motion.p>
        <p className="text-cool-50 text-body2">{getDuration(current?.id ?? '')}초</p>

        {/* 프로그레스 바 */}
        <div className="w-full h-1.5 bg-cool-30 rounded-full overflow-hidden">
          <motion.div className="h-full bg-positive rounded-full"
            animate={{ width: `${progress * 100}%` }} transition={{ duration: 1, ease: 'linear' }} />
        </div>

        {/* 다음 습관 */}
        {next ? (
          <p className="text-cool-50 text-body2 flex items-center gap-1.5">다음: <OnjuIcon emoji={next.emoji} size={22} /> {next.title}</p>
        ) : (
          <p className="text-cool-50 text-body2">마지막 습관이에요</p>
        )}
      </div>

      {/* 컨트롤 */}
      <div className="px-6 pb-6 flex flex-col gap-5">
        <div className="flex items-center justify-center gap-14">
          {/* 정지/재개 */}
          <div className="flex flex-col items-center gap-1.5">
            <motion.button whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              onClick={() => setStatus(s => s === 'running' ? 'paused' : 'running')} aria-label={status === 'running' ? '타이머 일시정지' : '타이머 재개'}
              className="w-13 h-13 w-[52px] h-[52px] rounded-full bg-cool-30 flex items-center justify-center">
              {status === 'running'
                ? <Pause size={22} className="text-white" />
                : <Play size={22} className="text-white" fill="white" />
              }
            </motion.button>
            <span className="text-cool-50 text-caption1">{status === 'running' ? '정지' : '재개'}</span>
          </div>

          {/* 완료 */}
          <div className="flex flex-col items-center gap-1.5">
            <motion.button whileTap={{ scale: 0.9 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              onClick={() => advance(false, timer.stop())} aria-label="현재 습관 완료"
              className="w-[64px] h-[64px] rounded-full bg-positive flex items-center justify-center shadow-xl shadow-positive/30">
              <Check size={30} className="text-white" strokeWidth={2.5} />
            </motion.button>
          </div>

          {/* 스킵 */}
          <div className="flex flex-col items-center gap-1.5">
            <motion.button whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              onClick={() => advance(true, timer.stop())} aria-label="현재 습관 건너뛰기"
              className="w-[52px] h-[52px] rounded-full bg-cool-30 flex items-center justify-center">
              <SkipForward size={22} className="text-white" />
            </motion.button>
            <span className="text-cool-50 text-caption1">건너뛰기</span>
          </div>
        </div>

        {/* 예상 종료 시간 */}
        <p className="text-center text-cool-50 text-body2">
          {status === 'paused' ? '일시정지 중 · 쉬는 시간은 기록에 포함하지 않아요' : <>예상 종료 <span className="text-cool-90 font-medium">{fmtHHMM(estimatedEnd)}</span></>}
        </p>
      </div>
    </div>
  );
}
