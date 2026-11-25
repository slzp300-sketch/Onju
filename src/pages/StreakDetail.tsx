import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, X, Flame, Check } from '../icons';
import { format, getDay } from 'date-fns';
import { useRoutineStore } from '../store/routineStore';
import { useHabitStore } from '../store/habitStore';
import { calcStreak } from '../utils/completion';
import { today, getWeekDays, ALL_DAY_LABELS } from '../utils/date';
import { useSettingsStore } from '../store/settingsStore';
import StampOverlay from '../components/ui/StampOverlay';
import TreeVisual from '../components/tree/TreeVisual';
import { useTreeGrowth } from '../hooks/useTreeGrowth';
import { STAGE_NAMES } from '../utils/treeGrowth';
import { getDayCompletion } from '../utils/dayCompletion';


const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } } as const;
const itemV = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 28 } } } as const;

export default function StreakDetail() {
  const navigate = useNavigate();
  const { faithRoutines, logs } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
  const [showStreakStamp, setShowStreakStamp] = useState(false);
  const prevStreak = useRef(0);

  const todayStr = today();
  const { current: streak, best } = calcStreak(faithRoutines, logs, todayStr, habits, habitLogs);


  // 스트릭 5일 단위 달성 시 스탬프
  useEffect(() => {
    if (streak > 0 && streak % 5 === 0 && streak !== prevStreak.current) {
      setShowStreakStamp(true);
    }
    prevStreak.current = streak;
   
  }, [streak]);

  const { weekStartDay } = useSettingsStore();
  const weekDays = getWeekDays(new Date(), weekStartDay as 0 | 1);

  return (
    <>
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="review-paper flex min-h-full flex-col pb-8"
      >
        {/* 헤더 */}
        <motion.div variants={itemV} className="flex items-center px-4 pt-5 pb-3 gap-2">
          <motion.button
            whileTap={{ scale: 0.92 }}
            transition={{ duration: 0.1 }}
            onClick={() => navigate(-1)}
            aria-label="뒤로 가기"
            className="paper-back-button text-label-alt"
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
          <div className="review-paper-card px-6 py-8 flex flex-col items-center gap-3">
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
              <p className="text-label1 text-label-alt mt-1">연속 실천 기록이에요</p>
              <p className="mt-2 text-caption1 text-label-alt leading-relaxed">개인·신앙의 예정 항목을 절반 이상 기록한 날을 세어요.<br />완료·대체·쉼 포함 · 예정 없는 날 제외 · 최근 1년 기준</p>
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
          <div className="review-paper-card px-4 py-4">
            <p className="text-label1 font-bold text-label-strong mb-4">이번 주 달성 현황</p>

            {/* 요일 + 날짜 타일 */}
            <div className="flex gap-1.5">
              {weekDays.map((d, i) => {
                const ds = format(d, 'yyyy-MM-dd');
                const isFuture = d > new Date(new Date().setHours(23, 59, 59, 999));
                const isToday = ds === todayStr;
                const day = getDayCompletion(ds, habits, habitLogs, faithRoutines, logs);
                const completed = !isFuture && day.state === 'perfect';

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
                          : day.state === 'rest' ? '—'
                          : day.state === 'partial' ? '·'
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
                ? `예정된 날 기준 ${streak}일 연속 기록 중이에요`
                : '오늘 예정 항목의 절반 이상을 기록하면 시작돼요'}
            </p>
          </div>
        </motion.div>


      </motion.div>

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
            transition={{ duration: 0.2, ease: 'easeOut' }}
          />
        </div>
      </div>
    </div>
  );
}
