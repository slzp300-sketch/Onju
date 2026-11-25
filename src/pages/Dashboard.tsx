import SegmentedControl from '../components/ui/SegmentedControl';
import { useLocalNow } from '../hooks/useLocalNow';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Target, BookOpen, Flame, Clock, Lock, ChevronRight } from '../icons';
import TodoTab from '../components/tabs/TodoTab';
import { motion, AnimatePresence } from 'framer-motion';
import { format, getDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import confetti from 'canvas-confetti';
import { useRoutineStore } from '../store/routineStore';
import { useHabitStore } from '../store/habitStore';
import { useTodoStore } from '../store/todoStore';
import { useGoalStore } from '../store/goalStore';
import { useAuthStore } from '../store/authStore';
import { calcStreak } from '../utils/completion';
import { isSunday, currentWeek, currentYear, isReviewCompleted, getWeekRangeText, getWeekDays, ALL_DAY_LABELS, yesterday, isEditableDay, isWithinGrace } from '../utils/date';
import { useSettingsStore } from '../store/settingsStore';
import { getGoalRate } from '../utils/goalProgress';
import { getDayCompletion } from '../utils/dayCompletion';
import StampOverlay from '../components/ui/StampOverlay';
import ReviewRecoveryBanner from '../components/review/ReviewRecoveryBanner';
import ReviewBanner from '../components/review/ReviewBanner';
import { useReviews } from '../hooks/useReviews';
import PersonalTab from '../components/tabs/PersonalTab';
import FaithTab from '../components/tabs/FaithTab';
import TreeHero from '../components/tree/TreeHero';
import { CONFETTI_FOREST } from '../components/tree/treePalette';


type TabType = 'personal' | 'faith' | 'todo';
const TABS: { key: TabType; label: string }[] = [
  { key: 'personal', label: '개인' },
  { key: 'faith', label: '신앙' },
  { key: 'todo', label: '할 일' },
];

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } } as const;
const itemV = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 28 } } } as const;

export default function Dashboard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const { weekStartDay, graceEndHour } = useSettingsStore();
  const { faithRoutines, logs } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
  const { todos } = useTodoStore();
  const { monthlyGoals } = useGoalStore();
  const now = useLocalNow();
  const todayStr = format(now, 'yyyy-MM-dd');
  const prevCompleteRef = useRef(false);
  const [activeTab, setActiveTab] = useState<TabType>(TABS.some(t => t.key === location.state?.homeTab) ? location.state.homeTab : 'personal');
  const [chosenDay, setChosenDay] = useState<string | null>(location.state?.homeDate ?? null);
  const selectedDay = chosenDay && chosenDay <= todayStr ? chosenDay : todayStr;
  const [hideCompleted, setHideCompleted] = useState(true);
  const selectTab = (tab: TabType) => {
    setActiveTab(tab);
    navigate('.', { replace: true, state: { ...location.state, homeTab: tab, homeDate: chosenDay } });
  };
  const selectDay = (date: string) => {
    const next = date === todayStr ? null : date;
    setChosenDay(next);
    navigate('.', { replace: true, state: { ...location.state, homeTab: activeTab, homeDate: next } });
  };
  const [showPerfectStamp, setShowPerfectStamp] = useState(false);
  const prevTodayRates = useRef<boolean>(false);

  const { data: reviews = [] } = useReviews();

  const { current: streak } = calcStreak(faithRoutines, logs, todayStr, habits, habitLogs);
  const allDone = getDayCompletion(todayStr, habits, habitLogs, faithRoutines, logs).state === 'perfect';

  const CONFETTI_KEY = `onju_confetti_date:${user?.id ?? ''}`;
  useEffect(() => {
    if (allDone && !prevCompleteRef.current) {
      const shownDate = localStorage.getItem(CONFETTI_KEY);
      if (shownDate !== todayStr) {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.3 }, colors: CONFETTI_FOREST });
        localStorage.setItem(CONFETTI_KEY, todayStr);
      }
    }
    prevCompleteRef.current = allDone;
  }, [allDone, CONFETTI_KEY, todayStr]);


  const todayIso = todayStr;
  const activeGoals = monthlyGoals.filter(g => g.endDate >= todayIso);

  // 목표 대표 지표 = 진척도 (전체 기간 중 지킨 비율)
  const goalRate = (goal: typeof activeGoals[0]): number =>
    getGoalRate(goal, habits, habitLogs, faithRoutines, logs, todayIso);
  const todayTodos = todos.filter(t => t.date === selectedDay);
  const doneTodos = todayTodos.filter(t => t.completed).length;
  const weekDays = getWeekDays(now, weekStartDay as 0 | 1);

  const nowMid = new Date(new Date().setHours(23, 59, 59, 999));
  const weekRates = weekDays.map(d => {
    const ds = format(d, 'yyyy-MM-dd');
    const c = getDayCompletion(ds, habits, habitLogs, faithRoutines, logs, d > nowMid);
    return { date: ds, personal: c.personalRate, faith: c.faithRate, state: c.state };
  });

  // 선택한 날짜를 지금 체크할 수 있는지 (오늘 + 유예 구간의 어제)
  const canEdit = isEditableDay(selectedDay, graceEndHour);
  // 유예 구간 동안 어제에 마저 체크할 게 남았는지 (오늘 화면에서 유도용)
  const yesterdayStr = yesterday();
  const yState = weekRates.find(w => w.date === yesterdayStr)?.state;
  const showGraceNudge = selectedDay === todayStr
    && isWithinGrace(graceEndHour)
    && (yState === 'partial' || yState === 'missed');

  const selectedCompletion = getDayCompletion(selectedDay, habits, habitLogs, faithRoutines, logs);
  const badges: Record<TabType, string> = {
    personal: `${selectedCompletion.personalDone}/${selectedCompletion.personalTotal}`,
    faith: `${selectedCompletion.faithDone}/${selectedCompletion.faithTotal}`,
    todo: `${doneTodos}/${todayTodos.length}`,
  };
  const filtering = selectedDay === todayStr && hideCompleted;

  // 오늘 완벽한 날(예정 항목 전부 달성) 시 스탬프 (하루 한 번만)
  const PERFECT_STAMP_KEY = `onju_perfect_stamp_date:${user?.id ?? ''}`;
  const todayIdx = weekDays.findIndex(d => format(d, 'yyyy-MM-dd') === todayStr);
  const todayState = todayIdx >= 0 ? weekRates[todayIdx].state : 'rest';

  useEffect(() => {
    const nowPerfect = todayState === 'perfect';
    const wasPerfect = prevTodayRates.current;
    if (nowPerfect && !wasPerfect) {
      const shownDate = localStorage.getItem(PERFECT_STAMP_KEY);
      if (shownDate !== todayStr) {
        localStorage.setItem(PERFECT_STAMP_KEY, todayStr);
        const t = setTimeout(() => setShowPerfectStamp(true), 0);
        prevTodayRates.current = true;
        return () => clearTimeout(t);
      }
    }
    prevTodayRates.current = nowPerfect;
  }, [todayState, PERFECT_STAMP_KEY, todayStr]);

  return (
    <>
    <motion.div
      variants={container} initial="hidden" animate="show"
      className="home-paper flex min-h-full flex-col"

    >

      {/* 헤더 — 🔥 스트릭 버튼을 우측 상단에 배치 */}
      <motion.header variants={itemV} className="flex-shrink-0 px-4 pt-4 pb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption1 text-label-alt font-medium tracking-wide">{format(new Date(), 'yyyy년 M월', { locale: ko })}</p>
          <h1 className="break-words text-headline1 font-bold text-label-strong font-brand mt-0.5" title={`${user?.name ?? ''}님, 반가워요`}>
            <span className="inline-block">{user?.name}님,</span>{' '}<span className="inline-block">반가워요</span>
          </h1>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {/* 📖 하루 일기 버튼 */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
            onClick={() => navigate('/diary')}
            aria-label="하루 일기"
            className="paper-control flex items-center justify-center text-label-alt hover:text-primary hover:border-primary/30 transition-colors"
          >
            <BookOpen size={18} />
          </motion.button>

          <button type="button" className="paper-control flex items-center justify-center text-primary" aria-label="목표" onClick={() => navigate('/goals')}><Target size={18} /></button>
          {/* 스트릭 칩 버튼 */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
            onClick={() => navigate('/streak')}
            aria-label={`연속 실천 ${streak}일`}
            className={`paper-control flex items-center gap-1.5 px-3 border transition-colors ${
              streak > 0
                ? 'bg-cautionary/10 border-cautionary/20'
                : 'bg-surface border-line'
            }`}
          >
            <motion.span
              animate={streak > 0 ? { scale: [1, 1.2, 1] } : {}}
              transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.2 }}
              className="leading-none"
            >
              <Flame size={16} className={streak > 0 ? 'text-cautionary' : 'text-label-assistive'} strokeWidth={1.9} />
            </motion.span>
            <span className={`text-label1 font-bold tabular-nums ${streak > 0 ? 'text-cautionary' : 'text-label-assistive'}`}>
              {streak}일
            </span>
          </motion.button>
        </div>
      </motion.header>

      <motion.section variants={itemV} aria-label="나무와 목표" className="home-growth-summary mb-3">
        <TreeHero />
        <div className="home-goal-strip mt-2 flex gap-2 overflow-x-auto px-4 pb-1" role="region" aria-label={`나의 목표 ${activeGoals.length}개`} tabIndex={0}>
          {activeGoals.length === 0 ? (
            <button onClick={() => navigate('/goals')} className="paper-card flex min-h-14 w-full items-center gap-2 px-3 text-left text-caption1 text-label">
              <Target size={18} className="shrink-0 text-primary" /><span className="flex-1">작은 목표부터 시작해보세요</span><ChevronRight size={16} />
            </button>
          ) : <>
            {activeGoals.map(goal => {
              const rate = goalRate(goal);
              return <button key={goal.id} onClick={() => navigate('/goals', { state: { goalId: goal.id } })}
                aria-label={`${goal.title}, ${goal.startDate > todayIso ? '시작 전' : `진척 ${rate}%`}, 목표 상세 보기`}
                className="home-goal-card paper-card shrink-0 px-3 py-2 text-left">
                <div className="flex items-start gap-1.5">
                  <Target size={14} className="mt-0.5 shrink-0 text-primary" />
                  <span className="line-clamp-2 min-h-8 flex-1 break-words text-caption1 font-semibold text-label-strong">{goal.title}</span>
                  {goal.color && <span aria-hidden className="mt-1 size-2 shrink-0 rounded-full" style={{ backgroundColor: goal.color }} />}
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-fill-strong"><div className="h-full rounded-full bg-primary" style={{ width: `${rate}%` }} /></div>
                  <span className="text-caption2 font-bold tabular-nums text-primary">{goal.startDate > todayIso ? '시작 전' : `${rate}%`}</span>
                </div>
              </button>;
            })}
            <button onClick={() => navigate('/goals')} aria-label="목표 전체 보기" className="paper-card flex min-w-20 shrink-0 flex-col items-center justify-center gap-1 px-3 text-caption1 font-bold text-primary">
              <ChevronRight size={18} /><span>전체 목표</span>
            </button>
          </>}
        </div>
      </motion.section>

      <ReviewRecoveryBanner />
      {/* 일요일 리뷰 배너 */}
      {isSunday() && (
        <motion.div variants={itemV} className="flex-shrink-0 px-4 mb-4">
          <ReviewBanner completed={isReviewCompleted(reviews, currentWeek(), currentYear())} weekRangeText={getWeekRangeText(new Date(), weekStartDay as 0 | 1)} onStart={() => navigate('/review')} />
        </motion.div>
      )}

      {/* 주간 스트립 + 탭 */}
      <motion.section variants={itemV} aria-label="이번 주 루틴" className="home-routine-sheet flex-1 flex flex-col mx-3 overflow-hidden min-h-0">

        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <h2 className="text-body1 font-bold text-label-strong">{selectedDay === todayStr ? '오늘의 실천' : `${format(new Date(selectedDay + 'T12:00:00'), 'M월 d일')} 기록`}</h2>

        </div>
        {/* 주간 날짜 스트립 */}
        <div className="flex-shrink-0 px-2 pt-3 pb-3">
          <div className="flex gap-1 overflow-x-auto">
            {weekDays.map((d, i) => {
              const ds = format(d, 'yyyy-MM-dd');
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDay;
              const isFuture = d > new Date(new Date().setHours(23, 59, 59, 999));
              const pRate = weekRates[i].personal;
              const fRate = weekRates[i].faith;
              const bothDone = !isFuture && weekRates[i].state === 'perfect';
              const anyDone = !isFuture && (pRate > 0 || fRate > 0);

              return (
                <button key={ds} disabled={isFuture} onClick={() => !isFuture && selectDay(ds)}
                  aria-label={`${format(d, 'M월 d일')} ${isFuture ? '선택 불가' : isSelected ? '선택됨' : '기록 보기'}`}
                  aria-description={`개인 ${pRate}% · 신앙 ${fRate}%`}
                  aria-pressed={isSelected}
                  className={`week-day-card relative min-w-0 flex-1 flex flex-col items-center gap-1 py-1.5 px-1 transition-colors ${isFuture ? 'cursor-default opacity-45' : ''} ${
                    isSelected
                      ? 'is-selected'
                      : bothDone
                      ? 'is-complete'
                      : ''
                  }`}>

                  {/* 요일 */}
                  <span className={`text-caption1 font-bold ${isToday ? 'text-primary' : 'text-label-assistive'}`}>
                    {ALL_DAY_LABELS[getDay(d)]}
                  </span>

                  {/* 날짜 */}
                  <span className={`text-label1 font-bold ${
                    isSelected && isToday ? 'text-primary'
                    : isSelected ? 'text-label-strong'
                    : isToday ? 'text-primary'
                    : isFuture ? 'text-label-assistive'
                    : 'text-label'
                  }`}>
                    {format(d, 'd')}
                  </span>

                  <span aria-hidden="true" className={`size-1.5 rounded-full ${bothDone ? 'bg-accent' : anyDone ? 'bg-primary/40' : 'bg-transparent'}`} />

                </button>
              );
            })}
          </div>


        </div>

        {/* 루틴 3탭 */}
        <div className="flex-1 flex flex-col border-t border-line-soft min-h-0">
          <SegmentedControl value={activeTab} onChange={selectTab} label="홈 기록 종류" className="mx-3 mb-2"
            items={TABS.map(tab => ({ value: tab.key, label: <><span>{tab.label}</span><span className="ml-1.5 text-caption2 font-medium tabular-nums">{badges[tab.key]}</span></> }))} />
          {selectedDay === todayStr && <div className="mx-3 mb-2 flex items-center justify-end gap-2">

            <button aria-pressed={hideCompleted} onClick={() => setHideCompleted(v => !v)}
              className={`min-h-11 shrink-0 rounded-full border px-3 text-caption1 font-medium ${hideCompleted ? 'border-primary/30 bg-primary-soft text-primary' : 'border-line text-label-alt'}`}>남은 항목만</button>
          </div>}

          {/* 어제 마저 체크하라는 유도 (오늘 화면 + 유예 구간 + 어제 미완료) */}
          {showGraceNudge && (
            <button onClick={() => selectDay(yesterdayStr)}
              className="flex-shrink-0 w-full flex items-center justify-between gap-2 px-4 py-2 bg-primary-soft border-b border-line-soft">
              <span className="flex items-center gap-1.5 text-caption1 font-medium text-primary">
                <Clock size={13} className="flex-shrink-0" strokeWidth={1.9} />
                어제({format(new Date(yesterdayStr + 'T12:00:00'), 'M월 d일')}) 기록을 오전 {graceEndHour}시까지 마저 체크할 수 있어요
              </span>
              <span className="text-caption1 font-bold text-primary whitespace-nowrap">어제 →</span>
            </button>
          )}

          {/* 지난 날짜 조회 안내: 유예 중인 어제는 수정 가능, 그 외는 읽기 전용 */}
          {selectedDay !== todayStr && (
            <div className={`flex-shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-line-soft ${canEdit ? 'bg-primary-soft' : 'bg-fill'}`}>
              <span className={`flex items-center gap-1.5 text-caption1 font-medium ${canEdit ? 'text-primary' : 'text-label-alt'}`}>
                {canEdit ? (
                  <>
                    <Clock size={13} className="flex-shrink-0" strokeWidth={1.9} />
                    어제({format(new Date(selectedDay + 'T12:00:00'), 'M월 d일')}) 기록 · 오전 {graceEndHour}시까지 체크 가능
                  </>
                ) : (
                  <>
                    <Lock size={13} className="flex-shrink-0" strokeWidth={1.9} />
                    {format(new Date(selectedDay + 'T12:00:00'), 'M월 d일')} 기록 (읽기 전용)
                  </>
                )}
              </span>
              <button onClick={() => selectDay(todayStr)}
                className="min-h-11 px-2 text-caption1 font-bold text-primary whitespace-nowrap">오늘로</button>
            </div>
          )}

          <div className="home-record-scroll flex-1 pb-4">
          <AnimatePresence mode="wait">
            {activeTab === 'personal' && (
              <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <PersonalTab key={selectedDay} date={selectedDay} readOnly={!canEdit} hideCompleted={filtering} onShowCompleted={() => setHideCompleted(false)} />
              </motion.div>
            )}
            {activeTab === 'faith' && (
              <motion.div key="f" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <FaithTab key={selectedDay} date={selectedDay} readOnly={!canEdit} hideCompleted={filtering} onShowCompleted={() => setHideCompleted(false)} />
              </motion.div>
            )}
            {activeTab === 'todo' && (
              <motion.div key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <TodoTab date={selectedDay} readOnly={!canEdit} hideCompleted={filtering} onShowCompleted={() => setHideCompleted(false)} />
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>

      </motion.section>


    </motion.div>

    {/* 오늘 100% 달성 스탬프 */}
    <StampOverlay
      show={showPerfectStamp}
      label="참 잘했어요"
      sublabel="오늘 100% 달성"
      color="#1F4D3A"
      rotation={-8}
      onComplete={() => setShowPerfectStamp(false)}
    />
    </>
  );
}
