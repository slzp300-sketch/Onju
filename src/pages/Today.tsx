import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import { useQuery } from '@tanstack/react-query';
import { Plus, Sunrise, Sun, Moon, CheckCircle2, Circle } from 'lucide-react';
import Card from '../components/ui/Card';
import DailyProgress from '../components/routines/DailyProgress';
import StreakCounter from '../components/ui/StreakCounter';
import ReviewBanner from '../components/review/ReviewBanner';
import { useRoutineStore } from '../store/routineStore';
import { useTodoStore } from '../store/todoStore';
import { useAuthStore } from '../store/authStore';
import { formatDisplay, today, getReviewPrompt } from '../utils/date';
import { getTodayRates, calcStreak } from '../utils/completion';
import { fetchReviews, fetchWeeklyShares } from '../api/reviews';
import { calcReviewStreak } from '../utils/reviewStreak';
import { useGroupStore } from '../store/groupStore';
import type { TimeSlot } from '../types';
import RoutineItem from '../components/routines/RoutineItem';

const TIME_SLOT_META: { value: TimeSlot; label: string; icon: React.ReactNode }[] = [
  { value: 'morning', label: '아침', icon: <Sunrise size={13} /> },
  { value: 'afternoon', label: '점심', icon: <Sun size={13} /> },
  { value: 'evening', label: '저녁', icon: <Moon size={13} /> },
];

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.03 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 550, damping: 20 } },
} as const;

export default function Today() {
  const navigate = useNavigate();
  const { personalRoutines, faithRoutines, logs } = useRoutineStore();
  const { todos, addTodo, toggleTodo } = useTodoStore();
  const { user } = useAuthStore();
  const todayStr = today();
  const prevCompleteRef = useRef(false);
  const [todoInput, setTodoInput] = useState('');

  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });
  const reviewPrompt = getReviewPrompt(reviews);
  const reviewStreak = calcReviewStreak(reviews);

  // 소모임 나눔 현황 — 리뷰 윈도우 중에만 fetc
  const { groups, myGroupIds } = useGroupStore();
  const myGroups = groups.filter(g => myGroupIds.includes(g.id));
  const week = reviewPrompt.weekNumber;
  const { data: nanumShares = [] } = useQuery({
    queryKey: ['weekly-shares', myGroupIds[0], week],
    queryFn: () => fetchWeeklyShares(myGroupIds[0], week),
    enabled: reviewPrompt.show && myGroupIds.length > 0,
  });

  const todayLogs = logs.filter(l => l.date === todayStr);
  const { personal, faith } = getTodayRates(personalRoutines, faithRoutines, todayLogs, todayStr);
  const allDone = personalRoutines.length > 0 && faithRoutines.length > 0 && personal === 100 && faith === 100;

  const { current: pStreak, best: pBest } = calcStreak(personalRoutines, logs, todayStr);
  const { current: fStreak, best: fBest } = calcStreak(faithRoutines, logs, todayStr);

  const todayTodos = todos.filter(t => t.date === todayStr);

  useEffect(() => {
    if (allDone && !prevCompleteRef.current) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.3 }, colors: ['#00BF40', '#0066FF', '#7C7FF5'] });
    }
    prevCompleteRef.current = allDone;
  }, [allDone]);

  const allRoutines = [...personalRoutines, ...faithRoutines];
  const grouped = TIME_SLOT_META.map(slot => ({
    ...slot,
    routines: allRoutines.filter(r => r.timeSlot === slot.value),
  })).filter(g => g.routines.length > 0);
  const unslotted = allRoutines.filter(r => !r.timeSlot);

  const handleAddTodo = () => {
    if (!todoInput.trim()) return;
    addTodo(todoInput.trim(), todayStr);
    setTodoInput('');
  };

  return (
    <motion.div variants={containerVariants} initial="hidden" animate="show" className="flex flex-col gap-4 pb-6">
      {/* 헤더 */}
      <motion.div variants={itemVariants} className="px-4 pt-5">
        <p className="text-caption1 text-label-alt font-medium">{formatDisplay(new Date())}</p>
        <h1 className="text-heading2 font-bold text-label-strong font-brand mt-0.5">
          안녕하세요, {user?.name.slice(-2)}님
        </h1>
      </motion.div>

      {/* 주간 리뷰 배너 — 일요일~월요일(유예) 윈도우 */}
      {reviewPrompt.show && (
        <motion.div variants={itemVariants} className="px-4 flex flex-col gap-2">
          <ReviewBanner
            completed={reviewPrompt.completed}
            overdue={reviewPrompt.overdue}
            weekRangeText={reviewPrompt.weekRangeText}
            streak={reviewStreak}
            onStart={() => navigate('/review', {
              state: {
                targetWeek: reviewPrompt.weekNumber,
                targetYear: reviewPrompt.year,
                weekStart: reviewPrompt.weekStart,
                weekEnd: reviewPrompt.weekEnd,
              },
            })}
          />
          {/* 소모임 나눔 현황 */}
          {myGroups.length > 0 && (() => {
            const group = myGroups[0];
            const shareCount = nanumShares.length;
            const memberCount = group.currentMemberCount;
            return (
              <div className="flex items-center gap-2 px-3 py-2 bg-surface-alt rounded-xl border border-line-soft">
                <span className="text-caption2 text-label-alt flex-1">
                  <span className="font-semibold text-label">{group.title}</span>에서{' '}
                  <span className="font-bold text-primary">{shareCount}/{memberCount}명</span>이 이번 주 나눔 완료
                </span>
                {shareCount === memberCount && memberCount > 0 && (
                  <span className="text-caption2 font-bold text-positive">🎉 전원 완료!</span>
                )}
              </div>
            );
          })()}
        </motion.div>
      )}

      {/* 스트릭 */}
      <motion.div variants={itemVariants} className="px-4">
        <StreakCounter personalStreak={pStreak} faithStreak={fStreak} personalBest={pBest} faithBest={fBest} />
      </motion.div>

      {/* 오늘 달성률 */}
      <motion.div variants={itemVariants}>
        <Card className="mx-4">
          <p className="text-caption1 font-semibold text-label-alt mb-3">오늘의 달성률</p>
          <DailyProgress />
        </Card>
      </motion.div>

      {/* 오늘의 루틴 */}
      <motion.div variants={itemVariants} className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-label1 font-bold text-label-strong">오늘의 루틴</h2>
          <button onClick={() => navigate('/routines')} className="text-label2 text-primary font-medium">
            관리 →
          </button>
        </div>

        {allRoutines.length === 0 ? (
          <div
            onClick={() => navigate('/routines')}
            className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-line rounded-xl cursor-pointer hover:border-primary transition-colors"
          >
            <p className="text-body2 text-label-alt">아직 루틴이 없어요</p>
            <p className="text-label2 text-primary mt-1 font-medium">+ 루틴 추가하러 가기</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {grouped.map(group => (
              <div key={group.value}>
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="text-label-alt">{group.icon}</span>
                  <span className="text-caption1 font-semibold text-label-alt">{group.label}</span>
                </div>
                <div className="bg-surface rounded-xl border border-line overflow-hidden divide-y divide-line-soft shadow-emphasize">
                  {group.routines.map(r => (
                    <RoutineItem key={r.id} routine={r} />
                  ))}
                </div>
              </div>
            ))}

            {unslotted.length > 0 && (
              <div>
                {grouped.length > 0 && (
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-caption1 font-semibold text-label-alt">기타</span>
                  </div>
                )}
                <div className="bg-surface rounded-xl border border-line overflow-hidden divide-y divide-line-soft shadow-emphasize">
                  {unslotted.map(r => (
                    <RoutineItem key={r.id} routine={r} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>

      {/* 오늘의 투두 */}
      <motion.div variants={itemVariants} className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-label1 font-bold text-label-strong">오늘의 투두</h2>
          <span className="text-caption1 text-label-alt">
            {todayTodos.filter(t => t.completed).length}/{todayTodos.length} 완료
          </span>
        </div>

        {/* 빠른 입력 */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={todoInput}
            onChange={e => setTodoInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddTodo()}
            placeholder="할 일 빠르게 추가..."
            className="flex-1 bg-surface border border-line rounded-lg px-3 h-11 text-body2 focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(0,102,255,0.15)] transition-all"
          />
          <button
            onClick={handleAddTodo}
            disabled={!todoInput.trim()}
            className="px-3 h-11 bg-primary text-white rounded-lg disabled:opacity-30 hover:bg-primary-strong transition-colors"
          >
            <Plus size={16} />
          </button>
        </div>

        {todayTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 border-2 border-dashed border-line rounded-xl">
            <p className="text-body2 text-label-alt">오늘의 할 일이 없어요</p>
          </div>
        ) : (
          <div className="bg-surface rounded-xl border border-line overflow-hidden divide-y divide-line-soft shadow-emphasize">
            {todayTodos.map(todo => (
              <button
                key={todo.id}
                onClick={() => toggleTodo(todo.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-fill transition-colors"
              >
                {todo.completed
                  ? <CheckCircle2 size={18} className="text-primary flex-shrink-0" />
                  : <Circle size={18} className="text-label-assistive flex-shrink-0" />
                }
                <span className={`text-body2 flex-1 ${todo.completed ? 'line-through text-label-assistive' : 'text-label'}`}>
                  {todo.title}
                </span>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
