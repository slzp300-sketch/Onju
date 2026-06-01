import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame, Target, CalendarDays, Trash2, ListTodo } from 'lucide-react';
import FAB from '../components/ui/FAB';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfWeek, addDays } from 'date-fns';
import { ko } from 'date-fns/locale';
import confetti from 'canvas-confetti';
import { useRoutineStore } from '../store/routineStore';
import { useTodoStore } from '../store/todoStore';
import { useGoalStore } from '../store/goalStore';
import { useAuthStore } from '../store/authStore';
import { calcStreak } from '../utils/completion';
import { today, isSunday, currentWeek, currentYear, isReviewCompleted, getWeekRangeText } from '../utils/date';
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

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

/* ── 이번 주 월~일 날짜 배열 ── */
function getWeekDays(): Date[] {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/* ── 특정 날짜의 루틴 달성률 계산 ── */
function getDayRate(routines: import('../types').DailyRoutine[], logs: import('../types').RoutineLog[], dateStr: string): number {
  if (routines.length === 0) return 0;
  const dayLogs = logs.filter(l => l.date === dateStr && l.completed);
  const completedIds = new Set(dayLogs.map(l => l.routineId));
  const done = routines.filter(r => completedIds.has(r.id)).length;
  return Math.round((done / routines.length) * 100);
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } } as const;
const itemV = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 420, damping: 28 } } } as const;

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { faithRoutines, logs, isCompleted } = useRoutineStore();
  const { todos, toggleTodo, removeTodo } = useTodoStore();
  const { weeklyGoals, monthlyGoals } = useGoalStore();
  const todayStr = today();
  const prevCompleteRef = useRef(false);
  const [activeTab, setActiveTab] = useState<TabType>('personal');
  const [selectedDay, setSelectedDay] = useState<string>(todayStr);

  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });

  const { current: streak } = calcStreak(faithRoutines, logs, todayStr);
  const allDone = faithRoutines.length > 0 && faithRoutines.every(r => isCompleted(r.id));

  useEffect(() => {
    if (allDone && !prevCompleteRef.current) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.3 }, colors: ['#1D9E75', '#378ADD', '#7F77DD'] });
    }
    prevCompleteRef.current = allDone;
  }, [allDone]);

  const now = new Date();
  const thisMonthGoals = monthlyGoals.filter(g => g.month === now.getMonth() + 1 && g.year === now.getFullYear());
  const thisWeekGoals = weeklyGoals.filter(g => g.weekNumber === currentWeek() && g.year === currentYear());
  const todayTodos = todos.filter(t => t.date === todayStr);
  const doneTodos = todayTodos.filter(t => t.completed).length;
  const doneFaith = faithRoutines.filter(r => isCompleted(r.id)).length;
  const weekDays = getWeekDays();

  // 한주 달성률 (신앙 루틴 기준)
  const weekRates = weekDays.map(d => {
    const ds = format(d, 'yyyy-MM-dd');
    return { date: ds, rate: getDayRate(faithRoutines, logs, ds) };
  });
  const badges: Record<TabType, string | undefined> = {
    personal: undefined,
    faith: faithRoutines.length > 0 ? `${doneFaith}/${faithRoutines.length}` : undefined,
    todo: todayTodos.length > 0 ? `${doneTodos}/${todayTodos.length}` : undefined,
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col pb-8">

      {/* ── 헤더 ── */}
      <motion.div variants={itemV} className="px-4 pt-5 pb-3 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium">{format(new Date(), 'yyyy년 M월', { locale: ko })}</p>
          <h1 className="text-lg font-bold text-gray-900 mt-0.5">안녕하세요, {user?.name}님 👋</h1>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1 bg-orange-50 px-2.5 py-1.5 rounded-xl mt-1">
            <Flame size={13} className="text-orange-400" />
            <span className="text-xs font-bold text-orange-500">{streak}일</span>
          </div>
        )}
      </motion.div>

      {/* ── 이번달 / 이번주 목표 (한 행) ── */}
      <motion.div variants={itemV} className="px-4 mb-4 flex gap-3">
        {/* 이번달 목표 */}
        <button onClick={() => navigate('/goals/monthly')}
          className="flex-1 bg-white border border-gray-100 rounded-2xl px-3 py-3 text-left hover:border-indigo-200 transition-colors">
          <div className="flex items-center gap-1 mb-2">
            <CalendarDays size={12} className="text-gray-400" />
            <span className="text-[11px] font-semibold text-gray-400">이번달 목표</span>
          </div>
          {thisMonthGoals.length === 0 ? (
            <p className="text-xs text-gray-300 font-medium">목표를 세워보세요</p>
          ) : (
            <div className="flex flex-col gap-1">
              {thisMonthGoals.slice(0, 2).map(g => (
                <div key={g.id} className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${g.status === 'completed' ? 'bg-indigo-400' : 'bg-gray-300'}`} />
                  <p className={`text-xs font-medium truncate ${g.status === 'completed' ? 'line-through text-gray-400' : 'text-gray-700'}`}>{g.title}</p>
                </div>
              ))}
              {thisMonthGoals.length > 2 && (
                <p className="text-[11px] text-gray-400">+{thisMonthGoals.length - 2}개 더</p>
              )}
            </div>
          )}
        </button>

        {/* 이번주 목표 */}
        <button onClick={() => navigate('/goals/weekly')}
          className="flex-1 bg-white border border-gray-100 rounded-2xl px-3 py-3 text-left hover:border-indigo-200 transition-colors">
          <div className="flex items-center gap-1 mb-2">
            <Target size={12} className="text-gray-400" />
            <span className="text-[11px] font-semibold text-gray-400">이번주 목표</span>
          </div>
          {thisWeekGoals.length === 0 ? (
            <p className="text-xs text-gray-300 font-medium">목표를 추가해보세요</p>
          ) : (
            <div className="flex flex-col gap-1">
              {thisWeekGoals.slice(0, 2).map(g => (
                <div key={g.id} className="flex items-center gap-1.5">
                  <div className="relative w-4 h-4 flex-shrink-0">
                    <svg className="w-4 h-4 -rotate-90" viewBox="0 0 16 16">
                      <circle cx="8" cy="8" r="6" fill="none" stroke="#e5e7eb" strokeWidth="2" />
                      <circle cx="8" cy="8" r="6" fill="none" stroke="#6366f1" strokeWidth="2"
                        strokeDasharray={`${2 * Math.PI * 6}`}
                        strokeDashoffset={`${2 * Math.PI * 6 * (1 - g.completionRate / 100)}`}
                        strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-gray-700 truncate">{g.title}</p>
                </div>
              ))}
              {thisWeekGoals.length > 2 && (
                <p className="text-[11px] text-gray-400">+{thisWeekGoals.length - 2}개 더</p>
              )}
            </div>
          )}
        </button>
      </motion.div>

      {/* ── 일요일 리뷰 배너 ── */}
      {isSunday() && (
        <motion.div variants={itemV} className="px-4 mb-4">
          <ReviewBanner completed={isReviewCompleted(reviews, currentWeek(), currentYear())} weekRangeText={getWeekRangeText()} onStart={() => navigate('/review')} />
        </motion.div>
      )}

      {/* ── 주간 스트립 + 루틴 탭 그룹 ── */}
      <motion.div variants={itemV} className="bg-white border border-gray-100 rounded-t-3xl mx-3 overflow-hidden">

      {/* 주간 날짜 스트립 */}
      <div className="px-2 pt-3 pb-2">
        <div className="bg-white rounded-2xl border border-gray-100 px-2 py-3">
          <div className="flex justify-between">
            {weekDays.map((d, i) => {
              const ds = format(d, 'yyyy-MM-dd');
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDay;
              const rate = weekRates[i].rate;
              const isFuture = d > new Date(new Date().setHours(23, 59, 59, 999));

              return (
                <button
                  key={ds}
                  onClick={() => setSelectedDay(ds)}
                  className="flex flex-col items-center gap-1.5 flex-1"
                >
                  {/* 요일 */}
                  <span className={`text-[11px] font-semibold ${isToday ? 'text-indigo-500' : 'text-gray-400'}`}>
                    {DAY_LABELS[i]}
                  </span>

                  {/* 날짜 + 달성률 링 */}
                  <div className="relative w-9 h-9 flex items-center justify-center">
                    {/* 달성률 링 */}
                    {!isFuture && rate > 0 && (
                      <svg className="absolute inset-0 w-9 h-9 -rotate-90" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="#e5e7eb" strokeWidth="2.5" />
                        <circle
                          cx="18" cy="18" r="15" fill="none"
                          stroke={isToday ? '#6366f1' : '#a5b4fc'}
                          strokeWidth="2.5"
                          strokeDasharray={`${2 * Math.PI * 15}`}
                          strokeDashoffset={`${2 * Math.PI * 15 * (1 - rate / 100)}`}
                          strokeLinecap="round"
                        />
                      </svg>
                    )}
                    {!isFuture && rate === 0 && (
                      <svg className="absolute inset-0 w-9 h-9" viewBox="0 0 36 36">
                        <circle cx="18" cy="18" r="15" fill="none" stroke="#f3f4f6" strokeWidth="2.5" />
                      </svg>
                    )}

                    {/* 날짜 숫자 */}
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold z-10 ${
                      isSelected && isToday ? 'bg-indigo-500 text-white'
                      : isSelected ? 'bg-gray-800 text-white'
                      : isToday ? 'text-indigo-600'
                      : isFuture ? 'text-gray-300'
                      : 'text-gray-600'
                    }`}>
                      {format(d, 'd')}
                    </div>
                  </div>

                  {/* 달성률 텍스트 */}
                  <span className={`text-[10px] font-bold ${
                    isFuture ? 'text-transparent' : rate === 100 ? 'text-indigo-500' : rate > 0 ? 'text-gray-400' : 'text-gray-300'
                  }`}>
                    {isFuture ? '-' : rate > 0 ? `${rate}%` : '·'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 루틴 3탭 */}
      <div className="border-t border-gray-100">
        {/* 탭 바 */}
        <div className="flex border-b border-gray-100 bg-white">
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`relative flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 text-xs font-bold transition-colors ${activeTab === tab.key ? 'text-gray-900' : 'text-gray-400'}`}>
              <span>{tab.label}</span>
              {badges[tab.key] && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}>
                  {badges[tab.key]}
                </span>
              )}
              {activeTab === tab.key && (
                <motion.div layoutId="tab3Line" className="absolute bottom-0 left-3 right-3 h-0.5 bg-gray-900 rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
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
                color: 'bg-indigo-500',
                onClick: () => navigate('/todos/new'),
              }]} />

              {todayTodos.length === 0 ? (
                <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                  <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-4xl mb-5">
                    ✅
                  </div>
                  <p className="text-base font-bold text-gray-700 mb-1">오늘 할 일을 적어보세요</p>
                  <p className="text-sm text-gray-400 leading-relaxed">
                    하나씩 체크할 때마다<br />성취감이 쌓여가요
                  </p>
                </div>
              ) : (
                <div className="bg-white">
                  <div className="divide-y divide-gray-50">
                    {todayTodos.filter(t => !t.completed).map((todo, idx) => (
                      <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                        <span className="text-xs font-bold w-5 text-center text-gray-400 flex-shrink-0">{idx + 1}</span>
                        <button onClick={() => toggleTodo(todo.id)} className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0 hover:border-indigo-400 transition-colors" />
                        <span className="flex-1 text-sm font-medium text-gray-800">{todo.title}</span>
                        <button onClick={() => removeTodo(todo.id)} className="text-gray-200 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  {todayTodos.filter(t => t.completed).length > 0 && (
                    <>
                      <div className="px-4 py-2 bg-gray-50 border-y border-gray-100">
                        <span className="text-xs font-bold text-gray-400">완료 {doneTodos}개</span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {todayTodos.filter(t => t.completed).map((todo, idx) => (
                          <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                            <span className="text-xs font-bold w-5 text-center text-gray-300 flex-shrink-0">
                              {todayTodos.filter(t => !t.completed).length + idx + 1}
                            </span>
                            <button onClick={() => toggleTodo(todo.id)}
                              className="w-5 h-5 rounded-full border-2 border-indigo-400 bg-indigo-400 flex items-center justify-center flex-shrink-0">
                              <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                <path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            <span className="flex-1 text-sm font-medium line-through text-gray-400">{todo.title}</span>
                            <button onClick={() => removeTodo(todo.id)} className="text-gray-200 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      </motion.div>
    </motion.div>
  );
}

