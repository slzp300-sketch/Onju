import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ChevronRight, Flame, CheckCircle2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import Card from '../components/ui/Card';
import MonthlyCalendar from '../components/ui/MonthlyCalendar';
import { useRoutineStore } from '../store/routineStore';
import { useHabitStore } from '../store/habitStore';
import { useTodoStore } from '../store/todoStore';
import { useAuthStore } from '../store/authStore';
import { calcStreak, getRoutineStats } from '../utils/completion';
import { today } from '../utils/date';
import { fetchReviews } from '../api/reviews';

type TabType = 'daily' | 'weekly' | 'monthly';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const MOOD_EMOJI: Record<string, string> = { hard: '😓', normal: '😊', easy: '😌' };

function getWeekDays(): Date[] {
  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export default function Stats() {
  const [activeTab, setActiveTab] = useState<TabType>('daily');

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-lg font-bold text-gray-900">통계</h1>
      </div>

      {/* 탭 바 */}
      <div className="px-4 mb-1">
        <div className="flex bg-gray-100 rounded-2xl p-1">
          {(['daily', 'weekly', 'monthly'] as TabType[]).map((key, i) => (
            <motion.button key={key} whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              onClick={() => setActiveTab(key)}
              className={`relative flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'}`}>
              {['일간', '주간', '월간'][i]}
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'daily' && (
          <motion.div key="d" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <DailyTab />
          </motion.div>
        )}
        {activeTab === 'weekly' && (
          <motion.div key="w" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <WeeklyTab />
          </motion.div>
        )}
        {activeTab === 'monthly' && (
          <motion.div key="m" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <MonthlyTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════
   공통: 카테고리 섹션 헤더
════════════════════════════════════════ */
function CategoryHeader({ emoji, title, done, total, color }: {
  emoji: string; title: string; done: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl ${color}`}>
      <span className="text-xl">{emoji}</span>
      <div className="flex-1">
        <p className="text-sm font-bold text-gray-800">{title}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
            <motion.div className="h-full bg-current rounded-full"
              initial={{ width: 0 }} animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6 }} />
          </div>
          <span className="text-xs font-bold text-gray-700">{done}/{total}</span>
        </div>
      </div>
      <span className="text-lg font-bold text-gray-700">{pct}%</span>
    </div>
  );
}

/* ════════════════════════════════════════
   일간 탭
════════════════════════════════════════ */
function DailyTab() {
  const todayStr = today();
  const { faithRoutines, logs, isCompleted } = useRoutineStore();
  const { habits, isHabitCompleted } = useHabitStore();
  const { todos } = useTodoStore();
  const { current: streak } = calcStreak(faithRoutines, logs, todayStr);

  const todayTodos = todos.filter(t => t.date === todayStr);
  const doneTodos = todayTodos.filter(t => t.completed).length;
  const doneFaith = faithRoutines.filter(r => isCompleted(r.id)).length;
  const doneHabits = habits.filter(h => isHabitCompleted(h.id, todayStr)).length;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      <div>
        <p className="text-base font-bold text-gray-900">{format(new Date(), 'M월 d일 (EEEE)', { locale: ko })}</p>
        {streak > 0 && (
          <p className="text-xs text-orange-500 font-semibold mt-0.5 flex items-center gap-1">
            <Flame size={12} /> {streak}일 연속 달성 중
          </p>
        )}
      </div>

      {/* 개인 루틴 (습관) */}
      <div className="flex flex-col gap-2">
        <CategoryHeader emoji="📌" title="개인 루틴" done={doneHabits} total={habits.length} color="bg-indigo-50" />
        {habits.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {habits.map(h => {
              const done = isHabitCompleted(h.id, todayStr);
              return (
                <div key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-lg">{h.emoji}</span>
                  <span className={`flex-1 text-sm font-medium ${done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{h.title}</span>
                  {done ? <CheckCircle2 size={16} className="text-indigo-400" /> : <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
                </div>
              );
            })}
          </div>
        )}
        {habits.length === 0 && <EmptyHint text="등록된 개인 루틴이 없어요" />}
      </div>

      {/* 신앙 루틴 */}
      <div className="flex flex-col gap-2">
        <CategoryHeader emoji="🙏" title="신앙 루틴" done={doneFaith} total={faithRoutines.length} color="bg-emerald-50" />
        {faithRoutines.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {faithRoutines.map(r => {
              const done = isCompleted(r.id);
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-lg">{r.emoji ?? '✝️'}</span>
                  <span className={`flex-1 text-sm font-medium ${done ? 'line-through text-gray-400' : 'text-gray-700'}`}>{r.title}</span>
                  {done ? <CheckCircle2 size={16} className="text-emerald-400" /> : <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
                </div>
              );
            })}
          </div>
        )}
        {faithRoutines.length === 0 && <EmptyHint text="등록된 신앙 루틴이 없어요" />}
      </div>

      {/* 투두 */}
      <div className="flex flex-col gap-2">
        <CategoryHeader emoji="✅" title="투두" done={doneTodos} total={todayTodos.length} color="bg-violet-50" />
        {todayTodos.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
            {todayTodos.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-lg">{t.emoji ?? '📝'}</span>
                <span className={`flex-1 text-sm font-medium ${t.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.title}</span>
                {t.completed ? <CheckCircle2 size={16} className="text-violet-400" /> : <div className="w-4 h-4 rounded-full border-2 border-gray-200" />}
              </div>
            ))}
          </div>
        )}
        {todayTodos.length === 0 && <EmptyHint text="오늘 등록된 투두가 없어요" />}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   주간 탭
════════════════════════════════════════ */
function WeeklyTab() {
  const navigate = useNavigate();
  const { faithRoutines, logs } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
  const { todos } = useTodoStore();
  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });

  const weekDays = getWeekDays();

  const getRates = (type: 'faith' | 'habit' | 'todo') => {
    return weekDays.map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      const isFuture = d > new Date(new Date().setHours(23, 59, 59, 999));
      if (isFuture) return { ds, rate: null };

      if (type === 'faith') {
        if (faithRoutines.length === 0) return { ds, rate: 0 };
        const done = new Set(logs.filter(l => l.date === ds && l.completed).map(l => l.routineId));
        return { ds, rate: Math.round(faithRoutines.filter(r => done.has(r.id)).length / faithRoutines.length * 100) };
      }
      if (type === 'habit') {
        if (habits.length === 0) return { ds, rate: 0 };
        const done = habitLogs.filter(l => l.date === ds && l.completed).length;
        return { ds, rate: Math.round(done / habits.length * 100) };
      }
      // todo
      const dayTodos = todos.filter(t => t.date === ds);
      if (dayTodos.length === 0) return { ds, rate: 0 };
      return { ds, rate: Math.round(dayTodos.filter(t => t.completed).length / dayTodos.length * 100) };
    });
  };

  const faithRates = getRates('faith');
  const habitRates = getRates('habit');
  const todoRates = getRates('todo');

  const avg = (rates: { rate: number | null }[]) => {
    const valid = rates.filter(r => r.rate !== null).map(r => r.rate!);
    return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / 7) : 0;
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '개인 루틴', avg: avg(habitRates), color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: '신앙 루틴', avg: avg(faithRates), color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '투두', avg: avg(todoRates), color: 'text-violet-600', bg: 'bg-violet-50' },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className={`rounded-2xl border border-gray-100 p-3 ${c.bg}`}>
            <p className="text-[11px] text-gray-500 font-medium mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.avg}%</p>
            <p className="text-[10px] text-gray-400 mt-0.5">주간 평균</p>
          </motion.div>
        ))}
      </div>

      {/* 개인 루틴 바 차트 */}
      <WeeklyBarChart label="📌 개인 루틴" rates={habitRates} color="bg-indigo-400" emptyText={habits.length === 0 ? '등록된 개인 루틴이 없어요' : undefined} />

      {/* 신앙 루틴 바 차트 */}
      <WeeklyBarChart label="🙏 신앙 루틴" rates={faithRates} color="bg-emerald-400" emptyText={faithRoutines.length === 0 ? '등록된 신앙 루틴이 없어요' : undefined} />

      {/* 투두 바 차트 */}
      <WeeklyBarChart label="✅ 투두" rates={todoRates} color="bg-violet-400" emptyText={undefined} />

      {/* 주간 리뷰 히스토리 */}
      {reviews.length > 0 && (
        <div>
          <p className="text-xs font-bold text-gray-500 mb-3">주간 리뷰 히스토리</p>
          <div className="flex flex-col gap-2">
            {reviews.slice(0, 4).map((review, i) => (
              <motion.button key={review.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/review/result/${review.year}-${review.weekNumber}`)}
                className="w-full bg-white rounded-2xl p-4 border border-gray-100 text-left flex items-center gap-3 hover:border-indigo-200 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-gray-700">{review.year}년 {review.weekNumber}주차</p>
                    {review.mood && <span>{MOOD_EMOJI[review.mood]}</span>}
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="text-indigo-500">개인 {review.personalRate}%</span>
                    <span className="text-emerald-500">신앙 {review.faithRate}%</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-gray-300" />
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyBarChart({ label, rates, color, emptyText }: {
  label: string;
  rates: { ds: string; rate: number | null }[];
  color: string;
  emptyText?: string;
}) {
  const todayStr = today();
  return (
    <Card>
      <p className="text-xs font-bold text-gray-700 mb-3">{label}</p>
      {emptyText ? (
        <p className="text-xs text-gray-400 text-center py-3">{emptyText}</p>
      ) : (
        <div className="flex items-end gap-1.5" style={{ height: 72 }}>
          {rates.map((d, i) => {
            const isFuture = d.rate === null;
            const rate = d.rate ?? 0;
            const barH = isFuture ? 0 : Math.max(rate, 4);
            const isToday = d.ds === todayStr;
            return (
              <div key={d.ds} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col justify-end" style={{ height: 56 }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: isFuture ? 0 : `${barH}%` }}
                    transition={{ duration: 0.5, delay: i * 0.04 }}
                    className={`w-full rounded-t-md ${isFuture ? 'bg-transparent' : rate === 100 ? color : rate > 0 ? `${color} opacity-50` : 'bg-gray-100'}`}
                  />
                </div>
                <span className={`text-[10px] font-semibold ${isToday ? 'text-indigo-500' : 'text-gray-400'}`}>
                  {DAY_LABELS[i]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ════════════════════════════════════════
   월간 탭
════════════════════════════════════════ */
function MonthlyTab() {
  const { personalRoutines, faithRoutines, logs } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
  const { todos } = useTodoStore();
  const { user } = useAuthStore();
  const reportRef = useRef<HTMLDivElement>(null);
  const todayStr = today();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const { current: fStreak, best: fBest } = calcStreak(faithRoutines, logs, todayStr);
  const faithStats = getRoutineStats(faithRoutines, logs, monthStart, monthEnd);
  const faithAvg = faithStats.reduce((a, s) => a + s.rate, 0) / (faithStats.length || 1);

  // 이번달 습관 달성률 (habitLogs 기준)
  const daysInMonth = monthEnd.getDate();
  const habitMonthRate = habits.length > 0
    ? Math.round(habitLogs.filter(l => l.date >= format(monthStart, 'yyyy-MM-dd') && l.date <= format(monthEnd, 'yyyy-MM-dd') && l.completed).length / (habits.length * daysInMonth) * 100)
    : 0;

  // 이번달 투두 완료율
  const monthTodos = todos.filter(t => t.date >= format(monthStart, 'yyyy-MM-dd') && t.date <= format(monthEnd, 'yyyy-MM-dd'));
  const todoMonthRate = monthTodos.length > 0
    ? Math.round(monthTodos.filter(t => t.completed).length / monthTodos.length * 100)
    : 0;

  const handleDownload = async () => {
    if (!reportRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = `온주_${todayStr}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      <div>
        <p className="text-base font-bold text-gray-900">{format(now, 'yyyy년 M월', { locale: ko })}</p>
        <p className="text-xs text-gray-400 mt-0.5">이번 달 루틴 & 투두 기록</p>
      </div>

      {/* 3개 요약 카드 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '개인 루틴', value: `${habitMonthRate}%`, sub: '월 평균', color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: '신앙 루틴', value: `${Math.round(faithAvg)}%`, sub: '월 평균', color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: '투두', value: `${todoMonthRate}%`, sub: `${monthTodos.length}개 등록`, color: 'text-violet-600', bg: 'bg-violet-50' },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className={`rounded-2xl border border-gray-100 p-3 ${c.bg}`}>
            <p className="text-[11px] text-gray-500 font-medium mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">{c.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* 신앙 루틴 히트맵 */}
      <Card>
        <p className="text-xs font-bold text-gray-700 mb-3">🙏 신앙 루틴 월간 히트맵</p>
        <MonthlyCalendar personalRoutines={personalRoutines} faithRoutines={faithRoutines} logs={logs} month={now} />
      </Card>

      {/* 신앙 루틴별 달성률 */}
      {faithStats.length > 0 && (
        <Card>
          <p className="text-xs font-bold text-gray-700 mb-3">🙏 신앙 루틴별 달성률</p>
          <div className="flex flex-col divide-y divide-gray-50">
            {faithStats.map(({ routine, rate }) => (
              <div key={routine.id} className="py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-700 truncate flex-1 mr-3">{routine.emoji ?? '✝️'} {routine.title}</span>
                  <span className={`text-sm font-bold ${rate >= 80 ? 'text-emerald-500' : rate >= 50 ? 'text-indigo-500' : 'text-red-400'}`}>{rate}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${rate}%` }} transition={{ duration: 0.6 }}
                    className={`h-full rounded-full ${rate >= 80 ? 'bg-emerald-400' : rate >= 50 ? 'bg-indigo-400' : 'bg-red-300'}`} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 연속 달성 */}
      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-orange-400" />
            <div>
              <p className="text-sm font-bold text-gray-800">신앙 루틴 연속 달성</p>
              <p className="text-xs text-gray-400">최고 {fBest}일</p>
            </div>
          </div>
          <p className="text-2xl font-bold text-orange-500">{fStreak}일</p>
        </div>
      </Card>

      {/* 월간 리포트 */}
      <div ref={reportRef}>
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-6 text-white">
          <p className="text-xs opacity-70 mb-1">온주</p>
          <h3 className="text-lg font-bold mb-4">{user?.name}님의 {format(now, 'M월')} 기록</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: '개인 루틴', value: `${habitMonthRate}%` },
              { label: '신앙 루틴', value: `${Math.round(faithAvg)}%` },
              { label: '투두', value: `${todoMonthRate}%` },
            ].map(c => (
              <div key={c.label} className="bg-white/10 rounded-2xl p-3 text-center">
                <p className="text-xs opacity-70 mb-1">{c.label}</p>
                <p className="text-lg font-bold">{c.value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs opacity-60">🔥 신앙 루틴 최고 {fBest}일 연속 달성</p>
        </div>
      </div>
      <button onClick={handleDownload}
        className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
        <Download size={16} /> 이미지로 저장
      </button>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 px-4 py-4 text-center">
      <p className="text-xs text-gray-400">{text}</p>
    </div>
  );
}
