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
        <h1 className="text-heading2 font-bold text-label-strong font-brand">통계</h1>
      </div>

      <div className="px-4 mb-1">
        <div className="flex bg-fill rounded-xl p-1">
          {(['daily', 'weekly', 'monthly'] as TabType[]).map((key, i) => (
            <motion.button key={key} whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.12 }}
              onClick={() => setActiveTab(key)}
              className={`relative flex-1 py-2 rounded-lg text-label1 font-semibold transition-colors ${activeTab === key ? 'bg-surface text-label-strong shadow-emphasize' : 'text-label-alt'}`}>
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

function CategoryHeader({ emoji, title, done, total, bg }: {
  emoji: string; title: string; done: number; total: number; bg: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl ${bg}`}>
      <span className="text-xl">{emoji}</span>
      <div className="flex-1">
        <p className="text-body2 font-bold text-label-strong">{title}</p>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 h-1.5 bg-white/60 rounded-full overflow-hidden">
            <motion.div className="h-full bg-primary rounded-full"
              initial={{ width: 0 }} animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6 }} />
          </div>
          <span className="text-caption2 font-bold text-label">{done}/{total}</span>
        </div>
      </div>
      <span className="text-label1 font-bold text-primary">{pct}%</span>
    </div>
  );
}

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
        <p className="text-body1 font-bold text-label-strong">{format(new Date(), 'M월 d일 (EEEE)', { locale: ko })}</p>
        {streak > 0 && (
          <p className="text-caption1 text-cautionary font-semibold mt-0.5 flex items-center gap-1">
            <Flame size={12} /> {streak}일 연속 달성 중이에요
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <CategoryHeader emoji="📌" title="개인 루틴" done={doneHabits} total={habits.length} bg="bg-primary-soft" />
        {habits.length > 0 && (
          <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden divide-y divide-line-soft">
            {habits.map(h => {
              const done = isHabitCompleted(h.id, todayStr);
              return (
                <div key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-lg">{h.emoji}</span>
                  <span className={`flex-1 text-body2 font-medium ${done ? 'line-through text-label-assistive' : 'text-label'}`}>{h.title}</span>
                  {done ? <CheckCircle2 size={16} className="text-primary" /> : <div className="w-4 h-4 rounded-full border-2 border-line" />}
                </div>
              );
            })}
          </div>
        )}
        {habits.length === 0 && <EmptyHint text="등록된 개인 루틴이 없어요" />}
      </div>

      <div className="flex flex-col gap-2">
        <CategoryHeader emoji="🙏" title="신앙 루틴" done={doneFaith} total={faithRoutines.length} bg="bg-positive/10" />
        {faithRoutines.length > 0 && (
          <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden divide-y divide-line-soft">
            {faithRoutines.map(r => {
              const done = isCompleted(r.id);
              return (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="text-lg">{r.emoji ?? '✝️'}</span>
                  <span className={`flex-1 text-body2 font-medium ${done ? 'line-through text-label-assistive' : 'text-label'}`}>{r.title}</span>
                  {done ? <CheckCircle2 size={16} className="text-positive" /> : <div className="w-4 h-4 rounded-full border-2 border-line" />}
                </div>
              );
            })}
          </div>
        )}
        {faithRoutines.length === 0 && <EmptyHint text="등록된 신앙 루틴이 없어요" />}
      </div>

      <div className="flex flex-col gap-2">
        <CategoryHeader emoji="✅" title="투두" done={doneTodos} total={todayTodos.length} bg="bg-fill" />
        {todayTodos.length > 0 && (
          <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden divide-y divide-line-soft">
            {todayTodos.map(t => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-lg">{t.emoji ?? '📝'}</span>
                <span className={`flex-1 text-body2 font-medium ${t.completed ? 'line-through text-label-assistive' : 'text-label'}`}>{t.title}</span>
                {t.completed ? <CheckCircle2 size={16} className="text-primary" /> : <div className="w-4 h-4 rounded-full border-2 border-line" />}
              </div>
            ))}
          </div>
        )}
        {todayTodos.length === 0 && <EmptyHint text="오늘 등록된 투두가 없어요" />}
      </div>
    </div>
  );
}

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
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '개인 루틴', avg: avg(habitRates) },
          { label: '신앙 루틴', avg: avg(faithRates) },
          { label: '투두', avg: avg(todoRates) },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="rounded-xl border border-line bg-surface shadow-emphasize p-3">
            <p className="text-caption2 text-label-alt font-medium mb-1">{c.label}</p>
            <p className="text-title3 font-bold text-primary">{c.avg}%</p>
            <p className="text-caption2 text-label-assistive mt-0.5">주간 평균</p>
          </motion.div>
        ))}
      </div>

      <WeeklyBarChart label="📌 개인 루틴" rates={habitRates} emptyText={habits.length === 0 ? '등록된 개인 루틴이 없어요' : undefined} />
      <WeeklyBarChart label="🙏 신앙 루틴" rates={faithRates} emptyText={faithRoutines.length === 0 ? '등록된 신앙 루틴이 없어요' : undefined} />
      <WeeklyBarChart label="✅ 투두" rates={todoRates} emptyText={undefined} />

      {reviews.length > 0 && (
        <div>
          <p className="text-caption1 font-bold text-label-alt mb-3">주간 리뷰 히스토리</p>
          <div className="flex flex-col gap-2">
            {reviews.slice(0, 4).map((review, i) => (
              <motion.button key={review.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.12 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/review/result/${review.year}-${review.weekNumber}`)}
                className="w-full bg-surface rounded-xl p-4 border border-line shadow-emphasize text-left flex items-center gap-3 hover:bg-fill transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-label2 font-semibold text-label">{review.year}년 {review.weekNumber}주차</p>
                    {review.mood && <span>{MOOD_EMOJI[review.mood]}</span>}
                  </div>
                  <div className="flex gap-3 text-caption1">
                    <span className="text-primary">개인 {review.personalRate}%</span>
                    <span className="text-positive">신앙 {review.faithRate}%</span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-label-assistive" />
              </motion.button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WeeklyBarChart({ label, rates, emptyText }: {
  label: string;
  rates: { ds: string; rate: number | null }[];
  emptyText?: string;
}) {
  const todayStr = today();
  return (
    <Card>
      <p className="text-caption1 font-bold text-label mb-3">{label}</p>
      {emptyText ? (
        <p className="text-caption1 text-label-assistive text-center py-3">{emptyText}</p>
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
                    className={`w-full rounded-t-sm ${isFuture ? 'bg-transparent' : rate === 100 ? 'bg-primary' : rate > 0 ? 'bg-primary opacity-50' : 'bg-fill'}`}
                  />
                </div>
                <span className={`text-caption2 font-semibold ${isToday ? 'text-primary' : 'text-label-assistive'}`}>
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

  const daysInMonth = monthEnd.getDate();
  const habitMonthRate = habits.length > 0
    ? Math.round(habitLogs.filter(l => l.date >= format(monthStart, 'yyyy-MM-dd') && l.date <= format(monthEnd, 'yyyy-MM-dd') && l.completed).length / (habits.length * daysInMonth) * 100)
    : 0;

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
        <p className="text-body1 font-bold text-label-strong">{format(now, 'yyyy년 M월', { locale: ko })}</p>
        <p className="text-caption1 text-label-alt mt-0.5">이번 달 루틴 & 투두 기록</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { label: '개인 루틴', value: `${habitMonthRate}%`, sub: '월 평균' },
          { label: '신앙 루틴', value: `${Math.round(faithAvg)}%`, sub: '월 평균' },
          { label: '투두', value: `${todoMonthRate}%`, sub: `${monthTodos.length}개 등록` },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
            className="rounded-xl border border-line bg-surface shadow-emphasize p-3">
            <p className="text-caption2 text-label-alt font-medium mb-1">{c.label}</p>
            <p className="text-title3 font-bold text-primary">{c.value}</p>
            <p className="text-caption2 text-label-assistive mt-0.5">{c.sub}</p>
          </motion.div>
        ))}
      </div>

      <Card>
        <p className="text-caption1 font-bold text-label mb-3">🙏 신앙 루틴 월간 히트맵</p>
        <MonthlyCalendar personalRoutines={personalRoutines} faithRoutines={faithRoutines} logs={logs} month={now} />
      </Card>

      {faithStats.length > 0 && (
        <Card>
          <p className="text-caption1 font-bold text-label mb-3">🙏 신앙 루틴별 달성률</p>
          <div className="flex flex-col divide-y divide-line-soft">
            {faithStats.map(({ routine, rate }) => (
              <div key={routine.id} className="py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-body2 text-label truncate flex-1 mr-3">{routine.emoji ?? '✝️'} {routine.title}</span>
                  <span className={`text-body2 font-bold ${rate >= 80 ? 'text-positive' : rate >= 50 ? 'text-primary' : 'text-negative'}`}>{rate}%</span>
                </div>
                <div className="h-1.5 bg-fill rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${rate}%` }} transition={{ duration: 0.6 }}
                    className={`h-full rounded-full ${rate >= 80 ? 'bg-positive' : rate >= 50 ? 'bg-primary' : 'bg-negative'}`} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flame size={18} className="text-cautionary" />
            <div>
              <p className="text-body2 font-bold text-label-strong">신앙 루틴 연속 달성</p>
              <p className="text-caption1 text-label-alt">최고 {fBest}일</p>
            </div>
          </div>
          <p className="text-title2 font-bold text-cautionary">{fStreak}일</p>
        </div>
      </Card>

      {/* 월간 리포트 — 브랜드 그라데이션 (배경/버튼 아님, 브랜드 모먼트) */}
      <div ref={reportRef}>
        <div className="bg-gradient-to-br from-primary-heavy to-primary rounded-2xl p-6 text-white">
          <p className="text-caption1 opacity-70 mb-1">온주</p>
          <h3 className="text-heading2 font-bold mb-4 font-brand">{user?.name}님의 {format(now, 'M월')} 기록</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: '개인 루틴', value: `${habitMonthRate}%` },
              { label: '신앙 루틴', value: `${Math.round(faithAvg)}%` },
              { label: '투두', value: `${todoMonthRate}%` },
            ].map(c => (
              <div key={c.label} className="bg-white/10 rounded-xl p-3 text-center">
                <p className="text-caption2 opacity-70 mb-1">{c.label}</p>
                <p className="text-heading2 font-bold">{c.value}</p>
              </div>
            ))}
          </div>
          <p className="text-caption1 opacity-60">🔥 신앙 루틴 최고 {fBest}일 연속 달성</p>
        </div>
      </div>
      <button onClick={handleDownload}
        className="flex items-center justify-center gap-2 h-11 rounded-lg border border-line text-body2 font-medium text-label hover:bg-fill transition-colors">
        <Download size={16} /> 이미지로 저장
      </button>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="bg-surface rounded-xl border border-line shadow-emphasize px-4 py-4 text-center">
      <p className="text-caption1 text-label-assistive">{text}</p>
    </div>
  );
}
