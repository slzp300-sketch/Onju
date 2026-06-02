import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Shield, X, Flame } from 'lucide-react';
import { format, startOfWeek, addDays } from 'date-fns';
import { useRoutineStore } from '../store/routineStore';
import { useHabitStore } from '../store/habitStore';
import { useStreakStore } from '../store/streakStore';
import { calcStreak } from '../utils/completion';
import { today } from '../utils/date';
import type { DailyRoutine, RoutineLog, Habit } from '../types';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function isDayCompleted(
  faithRoutines: DailyRoutine[],
  logs: RoutineLog[],
  habits: Habit[],
  habitLogs: { habitId: string; date: string; completed: boolean }[],
  dateStr: string
): boolean {
  const faithOk = faithRoutines.length === 0 || (() => {
    const done = new Set(logs.filter(l => l.date === dateStr && l.completed).map(l => l.routineId));
    return faithRoutines.every(r => done.has(r.id));
  })();
  const habitOk = habits.length === 0 || (() => {
    const done = habitLogs.filter(l => l.date === dateStr && l.completed).length;
    return done >= habits.length;
  })();
  return faithOk && habitOk;
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } } as const;
const itemV = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 28 } } } as const;

export default function StreakDetail() {
  const navigate = useNavigate();
  const { faithRoutines, logs } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
  const { shields, syncShields } = useStreakStore();
  const [showShieldInfo, setShowShieldInfo] = useState(false);

  const todayStr = today();
  const { current: streak, best } = calcStreak(faithRoutines, logs, todayStr);

  useEffect(() => { syncShields(streak); }, [streak, syncShields]);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const nextShieldAt = Math.ceil((streak + 1) / 5) * 5;
  const daysToShield = nextShieldAt - streak;
  const shieldProgress = (streak % 5) / 5;

  return (
    <>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="flex flex-col pb-8"
      >
        {/* 헤더 */}
        <motion.div variants={itemV} className="flex items-center px-4 pt-5 pb-3 gap-2">
          <motion.button
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.1 }}
            onClick={() => navigate(-1)}
            className="p-1 -ml-1 text-label-alt"
          >
            <ChevronLeft size={24} />
          </motion.button>
          <h1 className="text-heading2 font-bold text-label-strong font-brand">연속 달성</h1>
        </motion.div>

        {/* 히어로 — 스트릭 수 */}
        <motion.div variants={itemV} className="mx-4 mb-4">
          <div className="bg-surface rounded-xl shadow-emphasize px-6 py-8 flex flex-col items-center gap-3">
            <motion.span
              animate={streak > 0 ? { scale: [1, 1.12, 1] } : {}}
              transition={{ repeat: Infinity, repeatDelay: 2.5, duration: 0.45 }}
              className="text-6xl leading-none"
            >
              🔥
            </motion.span>

            <div className="text-center">
              <p className="text-display2 font-bold text-cautionary font-brand leading-none">
                {streak}일
              </p>
              <p className="text-label1 text-label-alt mt-1">연속 달성 중이에요</p>
            </div>

            {/* 현재 / 최고 */}
            <div className="flex gap-6 mt-2">
              <div className="text-center">
                <p className="text-caption1 text-label-assistive mb-0.5">현재</p>
                <p className="text-body1 font-bold text-cautionary">{streak}일</p>
              </div>
              <div className="w-px bg-line-soft" />
              <div className="text-center">
                <p className="text-caption1 text-label-assistive mb-0.5">최고</p>
                <p className="text-body1 font-bold text-label">{best}일</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* 이번 주 캘린더 */}
        <motion.div variants={itemV} className="mx-4 mb-4">
          <div className="bg-surface rounded-xl shadow-emphasize px-4 py-4">
            <p className="text-label1 font-bold text-label-strong mb-4">이번 주 달성 현황</p>

            {/* 요일 */}
            <div className="flex justify-between mb-2">
              {DAY_LABELS.map((label, i) => {
                const ds = format(weekDays[i], 'yyyy-MM-dd');
                const isToday = ds === todayStr;
                return (
                  <span
                    key={i}
                    className={`text-caption2 font-semibold text-center flex-1 ${isToday ? 'text-primary' : 'text-label-assistive'}`}
                  >
                    {label}
                  </span>
                );
              })}
            </div>

            {/* 날짜 원 */}
            <div className="flex justify-between">
              {weekDays.map((d, i) => {
                const ds = format(d, 'yyyy-MM-dd');
                const isFuture = d > new Date(new Date().setHours(23, 59, 59, 999));
                const isToday = ds === todayStr;
                const completed = !isFuture && isDayCompleted(faithRoutines, logs, habits, habitLogs, ds);

                return (
                  <div key={ds} className="flex-1 flex items-center justify-center">
                    <motion.div
                      initial={{ scale: 0.7 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1 + i * 0.04, type: 'spring', stiffness: 400, damping: 26 }}
                      className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        completed
                          ? 'bg-positive shadow-sm'
                          : isToday
                          ? 'border-2 border-primary bg-primary-soft'
                          : isFuture
                          ? 'bg-fill'
                          : 'bg-fill-strong'
                      }`}
                    >
                      {completed ? (
                        <svg width="13" height="10" viewBox="0 0 13 10" fill="none">
                          <path d="M1 5L4.5 8.5L12 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <span className={`text-caption1 font-bold ${
                          isToday ? 'text-primary' : isFuture ? 'text-label-assistive' : 'text-label-alt'
                        }`}>
                          {format(d, 'd')}
                        </span>
                      )}
                    </motion.div>
                  </div>
                );
              })}
            </div>

            <p className="text-caption1 text-label-assistive text-center mt-4">
              {streak > 0
                ? `오늘을 포함해 ${streak}일 연속 달성 중이에요`
                : '오늘 루틴을 완료하면 연속 달성이 시작돼요'}
            </p>
          </div>
        </motion.div>

        {/* 방패 카드 */}
        <motion.div variants={itemV} className="mx-4 mb-4">
          <button
            onClick={() => setShowShieldInfo(true)}
            className="w-full bg-surface rounded-xl shadow-emphasize px-4 py-4 flex items-center gap-3 hover:bg-fill transition-colors text-left"
          >
            <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center flex-shrink-0">
              <Shield size={22} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-label1 font-bold text-label-strong">연속 기록 보호 방패</p>
              <p className="text-caption1 text-label-alt mt-0.5">
                {daysToShield > 0 ? `${daysToShield}일 더 달성하면 방패 1개 획득` : '방패를 획득했어요!'}
              </p>
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              {Array.from({ length: 2 }).map((_, i) => (
                <div
                  key={i}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    i < shields ? 'bg-primary shadow-sm' : 'bg-fill'
                  }`}
                >
                  <Shield size={15} className={i < shields ? 'text-white' : 'text-label-assistive'} />
                </div>
              ))}
            </div>
          </button>
        </motion.div>

        {/* 다음 방패까지 프로그레스 */}
        <motion.div variants={itemV} className="mx-4">
          <div className="bg-surface rounded-xl shadow-emphasize px-4 py-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Flame size={16} className="text-cautionary" />
                <p className="text-label1 font-bold text-label-strong">다음 방패까지</p>
              </div>
              <span className="text-caption1 text-label-alt font-medium">{streak % 5}/5일</span>
            </div>

            <div className="h-2.5 bg-fill rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${shieldProgress * 100}%` }}
                transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' }}
              />
            </div>

            <div className="flex justify-between mt-2">
              <p className="text-caption1 text-label-assistive">5일 연속마다 방패 획득</p>
              <p className="text-caption1 text-label-assistive">최대 2개 보유</p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* 방패 설명 바텀시트 */}
      <AnimatePresence>
        {showShieldInfo && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/40 z-40"
              onClick={() => setShowShieldInfo(false)}
            />
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-50 bg-surface rounded-t-3xl px-6 pt-6 pb-10 shadow-overlay"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center">
                    <Shield size={22} className="text-primary" />
                  </div>
                  <h2 className="text-headline1 font-bold text-label-strong">연속 기록 보호 방패</h2>
                </div>
                <button onClick={() => setShowShieldInfo(false)} className="text-label-assistive hover:text-label-alt transition-colors">
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-3 mb-6">
                {[
                  '방패 1개는 연속 달성 기록 하루를 보호해요',
                  '5일 연속 달성을 하면 방패 1개를 드려요',
                  '방패는 한 번에 최대 2개까지 가질 수 있어요',
                ].map((text, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    <p className="text-body2 text-label leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 bg-primary-soft rounded-xl px-4 py-3">
                <Shield size={18} className="text-primary flex-shrink-0" />
                <span className="text-body2 font-semibold text-primary">현재 보유 방패: {shields}개</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
