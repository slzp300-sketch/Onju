import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Target } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format, getDay } from 'date-fns';
import Card from '../components/ui/Card';
import ReviewBanner from '../components/review/ReviewBanner';
import { useRoutineStore } from '../store/routineStore';
import { useHabitStore } from '../store/habitStore';
import { useGoalStore } from '../store/goalStore';
import { useTodoStore } from '../store/todoStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  today, getWeekDays, ALL_DAY_LABELS, elapsedDays,
  currentWeek, currentYear, isReviewCompleted, getWeekRangeText,
} from '../utils/date';
import { getGoalRate, getGoalAdherence, getLinkedItems } from '../utils/goalProgress';
import { getHabitStat, type DayStatus } from '../utils/habitStats';
import { fetchReviews } from '../api/reviews';
import type { MonthlyGoal } from '../types';

type TabType = 'goal' | 'habit' | 'weekly';

const MOOD_EMOJI: Record<string, string> = { hard: '😓', normal: '😊', easy: '😌' };

export default function Stats() {
  const [activeTab, setActiveTab] = useState<TabType>('goal');

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-heading2 font-bold text-label-strong font-brand">통계</h1>
      </div>

      <div className="px-4 mb-1">
        <div className="flex bg-fill rounded-xl p-1">
          {([['goal', '목표'], ['habit', '습관'], ['weekly', '주간']] as [TabType, string][]).map(([key, label]) => (
            <motion.button key={key} whileTap={{ scale: 0.98 }}
              transition={{ duration: 0.12 }}
              onClick={() => setActiveTab(key)}
              className={`relative flex-1 py-2 rounded-lg text-label1 font-semibold transition-colors ${activeTab === key ? 'bg-surface text-label-strong shadow-emphasize' : 'text-label-alt'}`}>
              {label}
            </motion.button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'goal' && (
          <motion.div key="g" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <GoalStatsTab />
          </motion.div>
        )}
        {activeTab === 'habit' && (
          <motion.div key="h" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <HabitStatsTab />
          </motion.div>
        )}
        {activeTab === 'weekly' && (
          <motion.div key="w" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <WeeklyTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════
   목표 통계 탭
════════════════════════════════════════ */
function GoalStatsTab() {
  const navigate = useNavigate();
  const { monthlyGoals } = useGoalStore();
  const { habits, habitLogs } = useHabitStore();
  const { faithRoutines, logs } = useRoutineStore();

  const todayIso = today();
  const activeGoals = monthlyGoals.filter(g => g.endDate >= todayIso);
  const pastGoals   = monthlyGoals.filter(g => g.endDate < todayIso);

  if (activeGoals.length === 0 && pastGoals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center mb-4">
          <Target size={28} className="text-primary" />
        </div>
        <p className="text-body1 font-bold text-label-strong mb-1">아직 목표가 없어요</p>
        <p className="text-caption1 text-label-alt mb-5">목표를 세우고 습관으로 지켜가 보세요</p>
        <motion.button whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/goals')}
          className="px-5 py-2.5 rounded-xl bg-primary text-white text-body2 font-bold">
          목표 만들러 가기
        </motion.button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      {activeGoals.map(g => (
        <GoalStatCard key={g.id} goal={g}
          rate={getGoalRate(g, habits, habitLogs, faithRoutines, logs, todayIso)}
          adherence={getGoalAdherence(g, habits, habitLogs, faithRoutines, logs, todayIso)}
          items={getLinkedItems(g, habits, habitLogs, faithRoutines, logs, todayIso)}
          onClick={() => navigate('/goals')}
        />
      ))}

      {pastGoals.length > 0 && (
        <>
          <p className="text-caption1 font-bold text-label-assistive mt-1">종료된 목표</p>
          {pastGoals.map(g => (
            <GoalStatCard key={g.id} goal={g} past
              rate={getGoalRate(g, habits, habitLogs, faithRoutines, logs, todayIso)}
              adherence={getGoalAdherence(g, habits, habitLogs, faithRoutines, logs, todayIso)}
              items={getLinkedItems(g, habits, habitLogs, faithRoutines, logs, todayIso)}
              onClick={() => navigate('/goals')}
            />
          ))}
        </>
      )}
    </div>
  );
}

function adherenceStatus(adherence: number): { label: string; color: string } {
  if (adherence >= 80) return { label: '잘 지키고 있어요', color: 'var(--color-positive)' };
  if (adherence >= 50) return { label: '조금 더 힘내요', color: 'var(--color-primary)' };
  return { label: '다시 시작해봐요', color: 'var(--color-negative)' };
}

function GoalStatCard({ goal, past = false, rate, adherence, items, onClick }: {
  goal: MonthlyGoal; past?: boolean; rate: number; adherence: number;
  items: ReturnType<typeof getLinkedItems>; onClick: () => void;
}) {
  const { elapsed, total } = elapsedDays(goal.startDate, goal.endDate);
  const accent = goal.color ?? (past ? 'var(--color-label-assistive)' : 'var(--color-primary)');
  const status = adherenceStatus(adherence);

  return (
    <motion.button
      whileTap={{ scale: 0.99 }} onClick={onClick}
      className="w-full text-left rounded-xl border shadow-emphasize overflow-hidden bg-surface border-line"
      style={goal.color ? { backgroundColor: `${goal.color}0a`, borderColor: `${goal.color}40` } : undefined}
    >
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-caption1 font-medium" style={{ color: accent }}>
            {format(new Date(goal.startDate + 'T12:00:00'), 'M/d')} ~ {format(new Date(goal.endDate + 'T12:00:00'), 'M/d')}
          </span>
          {goal.category && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
              goal.category === 'faith' ? 'bg-emerald-100 text-emerald-600' : 'bg-primary-soft text-primary'
            }`}>
              {goal.category === 'faith' ? '🙏 신앙' : '💪 개인'}
            </span>
          )}
          <span className="text-caption2 text-label-assistive ml-auto">
            {past ? '종료' : `D+${elapsed - 1} · ${elapsed}/${total}일`}
          </span>
        </div>
        <p className={`text-body2 font-bold leading-snug ${past ? 'text-label-alt' : 'text-label-strong'}`}>
          {goal.title}
        </p>
      </div>

      {/* 수행률 / 전체 진척도 */}
      <div className="px-4 pb-3 flex gap-2">
        <div className="flex-1 rounded-xl bg-fill/60 px-3 py-2.5">
          <p className="text-caption2 text-label-assistive mb-0.5">수행률</p>
          <p className="text-title3 font-bold leading-none" style={{ color: status.color }}>{adherence}%</p>
          {!past && <p className="text-caption2 font-semibold mt-1" style={{ color: status.color }}>{status.label}</p>}
        </div>
        <div className="flex-1 rounded-xl bg-fill/60 px-3 py-2.5">
          <p className="text-caption2 text-label-assistive mb-0.5">전체 진척도</p>
          <p className="text-title3 font-bold leading-none" style={{ color: accent }}>{rate}%</p>
          <p className="text-caption2 text-label-assistive mt-1">기간 전체 기준</p>
        </div>
      </div>

      {/* 연동 습관별 */}
      <div className="px-4 pb-4 flex flex-col gap-2.5">
        <p className="text-caption1 font-bold text-label-strong">🔗 연동된 습관 {items.length > 0 && `(${items.length})`}</p>
        {items.length > 0 ? items.map(item => (
          <div key={item.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-body2 text-label truncate flex-1 mr-2">
                {item.emoji ?? (item.kind === 'faith' ? '🙏' : '📌')} {item.title}
              </span>
              <span className="flex items-center gap-1.5 flex-shrink-0">
                <span className="text-caption2 text-label-assistive">{item.doneCount}/{item.scheduledElapsed}일</span>
                <span className="text-caption1 font-bold" style={{ color: accent }}>{item.adherence}%</span>
              </span>
            </div>
            <div className="bg-fill-strong rounded-full h-1 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${item.adherence}%`, backgroundColor: accent }} />
            </div>
          </div>
        )) : (
          <p className="text-caption1 text-label-assistive leading-relaxed">
            연동된 습관이 없어요. 목표 화면에서 "습관으로 만들기"로 추가해 보세요.
          </p>
        )}
      </div>
    </motion.button>
  );
}

/* ════════════════════════════════════════
   습관 통계 탭
════════════════════════════════════════ */
function HabitStatsTab() {
  const navigate = useNavigate();
  const { habits, habitLogs } = useHabitStore();
  const { faithRoutines, logs } = useRoutineStore();

  if (habits.length === 0 && faithRoutines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center mb-4 text-3xl">📊</div>
        <p className="text-body1 font-bold text-label-strong mb-1">아직 습관이 없어요</p>
        <p className="text-caption1 text-label-alt mb-5">습관을 추가하면 진행 통계를 볼 수 있어요</p>
        <motion.button whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/habits/new')}
          className="px-5 py-2.5 rounded-xl bg-primary text-white text-body2 font-bold">
          습관 추가하기
        </motion.button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      {habits.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <p className="text-caption1 font-bold text-label-alt">📌 개인 습관</p>
          {habits.map(h => (
            <HabitStatRow key={h.id}
              emoji={h.emoji} title={h.title} accent="var(--color-primary)"
              stat={getHabitStat(h.frequency, h.customDays, h.createdAt,
                habitLogs.filter(l => l.habitId === h.id))}
            />
          ))}
        </div>
      )}

      {faithRoutines.length > 0 && (
        <div className="flex flex-col gap-2.5">
          <p className="text-caption1 font-bold text-label-alt">🙏 신앙 루틴</p>
          {faithRoutines.map(r => (
            <HabitStatRow key={r.id}
              emoji={r.emoji ?? '✝️'} title={r.title} accent="var(--color-positive)"
              stat={getHabitStat(r.frequency, undefined, r.createdAt,
                logs.filter(l => l.routineId === r.id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<DayStatus, string> = {
  done:  'bg-primary',
  sub:   'bg-orange-400',
  rest:  'bg-amber-300',
  miss:  'bg-fill-strong',
  off:   'bg-transparent border border-line-soft',
  future:'bg-transparent border border-dashed border-line-soft',
};

function HabitStatRow({ emoji, title, accent, stat }: {
  emoji: string; title: string; accent: string;
  stat: ReturnType<typeof getHabitStat>;
}) {
  return (
    <div className="bg-surface rounded-xl border border-line shadow-emphasize px-4 py-3.5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-xl">{emoji}</span>
        <span className="flex-1 text-body2 font-bold text-label-strong truncate">{title}</span>
        <span className="text-title3 font-bold" style={{ color: accent }}>{stat.rate30}%</span>
      </div>

      {/* 최근 14일 도트 */}
      <div className="flex gap-1 mb-3">
        {stat.recent.map((d, i) => (
          <div key={i} className={`flex-1 h-5 rounded-md ${STATUS_STYLE[d.status]}`}
            style={d.status === 'done' ? { backgroundColor: accent } : undefined} />
        ))}
      </div>

      {/* 지표 행 */}
      <div className="flex items-center gap-4 text-caption1">
        <span className="text-label-alt">🔥 연속 <span className="font-bold text-label-strong">{stat.streak}일</span></span>
        <span className="text-label-alt">최고 <span className="font-bold text-label-strong">{stat.best}일</span></span>
        <span className="text-label-assistive ml-auto">30일 {stat.done30}/{stat.sched30}</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   주간 통계 탭
════════════════════════════════════════ */
function WeeklyTab() {
  const navigate = useNavigate();
  const { faithRoutines, logs } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
  const { todos } = useTodoStore();
  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });

  const { weekStartDay } = useSettingsStore();
  const weekDays = getWeekDays(new Date(), weekStartDay as 0 | 1);

  const getRates = (type: 'faith' | 'habit' | 'todo') => {
    return weekDays.map(d => {
      const ds = format(d, 'yyyy-MM-dd');
      const isFuture = d > new Date(new Date().setHours(23, 59, 59, 999));
      if (isFuture) return { ds, rate: null };

      if (type === 'faith') {
        if (faithRoutines.length === 0) return { ds, rate: 0 };
        const done = new Set(logs.filter(l => l.date === ds && (l.completed || l.skipped)).map(l => l.routineId));
        return { ds, rate: Math.round(faithRoutines.filter(r => done.has(r.id)).length / faithRoutines.length * 100) };
      }
      if (type === 'habit') {
        if (habits.length === 0) return { ds, rate: 0 };
        const done = habitLogs.filter(l => l.date === ds && (l.completed || l.skipped || l.substitute)).length;
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
    return valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
  };

  const reviewDone = isReviewCompleted(reviews, currentWeek(), currentYear());

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      {/* 리뷰 배너 — 한 주 점검 */}
      <ReviewBanner
        completed={reviewDone}
        weekRangeText={getWeekRangeText(new Date(), weekStartDay as 0 | 1)}
        onStart={() => navigate('/review')}
      />

      {/* 주간 평균 */}
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

      {/* 리뷰 히스토리 */}
      {reviews.length > 0 && (
        <div>
          <p className="text-caption1 font-bold text-label-alt mb-3">주간 리뷰 히스토리</p>
          <div className="flex flex-col gap-2">
            {reviews.slice(0, 6).map((review, i) => (
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
                  {ALL_DAY_LABELS[getDay(new Date(d.ds + 'T12:00:00'))]}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
