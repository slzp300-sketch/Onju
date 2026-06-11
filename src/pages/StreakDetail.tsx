import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Shield, X, Flame, Check } from 'lucide-react';
import { format, getDay } from 'date-fns';
import { useRoutineStore } from '../store/routineStore';
import { useHabitStore } from '../store/habitStore';
import { useStreakStore } from '../store/streakStore';
import { calcStreak } from '../utils/completion';
import { today, getWeekDays, ALL_DAY_LABELS } from '../utils/date';
import { useSettingsStore } from '../store/settingsStore';
import StampOverlay from '../components/ui/StampOverlay';
import TreeVisual from '../components/tree/TreeVisual';
import { useTreeGrowth } from '../hooks/useTreeGrowth';
import { STAGE_NAMES } from '../utils/treeGrowth';
import type { DailyRoutine, RoutineLog, Habit } from '../types';


function isDayPerfect(
  faithRoutines: DailyRoutine[],
  logs: RoutineLog[],
  habits: Habit[],
  habitLogs: { habitId: string; date: string; completed: boolean; skipped?: boolean; substitute?: boolean }[],
  dateStr: string
): boolean {
  // 루틴도 습관도 없으면 달성 아님
  if (faithRoutines.length === 0 && habits.length === 0) return false;

  // 신앙루틴: 완료 또는 쉬어가기 모두 달성으로 처리
  const faithOk = faithRoutines.length === 0 || (() => {
    const done = new Set(
      logs.filter(l => l.date === dateStr && (l.completed || l.skipped)).map(l => l.routineId)
    );
    return faithRoutines.every(r => done.has(r.id));
  })();

  // 습관: 완료 또는 쉬어가기 모두 달성으로 처리
  const habitOk = habits.length === 0 || (() => {
    const done = habitLogs.filter(l => l.date === dateStr && (l.completed || l.skipped || l.substitute)).length;
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
  const [showStreakStamp, setShowStreakStamp] = useState(false);
  const prevStreak = useRef(0);

  const todayStr = today();
  const { current: streak, best } = calcStreak(faithRoutines, logs, todayStr);

  useEffect(() => { syncShields(streak); }, [streak, syncShields]);

  // 스트릭 5일 단위 달성 시 스탬프
  useEffect(() => {
    if (streak > 0 && streak % 5 === 0 && streak !== prevStreak.current) {
      setShowStreakStamp(true);
    }
    prevStreak.current = streak;
   
  }, [streak]);

  const { weekStartDay } = useSettingsStore();
  const weekDays = getWeekDays(new Date(), weekStartDay as 0 | 1);

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
          <h1 className="text-heading2 font-bold text-label-strong font-brand">나의 나무</h1>
        </motion.div>

        {/* 나의 나무 — 성장 현황 */}
        <motion.div variants={itemV} className="mx-4 mb-4">
          <MyTreeCard />
        </motion.div>

        {/* 히어로 — 스트릭 수 */}
        <motion.div variants={itemV} className="mx-4 mb-4">
          <div className="bg-surface rounded-xl border border-line px-6 py-8 flex flex-col items-center gap-3">
            <motion.span
              animate={streak > 0 ? { scale: [1, 1.12, 1] } : {}}
              transition={{ repeat: Infinity, repeatDelay: 2.5, duration: 0.45 }}
              className="leading-none"
            >
              <Flame size={60} strokeWidth={1.9} className="text-cautionary" />
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
          <div className="bg-surface rounded-xl border border-line px-4 py-4">
            <p className="text-label1 font-bold text-label-strong mb-4">이번 주 달성 현황</p>

            {/* 요일 + 날짜 타일 */}
            <div className="flex gap-1.5">
              {weekDays.map((d, i) => {
                const ds = format(d, 'yyyy-MM-dd');
                const isFuture = d > new Date(new Date().setHours(23, 59, 59, 999));
                const isToday = ds === todayStr;
                const completed = !isFuture && isDayPerfect(faithRoutines, logs, habits, habitLogs, ds);

                return (
                  <div key={ds} className="flex-1 flex flex-col items-center gap-1.5">
                    {/* 요일 */}
                    <span className={`text-caption2 font-bold ${isToday ? 'text-primary' : 'text-label-assistive'}`}>
                      {ALL_DAY_LABELS[getDay(d)]}
                    </span>

                    {/* 타일 */}
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.05 + i * 0.04, type: 'spring', stiffness: 420, damping: 26 }}
                      className={`relative w-full rounded-2xl flex flex-col items-center justify-center gap-1 py-3 ${
                        completed
                          ? 'bg-positive shadow-sm'
                          : isToday
                          ? 'bg-primary-soft border-2 border-primary'
                          : isFuture
                          ? 'bg-fill'
                          : 'bg-fill-strong'
                      }`}
                    >
                      <span className={`text-label1 font-bold leading-none ${
                        completed ? 'text-white'
                        : isToday ? 'text-primary'
                        : isFuture ? 'text-label-assistive'
                        : 'text-label-alt'
                      }`}>
                        {format(d, 'd')}
                      </span>
                      <span className="leading-none flex items-center justify-center h-[14px]">
                        {completed ? <Check size={14} strokeWidth={2.4} className="text-white" />
                          : isToday ? '·'
                          : isFuture ? ''
                          : <X size={14} strokeWidth={2.4} className="text-label-alt" />}
                      </span>

                      {/* 달성 도장 — 100% 달성 시 등장, 취소 시 사라짐 */}
                      <AnimatePresence>
                        {completed && (
                          <motion.div
                            key="stamp"
                            initial={{ scale: 1.8, opacity: 0, rotate: -18 }}
                            animate={{ scale: 1, opacity: 1, rotate: -13 }}
                            exit={{ scale: 0.6, opacity: 0, transition: { duration: 0.2 } }}
                            transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                          >
                            <svg width="52" height="52" viewBox="0 0 100 100">
                              <circle cx="50" cy="50" r="46" fill="#1f8a4c" fillOpacity="0.2" stroke="white" strokeWidth="6" opacity="0.95"/>
                              <circle cx="50" cy="50" r="35" fill="none" stroke="white" strokeWidth="2.5" opacity="0.8"/>
                              <text x="50" y="54" textAnchor="middle" dominantBaseline="middle"
                                fill="white" fontSize="18" fontWeight="900"
                                style={{ fontFamily: 'system-ui, sans-serif' }}>완료</text>
                            </svg>
                          </motion.div>
                        )}
                      </AnimatePresence>
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
            className="w-full bg-surface rounded-xl border border-line px-4 py-4 flex items-center gap-3 hover:bg-fill transition-colors text-left"
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
          <div className="bg-surface rounded-xl border border-line px-4 py-4">
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

      {/* 스트릭 5일 단위 달성 스탬프 */}
      <StampOverlay
        show={showStreakStamp}
        label={`${streak}일`}
        sublabel="연속 달성!"
        color="#e07b27"
        rotation={10}
        onComplete={() => setShowStreakStamp(false)}
      />
    </>
  );
}

/** 나의 나무 카드 — 성장 포인트·단계·건강도 요약 */
function MyTreeCard() {
  const growth = useTreeGrowth();
  const healthText =
    growth.health === 'healthy' ? '나무가 싱싱하게 자라고 있어요 🌿'
    : growth.health === 'dry' ? '나무가 목말라요 — 오늘 루틴으로 물을 줘요 💧'
    : '나무가 시들고 있어요 — 다시 시작해봐요 🍂';

  return (
    <div
      className="rounded-2xl border border-line px-5 pt-5 pb-4 flex flex-col items-center"
      style={{ background: 'var(--gradient-hero)' }}
    >
      <TreeVisual stage={growth.stage} health={growth.health} size={150} />
      <p className="text-heading2 font-bold text-label-strong mt-1">{growth.stageName}</p>
      <p className="text-caption1 text-label-alt mt-0.5">{healthText}</p>

      {/* 다음 단계 진행 */}
      <div className="w-full mt-4">
        <div className="flex justify-between mb-1.5">
          <span className="text-caption1 font-semibold text-label-alt tabular-nums">{growth.points}pt</span>
          <span className="text-caption1 text-label-assistive tabular-nums">
            {growth.nextThreshold !== null
              ? `다음 단계(${STAGE_NAMES[(growth.stage + 1) as 1 | 2 | 3 | 4]})까지 ${growth.nextThreshold - growth.points}pt`
              : '최고 단계에 도달했어요!'}
          </span>
        </div>
        <div className="h-2 rounded-full bg-fill-strong overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: 'var(--gradient-canopy)' }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(growth.progressToNext * 100)}%` }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}
