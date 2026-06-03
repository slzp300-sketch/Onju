import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, CalendarDays, Trash2, ListTodo } from 'lucide-react';
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
import { today, isSunday, currentWeek, currentYear, isReviewCompleted, getWeekRangeText, getWeekDays, ALL_DAY_LABELS } from '../utils/date';
import { useSettingsStore } from '../store/settingsStore';
import StampOverlay from '../components/ui/StampOverlay';
import ReviewBanner from '../components/review/ReviewBanner';
import { fetchReviews } from '../api/reviews';
import PersonalTab from '../components/tabs/PersonalTab';
import FaithTab from '../components/tabs/FaithTab';

const HOME_SUB_PATHS = ['/today', '/goals', '/routines', '/stats', '/review'];
export { HOME_SUB_PATHS };

type TabType = 'personal' | 'faith' | 'todo';
const TABS: { key: TabType; label: string }[] = [
  { key: 'personal', label: '개인 루틴' },
  { key: 'faith', label: '신앙 루틴' },
  { key: 'todo', label: '투두' },
];


function getFaithRate(routines: import('../types').DailyRoutine[], logs: import('../types').RoutineLog[], dateStr: string): number {
  if (routines.length === 0) return -1;
  // 완료 또는 쉬어가기 모두 달성으로 처리
  const done = new Set(logs.filter(l => l.date === dateStr && (l.completed || l.skipped)).map(l => l.routineId));
  return Math.round((routines.filter(r => done.has(r.id)).length / routines.length) * 100);
}

function getHabitRate(habits: import('../types').Habit[], habitLogs: { habitId: string; date: string; completed: boolean; skipped?: boolean }[], dateStr: string): number {
  if (habits.length === 0) return -1;
  // 완료 또는 쉬어가기 모두 달성으로 처리
  const done = habitLogs.filter(l => l.date === dateStr && (l.completed || l.skipped)).length;
  return Math.round((done / habits.length) * 100);
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } } as const;
const itemV = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 28 } } } as const;

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { weekStartDay } = useSettingsStore();
  const { faithRoutines, logs, isCompleted } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
  const { todos, toggleTodo, removeTodo } = useTodoStore();
  const { weeklyGoals, monthlyGoals } = useGoalStore();
  const todayStr = today();
  const prevCompleteRef = useRef(false);
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);
  const [showPerfectStamp, setShowPerfectStamp] = useState(false);
  const prevTodayRates = useRef<{ personal: number; faith: number } | null>(null);

  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });

  const { current: streak } = calcStreak(faithRoutines, logs, todayStr);
  const allDone = faithRoutines.length > 0 && faithRoutines.every(r => isCompleted(r.id));

  useEffect(() => {
    if (allDone && !prevCompleteRef.current) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.3 }, colors: ['#00BF40', '#0066FF', '#7C7FF5'] });
    }
    prevCompleteRef.current = allDone;
  }, [allDone]);


  const now = new Date();
  const thisMonthGoals = monthlyGoals.filter(g => g.month === now.getMonth() + 1 && g.year === now.getFullYear());
  const thisWeekGoals = weeklyGoals.filter(g => g.weekNumber === currentWeek() && g.year === currentYear());
  const todayTodos = todos.filter(t => t.date === todayStr);
  const doneTodos = todayTodos.filter(t => t.completed).length;
  const weekDays = getWeekDays(new Date(), weekStartDay as 0 | 1);

  const weekRates = weekDays.map(d => {
    const ds = format(d, 'yyyy-MM-dd');
    return {
      date: ds,
      personal: getHabitRate(habits, habitLogs, ds),
      faith: getFaithRate(faithRoutines, logs, ds),
    };
  });

  const badges: Record<TabType, string | undefined> = {
    personal: undefined,
    faith: undefined,
    todo: todayTodos.length > 0 ? `${doneTodos}/${todayTodos.length}` : undefined,
  };

  // 오늘 날짜 개인+신앙 둘 다 100% 달성 시 스탬프
  const todayIdx = weekDays.findIndex(d => format(d, 'yyyy-MM-dd') === todayStr);
  const todayRates = todayIdx >= 0 ? weekRates[todayIdx] : null;
   
  useEffect(() => {
    if (!todayRates) return;
    const prev = prevTodayRates.current;
    const nowPerfect = todayRates.personal === 100 && todayRates.faith === 100;
    const wasPerfect = prev ? prev.personal === 100 && prev.faith === 100 : false;
    if (nowPerfect && !wasPerfect) setShowPerfectStamp(true);
    prevTodayRates.current = { personal: todayRates.personal, faith: todayRates.faith };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayRates?.personal, todayRates?.faith]);

  return (
    <>
    <motion.div
      variants={container} initial="hidden" animate="show"
      className="flex flex-col overflow-hidden"
      style={{ height: '100dvh' }}
    >

      {/* 헤더 */}
      <motion.div variants={itemV} className="flex-shrink-0 px-4 pt-5 pb-3 flex items-start justify-between">
        <div>
          <p className="text-caption1 text-label-alt font-medium">{format(new Date(), 'yyyy년 M월', { locale: ko })}</p>
          <h1 className="text-heading2 font-bold text-label-strong font-brand mt-0.5">안녕하세요, {user?.name}님</h1>
        </div>
      </motion.div>

      {/* 목표 + 스트릭 카드 행 */}
      <motion.div variants={itemV} className="flex-shrink-0 px-4 mb-4 flex gap-2">
        {/* 이번달 목표 */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.12 }}
          onClick={() => navigate('/goals/monthly')}
          className="flex-1 bg-surface border border-line rounded-xl px-3 py-3 text-left shadow-emphasize hover:bg-fill transition-colors"
        >
          <div className="flex items-center gap-1 mb-2">
            <CalendarDays size={11} className="text-primary" />
            <span className="text-caption2 font-bold text-primary">이번달</span>
          </div>
          {thisMonthGoals.length === 0 ? (
            <p className="text-caption1 text-label-assistive font-medium leading-tight">목표를<br />세워보세요</p>
          ) : (
            <div className="flex flex-col gap-1">
              {thisMonthGoals.slice(0, 2).map(g => (
                <div key={g.id} className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${g.status === 'completed' ? 'bg-primary' : 'bg-line'}`} />
                  <p className={`text-caption1 font-medium truncate ${g.status === 'completed' ? 'line-through text-label-assistive' : 'text-label'}`}>{g.title}</p>
                </div>
              ))}
              {thisMonthGoals.length > 2 && (
                <p className="text-caption2 text-label-assistive">+{thisMonthGoals.length - 2}개 더</p>
              )}
            </div>
          )}
        </motion.button>

        {/* 이번주 목표 */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          transition={{ duration: 0.12 }}
          onClick={() => navigate('/goals/weekly')}
          className="flex-1 bg-surface border border-line rounded-xl px-3 py-3 text-left shadow-emphasize hover:bg-fill transition-colors"
        >
          <div className="flex items-center gap-1 mb-2">
            <Target size={11} className="text-primary" />
            <span className="text-caption2 font-bold text-primary">이번주</span>
          </div>
          {thisWeekGoals.length === 0 ? (
            <p className="text-caption1 text-label-assistive font-medium leading-tight">목표를<br />추가해보세요</p>
          ) : (
            <div className="flex flex-col gap-1">
              {thisWeekGoals.slice(0, 2).map(g => (
                <div key={g.id} className="flex items-center gap-1.5">
                  <div className="relative w-4 h-4 flex-shrink-0">
                    <svg className="w-4 h-4 -rotate-90" viewBox="0 0 16 16">
                      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--color-fill-strong)" strokeWidth="2" />
                      <circle cx="8" cy="8" r="6" fill="none" stroke="var(--color-primary)" strokeWidth="2"
                        strokeDasharray={`${2 * Math.PI * 6}`}
                        strokeDashoffset={`${2 * Math.PI * 6 * (1 - g.completionRate / 100)}`}
                        strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-caption1 font-medium text-label truncate">{g.title}</p>
                </div>
              ))}
              {thisWeekGoals.length > 2 && (
                <p className="text-caption2 text-label-assistive">+{thisWeekGoals.length - 2}개 더</p>
              )}
            </div>
          )}
        </motion.button>

        {/* 스트릭 */}
        <motion.button
          whileTap={{ scale: 0.93 }}
          transition={{ duration: 0.12 }}
          onClick={() => navigate('/streak')}
          className="bg-surface border border-line rounded-xl px-3 py-3 text-center shadow-emphasize hover:bg-fill transition-colors"
          style={{ minWidth: 72 }}
        >
          <div className="flex flex-col items-center gap-1">
            <motion.span
              animate={streak > 0 ? { scale: [1, 1.15, 1] } : {}}
              transition={{ repeat: Infinity, repeatDelay: 3, duration: 0.4 }}
              className="text-2xl leading-none"
            >
              🔥
            </motion.span>
            <span className={`text-label1 font-bold ${streak > 0 ? 'text-cautionary' : 'text-label-assistive'}`}>
              {streak}일
            </span>
            <span className="text-caption2 text-label-assistive font-medium">연속</span>
          </div>
        </motion.button>
      </motion.div>

      {/* 일요일 리뷰 배너 */}
      {isSunday() && (
        <motion.div variants={itemV} className="flex-shrink-0 px-4 mb-4">
          <ReviewBanner completed={isReviewCompleted(reviews, currentWeek(), currentYear())} weekRangeText={getWeekRangeText(new Date(), weekStartDay as 0 | 1)} onStart={() => navigate('/review')} />
        </motion.div>
      )}

      {/* 주간 스트립 + 탭 */}
      <motion.div variants={itemV} className="flex-1 flex flex-col bg-surface border border-line rounded-t-3xl mx-3 overflow-hidden shadow-emphasize min-h-0">

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
                <button key={ds} onClick={() => setSelectedDay(ds)}
                  className={`relative flex-1 flex flex-col items-center gap-1 rounded-xl py-2 px-0.5 border-2 transition-all overflow-hidden ${
                    isSelected
                      ? 'border-primary bg-primary-soft'
                      : bothDone
                      ? 'border-positive/30 bg-positive/5'
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
                        className="h-full bg-positive rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${fRate}%` }}
                        transition={{ duration: 0.5, delay: i * 0.04 + 0.1 }}
                      />
                    )}
                  </div>

                  {/* 완료 상태 도트 */}
                  <div className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                    bothDone ? 'bg-positive'
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
                      <svg width="54" height="54" viewBox="0 0 100 100" opacity="0.28">
                        <circle cx="50" cy="50" r="46" fill="none" stroke="#10b981" strokeWidth="5"/>
                        <circle cx="50" cy="50" r="36" fill="none" stroke="#10b981" strokeWidth="2"/>
                        <text x="50" y="54" textAnchor="middle" dominantBaseline="middle"
                          fill="#10b981" fontSize="22" fontWeight="900"
                          style={{ fontFamily: 'Pretendard, sans-serif' }}>완료</text>
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
            <div className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-positive" /><span className="text-caption2 text-label-assistive">신앙</span></div>
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

          <div className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}>
          <AnimatePresence mode="wait">
            {activeTab === 'personal' && (
              <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <PersonalTab />
              </motion.div>
            )}
            {activeTab === 'faith' && (
              <motion.div key="f" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <FaithTab />
              </motion.div>
            )}
            {activeTab === 'todo' && (
              <motion.div key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                <FAB options={[{
                  icon: <ListTodo size={20} />,
                  label: '투두 추가',
                  sub: '오늘의 할 일',
                  color: 'bg-primary',
                  onClick: () => navigate('/todos/new'),
                }]} />

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
      label="완벽"
      sublabel="오늘 100% 달성"
      color="#0066ff"
      rotation={-8}
      onComplete={() => setShowPerfectStamp(false)}
    />
    </>
  );
}
