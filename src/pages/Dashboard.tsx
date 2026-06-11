import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Trash2, ListTodo, BookOpen, Flame, Dumbbell, Link2, Clock, Lock } from 'lucide-react';
import FAB from '../components/ui/FAB';
import { useQuery } from '@tanstack/react-query';
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
import { isSunday, currentWeek, currentYear, isReviewCompleted, getWeekRangeText, getWeekDays, ALL_DAY_LABELS, today, yesterday, isEditableDay, isWithinGrace } from '../utils/date';
import { useSettingsStore } from '../store/settingsStore';
import { getGoalRate, getLinkedItems } from '../utils/goalProgress';
import { getDayCompletion } from '../utils/dayCompletion';
import StampOverlay from '../components/ui/StampOverlay';
import ReviewBanner from '../components/review/ReviewBanner';
import { fetchReviews } from '../api/reviews';
import PersonalTab from '../components/tabs/PersonalTab';
import FaithTab from '../components/tabs/FaithTab';
import TreeHero from '../components/tree/TreeHero';
import { CONFETTI_FOREST } from '../components/tree/treePalette';

const HOME_SUB_PATHS = ['/today', '/goals', '/routines', '/stats', '/review'];
export { HOME_SUB_PATHS };

type TabType = 'personal' | 'faith' | 'todo';
const TABS: { key: TabType; label: string }[] = [
  { key: 'personal', label: '개인 루틴' },
  { key: 'faith', label: '신앙 루틴' },
  { key: 'todo', label: '투두' },
];

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } } as const;
const itemV = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 28 } } } as const;

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { weekStartDay, graceEndHour } = useSettingsStore();
  const { faithRoutines, logs, isCompleted } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
  const { todos, toggleTodo, removeTodo } = useTodoStore();
  const { monthlyGoals, goalSlots } = useGoalStore();
  const todayStr = today();
  const prevCompleteRef = useRef(false);
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [showPerfectStamp, setShowPerfectStamp] = useState(false);
  const prevTodayRates = useRef<boolean>(false);

  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });

  const { current: streak } = calcStreak(faithRoutines, logs, todayStr);
  const allDone = faithRoutines.length > 0 && faithRoutines.every(r => isCompleted(r.id));

  const CONFETTI_KEY = 'onju_confetti_date';
  useEffect(() => {
    if (allDone && !prevCompleteRef.current) {
      const shownDate = localStorage.getItem(CONFETTI_KEY);
      if (shownDate !== todayStr) {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.3 }, colors: CONFETTI_FOREST });
        localStorage.setItem(CONFETTI_KEY, todayStr);
      }
    }
    prevCompleteRef.current = allDone;
  }, [allDone]); // eslint-disable-line react-hooks/exhaustive-deps


  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const activeGoals = monthlyGoals.filter(g => g.endDate >= todayIso);

  // 목표 대표 지표 = 진척도 (전체 기간 중 지킨 비율)
  const goalRate = (goal: typeof activeGoals[0]): number =>
    getGoalRate(goal, habits, habitLogs, faithRoutines, logs, todayIso);
  const todayTodos = todos.filter(t => t.date === selectedDay);
  const doneTodos = todayTodos.filter(t => t.completed).length;
  const weekDays = getWeekDays(new Date(), weekStartDay as 0 | 1);

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

  const badges: Record<TabType, string | undefined> = {
    personal: undefined,
    faith: undefined,
    todo: todayTodos.length > 0 ? `${doneTodos}/${todayTodos.length}` : undefined,
  };

  // 오늘 완벽한 날(예정 항목 전부 달성) 시 스탬프 (하루 한 번만)
  const PERFECT_STAMP_KEY = 'onju_perfect_stamp_date';
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayState]);

  return (
    <>
    <motion.div
      variants={container} initial="hidden" animate="show"
      className="flex flex-col overflow-hidden"
      style={{ height: '100dvh' }}
    >

      {/* 헤더 — 🔥 스트릭 버튼을 우측 상단에 배치 */}
      <motion.div variants={itemV} className="flex-shrink-0 px-4 pt-5 pb-3 flex items-start justify-between">
        <div>
          <p className="text-caption1 text-label-alt font-medium">{format(new Date(), 'yyyy년 M월', { locale: ko })}</p>
          <h1 className="text-heading2 font-bold text-label-strong font-brand mt-0.5">안녕하세요, {user?.name}님</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* 📖 하루 일기 버튼 */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
            onClick={() => navigate('/diary')}
            aria-label="하루 일기"
            className="flex items-center justify-center w-9 h-9 rounded-2xl border border-line bg-surface text-label-alt hover:text-primary hover:border-primary/30 transition-colors"
          >
            <BookOpen size={18} />
          </motion.button>

          {/* 스트릭 칩 버튼 */}
          <motion.button
            whileTap={{ scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 600, damping: 22 }}
            onClick={() => navigate('/streak')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border transition-colors ${
              streak > 0
                ? 'bg-cautionary/10 border-cautionary/20'
                : 'bg-surface border-line'
            }`}
          >
            <motion.span
              animate={streak > 0 ? { scale: [1, 1.2, 1] } : {}}
              transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.4 }}
              className="leading-none"
            >
              <Flame size={16} className={streak > 0 ? 'text-cautionary' : 'text-label-assistive'} strokeWidth={1.9} />
            </motion.span>
            <span className={`text-label1 font-bold tabular-nums ${streak > 0 ? 'text-cautionary' : 'text-label-assistive'}`}>
              {streak}일
            </span>
          </motion.button>
        </div>
      </motion.div>

      {/* 나의 나무 — 성장 히어로 */}
      <motion.div variants={itemV} className="flex-shrink-0 mb-3">
        <TreeHero />
      </motion.div>

      {/* 목표 카드 — 3개 나란히 가로 스크롤 */}
      <motion.div variants={itemV} className="flex-shrink-0 mb-4">
        {activeGoals.length === 0 ? (
          <div className="px-4">
            <motion.button
              whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
              onClick={() => navigate('/goals')}
              className="w-full bg-surface border border-line rounded-xl px-4 py-3.5 text-left"
            >
              <div className="flex items-center gap-1 mb-1">
                <Target size={11} className="text-primary" />
                <span className="text-caption2 font-bold text-primary">목표</span>
                <span className="text-caption2 text-label-assistive ml-auto">0/{goalSlots}</span>
              </div>
              <p className="text-caption1 text-label-assistive">목표를 세워보세요</p>
            </motion.button>
          </div>
        ) : (
          <div
            className="flex gap-2 px-4 overflow-x-auto"
            style={{ scrollSnapType: 'x mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          >
            {activeGoals.map(g => {
              const rate = goalRate(g);
              const linkedCount = getLinkedItems(g, habits, habitLogs, faithRoutines, logs, todayIso).length;
              const accentColor = g.color ?? 'var(--color-primary)';
              return (
                <motion.button
                  key={g.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => navigate('/goals')}
                  className="flex-shrink-0 bg-surface border border-line rounded-xl px-3 py-3.5 text-left"
                  style={{
                    width: 'calc(33.33% - 6px)',
                    scrollSnapAlign: 'start',
                    borderColor: g.color ? `${g.color}40` : undefined,
                    backgroundColor: g.color ? `${g.color}0a` : undefined,
                  } as React.CSSProperties}
                >
                  {/* 카테고리 + 연동 개수 */}
                  <div className="flex items-center justify-between">
                    {g.category === 'faith'
                      ? <BookOpen size={13} className="text-label-assistive" strokeWidth={1.9} />
                      : <Dumbbell size={13} className="text-label-assistive" strokeWidth={1.9} />}
                    {linkedCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[9px] font-bold text-label-assistive">
                        <Link2 size={10} strokeWidth={1.9} />{linkedCount}
                      </span>
                    )}
                  </div>

                  {/* 제목 */}
                  <p className="text-caption1 font-semibold text-label-strong leading-snug mt-1 mb-2"
                    style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' } as React.CSSProperties}>
                    {g.title}
                  </p>

                  {/* 진척도 */}
                  <p className="text-label1 font-bold mb-1.5" style={{ color: accentColor }}>
                    {rate}%
                  </p>

                  {/* 프로그레스 바 */}
                  <div className="h-1 bg-fill-strong rounded-full overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${rate}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      style={{ backgroundColor: accentColor }}
                    />
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* 일요일 리뷰 배너 */}
      {isSunday() && (
        <motion.div variants={itemV} className="flex-shrink-0 px-4 mb-4">
          <ReviewBanner completed={isReviewCompleted(reviews, currentWeek(), currentYear())} weekRangeText={getWeekRangeText(new Date(), weekStartDay as 0 | 1)} onStart={() => navigate('/review')} />
        </motion.div>
      )}

      {/* 주간 스트립 + 탭 */}
      <motion.div variants={itemV} className="flex-1 flex flex-col bg-surface border border-line rounded-t-3xl mx-3 overflow-hidden min-h-0">

        {/* 주간 날짜 스트립 */}
        <div className="flex-shrink-0 px-2 pt-3 pb-2">
          <div className="flex gap-1">
            {weekDays.map((d, i) => {
              const ds = format(d, 'yyyy-MM-dd');
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDay;
              const isFuture = d > new Date(new Date().setHours(23, 59, 59, 999));
              const pRate = weekRates[i].personal;
              const fRate = weekRates[i].faith;
              const bothDone = !isFuture && pRate === 100 && fRate === 100;
              const anyDone = !isFuture && (pRate > 0 || fRate > 0);

              return (
                <button key={ds} disabled={isFuture} onClick={() => !isFuture && setSelectedDay(ds)}
                  className={`relative flex-1 flex flex-col items-center gap-1 rounded-xl py-2 px-0.5 border-2 transition-all overflow-hidden ${isFuture ? 'cursor-default' : ''} ${
                    isSelected
                      ? 'border-primary bg-primary-soft'
                      : bothDone
                      ? 'border-faith/30 bg-faith/5'
                      : 'border-transparent'
                  }`}>

                  {/* 요일 */}
                  <span className={`text-caption2 font-bold ${isToday ? 'text-primary' : 'text-label-assistive'}`}>
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

                  {/* 개인 루틴 바 */}
                  <div className="w-full h-2 bg-fill-strong rounded-full overflow-hidden">
                    {!isFuture && pRate >= 0 && (
                      <motion.div
                        className="h-full bg-primary rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${pRate}%` }}
                        transition={{ duration: 0.5, delay: i * 0.04 }}
                      />
                    )}
                  </div>

                  {/* 신앙 루틴 바 */}
                  <div className="w-full h-2 bg-fill-strong rounded-full overflow-hidden">
                    {!isFuture && fRate >= 0 && (
                      <motion.div
                        className="h-full bg-faith rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${fRate}%` }}
                        transition={{ duration: 0.5, delay: i * 0.04 + 0.1 }}
                      />
                    )}
                  </div>

                  {/* 완료 상태 도트 */}
                  <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                    bothDone ? 'bg-faith'
                    : anyDone ? 'bg-primary/40'
                    : 'bg-transparent'
                  }`} />

                  {/* 100% 달성 도장 인장 */}
                  {bothDone && (
                    <motion.div
                      initial={{ scale: 1.6, opacity: 0, rotate: -14 }}
                      animate={{ scale: 1, opacity: 1, rotate: -12 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 22, delay: 0.3 + i * 0.05 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    >
                      <svg width="54" height="54" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="46" fill="none" stroke="#1f8a4c" strokeWidth="5"/>
                        <circle cx="50" cy="50" r="36" fill="none" stroke="#1f8a4c" strokeWidth="2"/>
                        <text x="50" y="54" textAnchor="middle" dominantBaseline="middle"
                          fill="#1f8a4c" fontSize="22" fontWeight="900"
                          style={{ fontFamily: 'system-ui, sans-serif' }}>완료</text>
                      </svg>
                    </motion.div>
                  )}
                </button>
              );
            })}
          </div>

          {/* 범례 */}
          <div className="flex items-center gap-3 mt-2 px-1">
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" /><span className="text-caption2 text-label-assistive">개인</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-faith" /><span className="text-caption2 text-label-assistive">신앙</span></div>
          </div>
        </div>

        {/* 루틴 3탭 */}
        <div className="flex-1 flex flex-col border-t border-line-soft min-h-0">
          <div className="flex-shrink-0 flex border-b border-line-soft bg-surface">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={`relative flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-caption1 font-bold transition-colors ${activeTab === tab.key ? 'text-label-strong' : 'text-label-assistive'}`}>
                <span>{tab.label}</span>
                {badges[tab.key] && (
                  <span className={`text-caption2 font-bold px-1.5 py-0.5 rounded ${activeTab === tab.key ? 'bg-primary-soft text-primary' : 'bg-fill text-label-assistive'}`}>
                    {badges[tab.key]}
                  </span>
                )}
                {activeTab === tab.key && (
                  <motion.div layoutId="tab3Line" className="absolute bottom-0 left-3 right-3 h-0.5 bg-label-strong rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* 어제 마저 체크하라는 유도 (오늘 화면 + 유예 구간 + 어제 미완료) */}
          {showGraceNudge && (
            <button onClick={() => setSelectedDay(yesterdayStr)}
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
              <button onClick={() => setSelectedDay(todayStr)}
                className="text-caption1 font-bold text-primary whitespace-nowrap">오늘로</button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}>
          <AnimatePresence mode="wait">
            {activeTab === 'personal' && (
              <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <PersonalTab date={selectedDay} readOnly={!canEdit} />
              </motion.div>
            )}
            {activeTab === 'faith' && (
              <motion.div key="f" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <FaithTab date={selectedDay} readOnly={!canEdit} />
              </motion.div>
            )}
            {activeTab === 'todo' && (
              <motion.div key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                {canEdit && (
                <FAB options={[{
                  icon: <ListTodo size={20} />,
                  label: '투두 추가',
                  sub: '오늘의 할 일',
                  color: 'bg-primary',
                  onClick: () => navigate('/todos/new'),
                }]} />
                )}

                {todayTodos.length === 0 ? (
                  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                    <div className="w-20 h-20 rounded-full bg-primary-soft flex items-center justify-center mb-5">
                      <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                      </svg>
                    </div>
                    <p className="text-body2 font-bold text-label mb-1">오늘 할 일을 적어보세요</p>
                    <p className="text-caption1 text-label-alt leading-relaxed">하나씩 체크할 때마다<br />성취감이 쌓여가요</p>
                  </div>
                ) : (
                  <div className="bg-surface divide-y divide-line-soft">
                    {todayTodos.filter(t => !t.completed).map((todo, idx) => (
                      <motion.div key={todo.id} layout
                        onClick={() => navigate(`/todos/edit/${todo.id}`)}
                        className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-fill transition-colors">
                        <span className="text-caption2 font-bold w-5 text-center text-label-assistive flex-shrink-0">{idx + 1}</span>
                        <div className="w-9 h-9 rounded-xl bg-fill flex items-center justify-center text-lg flex-shrink-0">
                          {todo.emoji ?? '📝'}
                        </div>
                        <span className="flex-1 text-body2 font-semibold text-label">{todo.title}</span>
                        {canEdit ? (
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <motion.button whileTap={{ scale: 0.85 }} transition={{ duration: 0.08 }}
                              onClick={e => { e.stopPropagation(); removeTodo(todo.id); }} className="text-label-assistive hover:text-negative transition-colors p-1">
                              <Trash2 size={13} />
                            </motion.button>
                            <motion.button whileTap={{ scale: 0.82 }} transition={{ duration: 0.08 }}
                              onClick={e => { e.stopPropagation(); toggleTodo(todo.id); }}
                              className="w-7 h-7 rounded-full border-2 border-line hover:border-primary flex items-center justify-center transition-colors">
                            </motion.button>
                          </div>
                        ) : (
                          <span className="text-caption2 font-bold px-2 py-1 rounded-lg bg-fill text-label-assistive flex-shrink-0">미완료</span>
                        )}
                      </motion.div>
                    ))}

                    {todayTodos.filter(t => t.completed).length > 0 && (
                      <>
                        <div className="px-4 py-2 bg-surface-alt">
                          <span className="text-caption2 font-bold text-label-assistive">완료 {doneTodos}개</span>
                        </div>
                        {todayTodos.filter(t => t.completed).map((todo, idx) => (
                          <motion.div key={todo.id} layout
                            onClick={() => navigate(`/todos/edit/${todo.id}`)}
                            className="flex items-center gap-3 px-4 py-3 opacity-60 cursor-pointer hover:bg-fill transition-colors">
                            <span className="text-caption2 font-bold w-5 text-center text-label-assistive flex-shrink-0">
                              {todayTodos.filter(t => !t.completed).length + idx + 1}
                            </span>
                            <div className="w-9 h-9 rounded-xl bg-primary-soft flex items-center justify-center text-lg flex-shrink-0">
                              {todo.emoji ?? '📝'}
                            </div>
                            <span className="flex-1 text-body2 font-semibold line-through text-label-assistive">{todo.title}</span>
                            {canEdit ? (
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <motion.button whileTap={{ scale: 0.85 }} transition={{ duration: 0.08 }}
                                  onClick={e => { e.stopPropagation(); removeTodo(todo.id); }} className="text-label-assistive hover:text-negative transition-colors p-1">
                                  <Trash2 size={13} />
                                </motion.button>
                                <motion.button whileTap={{ scale: 0.82 }} transition={{ duration: 0.08 }}
                                  onClick={e => { e.stopPropagation(); toggleTodo(todo.id); }}
                                  className="w-7 h-7 rounded-full bg-primary border-2 border-primary flex items-center justify-center">
                                  <AnimatePresence mode="wait" initial={false}>
                                    <motion.svg key="chk" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                                      exit={{ scale: 0, opacity: 0 }} transition={{ duration: 0.15 }}
                                      width="11" height="9" viewBox="0 0 11 9" fill="none">
                                      <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    </motion.svg>
                                  </AnimatePresence>
                                </motion.button>
                              </div>
                            ) : (
                              <span className="text-caption2 font-bold px-2 py-1 rounded-lg bg-primary-soft text-primary flex-shrink-0">완료</span>
                            )}
                          </motion.div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>

      </motion.div>
    </motion.div>

    {/* 오늘 100% 달성 스탬프 */}
    <StampOverlay
      show={showPerfectStamp}
      label="참 잘했어요"
      sublabel="오늘 100% 달성"
      color="#2f9e60"
      rotation={-8}
      onComplete={() => setShowPerfectStamp(false)}
    />
    </>
  );
}
