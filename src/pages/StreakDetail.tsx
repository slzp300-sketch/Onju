import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Shield, X } from 'lucide-react';
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

export default function StreakDetail() {
  const navigate = useNavigate();
  const { faithRoutines, logs } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
  const { shields, syncShields } = useStreakStore();
  const [showShieldInfo, setShowShieldInfo] = useState(false);

  const todayStr = today();
  const { current: streak, best } = calcStreak(faithRoutines, logs, todayStr);

  // 스트릭 동기화 (방패 지급)
  useEffect(() => { syncShields(streak); }, [streak, syncShields]);

  // 이번 주 날짜
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  // 다음 방패까지 남은 일수
  const nextShieldAt = Math.ceil(streak / 5) * 5;
  const daysToShield = nextShieldAt - streak;

  return (
    <div className="fixed inset-0 bg-gray-950 z-50 flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>

      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4">
        <motion.button whileTap={{ scale: 0.88 }} onClick={() => navigate(-1)}
          className="w-9 h-9 rounded-full bg-gray-800 flex items-center justify-center">
          <ChevronLeft size={20} className="text-gray-300" />
        </motion.button>
        <div />
      </div>

      <div className="flex-1 flex flex-col items-center justify-start px-6 pt-4 gap-8 overflow-y-auto">

        {/* 불꽃 + 체크 아이콘 */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="relative"
        >
          <span className="text-7xl">🔥</span>
          <div className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-green-500 flex items-center justify-center shadow-lg">
            <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
              <path d="M1 7L6.5 12.5L17 1" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </motion.div>

        {/* 스트릭 수 */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="text-center">
          <h1 className="text-3xl font-bold text-white">
            <span className="text-green-400">{streak}일</span> 연속 달성!
          </h1>
          {best > streak && (
            <p className="text-gray-500 text-sm mt-1">최고 기록 {best}일</p>
          )}
        </motion.div>

        {/* 이번 주 캘린더 */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="w-full bg-gray-900 rounded-3xl p-5">
          <div className="flex justify-between mb-3">
            {DAY_LABELS.map((label, i) => (
              <span key={i} className={`text-xs font-semibold text-center flex-1 ${i === 0 ? 'text-green-400' : 'text-gray-500'}`}>
                {label}
              </span>
            ))}
          </div>
          <div className="flex justify-between">
            {weekDays.map((d, i) => {
              const ds = format(d, 'yyyy-MM-dd');
              const isFuture = d > new Date(new Date().setHours(23, 59, 59, 999));
              const isToday = ds === todayStr;
              const completed = !isFuture && isDayCompleted(faithRoutines, logs, habits, habitLogs, ds);

              return (
                <div key={ds} className="flex-1 flex items-center justify-center">
                  <motion.div
                    initial={{ scale: 0.6 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.05, type: 'spring', stiffness: 400, damping: 25 }}
                    className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      completed ? 'bg-green-500'
                      : isToday ? 'border-2 border-gray-600 bg-gray-800'
                      : isFuture ? 'bg-gray-800'
                      : 'bg-gray-800'
                    }`}
                  >
                    {completed ? (
                      <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                        <path d="M1 5.5L5 9.5L13 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span className={`text-xs font-bold ${isToday ? 'text-white' : 'text-gray-600'}`}>
                        {format(d, 'd')}
                      </span>
                    )}
                  </motion.div>
                </div>
              );
            })}
          </div>

          {/* 안내 메시지 */}
          <p className="text-gray-500 text-xs text-center mt-4 leading-relaxed">
            {streak > 0
              ? `오늘을 포함해 ${streak}일 연속 달성 중이에요`
              : '오늘 루틴을 완료하면 연속 달성이 시작돼요'}
          </p>
        </motion.div>

        {/* 방패 */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
          className="w-full">
          <button
            onClick={() => setShowShieldInfo(true)}
            className="w-full flex items-center gap-3 bg-gray-900 rounded-2xl px-5 py-4"
          >
            <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <Shield size={20} className="text-blue-400" />
            </div>
            <div className="flex-1 text-left">
              <p className="text-white text-sm font-semibold">내가 가진 방패: {shields}개</p>
              <p className="text-gray-500 text-xs mt-0.5">
                {daysToShield > 0
                  ? `${daysToShield}일 더 달성하면 방패 1개`
                  : '방패를 획득했어요!'}
              </p>
            </div>
            <div className="flex gap-1.5">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className={`w-7 h-7 rounded-full flex items-center justify-center ${i < shields ? 'bg-blue-500' : 'bg-gray-700'}`}>
                  <Shield size={14} className={i < shields ? 'text-white' : 'text-gray-600'} />
                </div>
              ))}
            </div>
          </button>
        </motion.div>

        {/* 다음 방패까지 프로그레스 */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
          className="w-full bg-gray-900 rounded-2xl px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-xs font-medium">다음 방패까지</span>
            <span className="text-gray-400 text-xs">{streak % 5}/5일</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(streak % 5) / 5 * 100}%` }}
              transition={{ duration: 0.8, delay: 0.5 }}
            />
          </div>
          <p className="text-gray-600 text-xs mt-2 text-center">
            5일 연속 달성마다 방패 1개 획득 · 최대 2개 보유
          </p>
        </motion.div>

      </div>

      {/* 방패 설명 모달 */}
      <AnimatePresence>
        {showShieldInfo && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 z-10" onClick={() => setShowShieldInfo(false)} />
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 350, damping: 32 }}
              className="absolute bottom-0 left-0 right-0 z-20 bg-gray-800 rounded-t-3xl px-6 pt-6 pb-10"
            >
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center">
                    <Shield size={24} className="text-blue-400" />
                  </div>
                  <h2 className="text-white text-lg font-bold">연속 기록 보호 방패</h2>
                </div>
                <button onClick={() => setShowShieldInfo(false)} className="text-gray-500">
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
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                    <p className="text-gray-300 text-sm leading-relaxed">{text}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 bg-gray-700 rounded-2xl px-4 py-3">
                <Shield size={16} className="text-blue-400" />
                <span className="text-white text-sm font-semibold">내가 가진 방패: {shields}개</span>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
