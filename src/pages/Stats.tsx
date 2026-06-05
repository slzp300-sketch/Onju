import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Target } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format, getDay } from 'date-fns';
import ReviewBanner from '../components/review/ReviewBanner';
import StampSeal from '../components/ui/StampSeal';
import { useRoutineStore } from '../store/routineStore';
import { useHabitStore } from '../store/habitStore';
import { useGoalStore } from '../store/goalStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  today, getWeekDays, ALL_DAY_LABELS, elapsedDays,
  getWeekRangeText, getReviewPrompt,
} from '../utils/date';
import { calcReviewStreak } from '../utils/reviewStreak';
import { getLinkedItems, rateFromItems, adherenceFromItems, isScheduled } from '../utils/goalProgress';
import { getDayCompletion, type DayState } from '../utils/dayCompletion';
import { getHabitStat, type DayStatus } from '../utils/habitStats';
import { fetchReviews } from '../api/reviews';
import type { MonthlyGoal, Habit, DailyRoutine } from '../types';

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

  const renderCard = (g: MonthlyGoal, past: boolean) => {
    const items = getLinkedItems(g, habits, habitLogs, faithRoutines, logs, todayIso);
    return (
      <GoalStatCard key={g.id} goal={g} past={past}
        rate={rateFromItems(items)} adherence={adherenceFromItems(items)} items={items}
        onClick={() => navigate('/goals')}
      />
    );
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      {activeGoals.map(g => renderCard(g, false))}

      {pastGoals.length > 0 && (
        <>
          <p className="text-caption1 font-bold text-label-assistive mt-1">종료된 목표</p>
          {pastGoals.map(g => renderCard(g, true))}
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
        <span className="text-label-assistive ml-auto">최근 30일 {stat.done30}/{stat.sched30}일</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   주간 통계 탭
════════════════════════════════════════ */
interface WeekDayInfo {
  date: string;
  dow: number;
  state: DayState;
  rate: number; // 0~100 (예정 항목 기준), rest는 0
}

function computeWeek(
  weekDays: Date[],
  habits: Habit[],
  habitLogs: { habitId: string; date: string; completed: boolean; skipped?: boolean; substitute?: boolean }[],
  faithRoutines: DailyRoutine[],
  logs: { id: string; routineId: string; userId: string; date: string; completed: boolean; skipped?: boolean }[],
): WeekDayInfo[] {
  const todayMid = new Date(new Date().setHours(23, 59, 59, 999));
  return weekDays.map(d => {
    const ds = format(d, 'yyyy-MM-dd');
    const c = getDayCompletion(ds, habits, habitLogs, faithRoutines, logs, d > todayMid);
    return { date: ds, dow: getDay(d), state: c.state, rate: c.combinedRate < 0 ? 0 : c.combinedRate };
  });
}

function WeeklyTab() {
  const navigate = useNavigate();
  const { faithRoutines, logs } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });
  const { weekStartDay } = useSettingsStore();

  const thisWeekDays = getWeekDays(new Date(), weekStartDay as 0 | 1);
  const lastWeekDate = new Date(); lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeekDays = getWeekDays(lastWeekDate, weekStartDay as 0 | 1);

  const week     = computeWeek(thisWeekDays, habits, habitLogs, faithRoutines, logs);
  const lastWeek = computeWeek(lastWeekDays, habits, habitLogs, faithRoutines, logs);

  const perfectCount = week.filter(d => d.state === 'perfect').length;
  const lastPerfect  = lastWeek.filter(d => d.state === 'perfect').length;
  const perfectDelta = perfectCount - lastPerfect;

  // 의무가 있었던 날만 평균 (쉬는 날 제외)
  const obligationDays = week.filter(d => d.state !== 'future' && d.state !== 'rest');
  const avgRate = obligationDays.length
    ? Math.round(obligationDays.reduce((a, d) => a + d.rate, 0) / obligationDays.length)
    : 0;

  // 이번 주 가장 꾸준한 습관
  const weekIsos = week.map(d => d.date);
  const habitConsistency = [
    ...habits.map(h => ({
      title: h.title, emoji: h.emoji,
      done: weekIsos.filter(ds => isScheduled(ds, h.frequency, h.customDays)
        && habitLogs.some(l => l.habitId === h.id && l.date === ds && (l.completed || l.skipped || l.substitute))).length,
    })),
    ...faithRoutines.map(r => ({
      title: r.title, emoji: r.emoji ?? '✝️',
      done: weekIsos.filter(ds => isScheduled(ds, r.frequency)
        && logs.some(l => l.routineId === r.id && l.date === ds && (l.completed || l.skipped))).length,
    })),
  ].sort((a, b) => b.done - a.done);
  const bestHabit = habitConsistency[0]?.done > 0 ? habitConsistency[0] : null;

  const reviewPrompt = getReviewPrompt(reviews);
  const reviewStreak = calcReviewStreak(reviews);

  const encourage =
    perfectCount >= 5 ? '🔥 완벽한 한 주를 보내고 있어요!' :
    perfectCount >= 2 ? '👏 꾸준히 잘 해내고 있어요' :
    avgRate >= 50 ? '🌱 조금씩 쌓여가고 있어요' :
    '💪 오늘부터 다시 시작해봐요';

  const hasData = habits.length > 0 || faithRoutines.length > 0;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      {/* ── 이번 주 도장 캘린더 ── */}
      <div className="bg-surface rounded-2xl border border-line shadow-emphasize px-4 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-body2 font-bold text-label-strong">이번 주 달성</p>
          <p className="text-caption1 text-label-alt">{getWeekRangeText(new Date(), weekStartDay as 0 | 1)}</p>
        </div>

        {hasData ? (
          <>
            <div className="flex gap-1.5">
              {week.map((d, i) => (
                <WeekStampCell key={d.date} info={d} isToday={d.date === today()} delay={i * 0.05} />
              ))}
            </div>
            <p className="text-caption1 text-center font-semibold text-label-alt mt-3">{encourage}</p>
          </>
        ) : (
          <p className="text-caption1 text-label-assistive text-center py-6">습관·루틴을 추가하면 달성 현황이 표시돼요</p>
        )}
      </div>

      {/* ── 주간 요약 ── */}
      {hasData && (
        <div className="grid grid-cols-2 gap-2">
          <SummaryStat label="완벽한 날" value={`${perfectCount}일`}
            sub={perfectDelta === 0 ? '지난주와 동일' : perfectDelta > 0 ? `지난주 +${perfectDelta}` : `지난주 ${perfectDelta}`}
            subColor={perfectDelta > 0 ? 'text-positive' : perfectDelta < 0 ? 'text-negative' : 'text-label-assistive'} />
          <SummaryStat label="평균 달성률" value={`${avgRate}%`} sub="경과일 기준" subColor="text-label-assistive" />
          <SummaryStat label="베스트 습관" value={bestHabit ? `${bestHabit.done}회` : '-'}
            sub={bestHabit ? `${bestHabit.emoji} ${bestHabit.title}` : '아직 없어요'} subColor="text-label-alt" />
          <SummaryStat label="리뷰 연속"
            value={reviewStreak > 0 ? `${reviewStreak}주` : '-'}
            sub={reviewStreak >= 2 ? '🔥 연속 리뷰 중' : reviewStreak === 1 ? '이번 주 완료' : '아직 없어요'}
            subColor={reviewStreak >= 2 ? 'text-orange-500' : 'text-label-assistive'} />
        </div>
      )}

      {/* ── 주간 리뷰 ── */}
      <ReviewBanner
        completed={reviewPrompt.completed}
        overdue={reviewPrompt.overdue}
        weekRangeText={getWeekRangeText(new Date(), weekStartDay as 0 | 1)}
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

      {reviews.length > 0 && (
        <div>
          <p className="text-caption1 font-bold text-label-alt mb-3">지난 리뷰</p>
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

function SummaryStat({ label, value, sub, subColor }: {
  label: string; value: string; sub: string; subColor: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface shadow-emphasize p-3">
      <p className="text-caption2 text-label-alt font-medium mb-1">{label}</p>
      <p className="text-title3 font-bold text-label-strong leading-none">{value}</p>
      <p className={`text-caption2 mt-1 truncate ${subColor}`}>{sub}</p>
    </div>
  );
}

/* 도장 캘린더 셀 */
function WeekStampCell({ info, isToday, delay }: { info: WeekDayInfo; isToday: boolean; delay: number }) {
  const ring = 2 * Math.PI * 15;
  return (
    <div className="flex-1 flex flex-col items-center gap-1.5">
      <span className={`text-caption2 font-bold ${isToday ? 'text-primary' : 'text-label-assistive'}`}>
        {ALL_DAY_LABELS[info.dow]}
      </span>
      <div className={`relative w-full aspect-square rounded-2xl flex items-center justify-center ${
        isToday ? 'bg-primary-soft' : info.state === 'rest' ? 'bg-fill' : 'bg-fill/60'
      }`}>
        {info.state === 'perfect' ? (
          <motion.div initial={{ scale: 1.6, opacity: 0, rotate: -16 }} animate={{ scale: 1, opacity: 1, rotate: -10 }}
            transition={{ type: 'spring', stiffness: 380, damping: 18, delay }}>
            <StampSeal label="완료" color="#10b981" size={40} />
          </motion.div>
        ) : info.state === 'partial' ? (
          <svg className="w-[60%] h-[60%] -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-fill-strong)" strokeWidth="3.5" />
            <motion.circle cx="18" cy="18" r="15" fill="none" stroke="var(--color-primary)" strokeWidth="3.5"
              strokeLinecap="round" strokeDasharray={ring}
              initial={{ strokeDashoffset: ring }} animate={{ strokeDashoffset: ring * (1 - info.rate / 100) }}
              transition={{ duration: 0.6, delay }} />
          </svg>
        ) : info.state === 'missed' ? (
          <span className="text-label-assistive text-sm">·</span>
        ) : info.state === 'rest' ? (
          <span className="text-label-assistive text-xs">😴</span>
        ) : (
          <span className="text-label-assistive text-[10px]">{format(new Date(info.date + 'T12:00:00'), 'd')}</span>
        )}
      </div>
    </div>
  );
}
