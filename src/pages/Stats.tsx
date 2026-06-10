import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Target, BookOpen, Dumbbell, Link2, Pin, BarChart3, Flame, FileText, Moon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format, getDay } from 'date-fns';
import { ko } from 'date-fns/locale';
import ReviewBanner from '../components/review/ReviewBanner';
import StampSeal from '../components/ui/StampSeal';
import { useRoutineStore } from '../store/routineStore';
import { useHabitStore } from '../store/habitStore';
import { useGoalStore } from '../store/goalStore';
import { useDiaryStore } from '../store/diaryStore';
import { useSettingsStore } from '../store/settingsStore';
import {
  today, getWeekDays, ALL_DAY_LABELS, elapsedDays,
  getWeekRangeText, getReviewPrompt,
} from '../utils/date';
import { calcReviewStreak } from '../utils/reviewStreak';
import { calcDiaryStreak, DIARY_MOODS } from '../utils/diaryStats';
import { getLinkedItems, rateFromItems, adherenceFromItems, isScheduled } from '../utils/goalProgress';
import { getDayCompletion, type DayState } from '../utils/dayCompletion';
import { getHabitStat, type DayStatus } from '../utils/habitStats';
import { fetchReviews } from '../api/reviews';
import type { MonthlyGoal, Habit, DailyRoutine } from '../types';

type TabType = 'goal' | 'habit' | 'weekly' | 'records';

const MOOD_EMOJI: Record<string, string> = { hard: '😓', normal: '😊', easy: '😌' };
const REVIEW_MOOD_META: { key: 'easy' | 'normal' | 'hard'; emoji: string; label: string }[] = [
  { key: 'easy', emoji: '😌', label: '수월' },
  { key: 'normal', emoji: '😊', label: '보통' },
  { key: 'hard', emoji: '😓', label: '힘듦' },
];

export default function Stats() {
  const [activeTab, setActiveTab] = useState<TabType>('goal');

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-heading2 font-bold text-label-strong font-brand">통계</h1>
      </div>

      <div className="px-4 mb-1">
        <div className="flex bg-fill rounded-xl p-1">
          {([['goal', '목표'], ['habit', '습관'], ['weekly', '주간'], ['records', '기록']] as [TabType, string][]).map(([key, label]) => (
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
        {activeTab === 'records' && (
          <motion.div key="r" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            <RecordsTab />
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
      className="w-full text-left rounded-xl border overflow-hidden bg-surface border-line"
      style={goal.color ? { backgroundColor: `${goal.color}0a`, borderColor: `${goal.color}40` } : undefined}
    >
      {/* 헤더 */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-caption1 font-medium" style={{ color: accent }}>
            {format(new Date(goal.startDate + 'T12:00:00'), 'M/d')} ~ {format(new Date(goal.endDate + 'T12:00:00'), 'M/d')}
          </span>
          {goal.category && (
            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
              goal.category === 'faith' ? 'bg-emerald-100 text-emerald-600' : 'bg-primary-soft text-primary'
            }`}>
              {goal.category === 'faith'
                ? <><BookOpen size={11} strokeWidth={1.9} /> 신앙</>
                : <><Dumbbell size={11} strokeWidth={1.9} /> 개인</>}
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
        <p className="text-caption1 font-bold text-label-strong flex items-center gap-1.5"><Link2 size={13} strokeWidth={1.9} className="text-label-strong" /> 연동된 습관 {items.length > 0 && `(${items.length})`}</p>
        {items.length > 0 ? items.map(item => (
          <div key={item.id}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-body2 text-label truncate flex-1 mr-2 inline-flex items-center gap-1.5">
                {item.emoji
                  ? <span>{item.emoji}</span>
                  : item.kind === 'faith'
                    ? <BookOpen size={14} strokeWidth={1.9} className="text-label-assistive flex-shrink-0" />
                    : <Pin size={14} strokeWidth={1.9} className="text-label-assistive flex-shrink-0" />}
                <span className="truncate">{item.title}</span>
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
        <div className="w-16 h-16 rounded-full bg-primary-soft flex items-center justify-center mb-4">
          <BarChart3 size={28} strokeWidth={1.9} className="text-primary" />
        </div>
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
          <p className="text-caption1 font-bold text-label-alt flex items-center gap-1.5"><Pin size={13} strokeWidth={1.9} className="text-label-alt" /> 개인 습관</p>
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
          <p className="text-caption1 font-bold text-label-alt flex items-center gap-1.5"><BookOpen size={13} strokeWidth={1.9} className="text-label-alt" /> 신앙 루틴</p>
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
    <div className="bg-surface rounded-xl border border-line px-4 py-3.5">
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
        <span className="text-label-alt inline-flex items-center gap-1"><Flame size={13} strokeWidth={1.9} className="text-cautionary" /> 연속 <span className="font-bold text-label-strong">{stat.streak}일</span></span>
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
  const { faithRoutines, logs } = useRoutineStore();
  const { habits, habitLogs } = useHabitStore();
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

  const nowMid = new Date(new Date().setHours(23, 59, 59, 999));

  // 이번 주 vs 지난주 평균 달성률
  const lastObligation = lastWeek.filter(d => d.state !== 'future' && d.state !== 'rest');
  const lastAvgRate = lastObligation.length
    ? Math.round(lastObligation.reduce((a, d) => a + d.rate, 0) / lastObligation.length)
    : 0;
  const avgDelta = avgRate - lastAvgRate;

  // 이번 주 개인 / 신앙 카테고리별 평균
  const thisWeekComp = thisWeekDays
    .map(d => getDayCompletion(format(d, 'yyyy-MM-dd'), habits, habitLogs, faithRoutines, logs, d > nowMid))
    .filter(c => c.state !== 'future'); // 아직 오지 않은 날은 평균에서 제외
  const avgOf = (vals: number[]) => vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : -1;
  const personalWeekRate = avgOf(thisWeekComp.filter(c => c.personalRate >= 0).map(c => c.personalRate));
  const faithWeekRate    = avgOf(thisWeekComp.filter(c => c.faithRate >= 0).map(c => c.faithRate));

  // 요일별 패턴 (최근 4주 의무일 평균)
  const weekdayBuckets = Array.from({ length: 7 }, () => ({ sum: 0, count: 0 }));
  for (let i = 0; i < 28; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (d > nowMid) continue;
    const c = getDayCompletion(format(d, 'yyyy-MM-dd'), habits, habitLogs, faithRoutines, logs, false);
    if (c.combinedRate < 0) continue; // 쉬는 날 제외
    const b = weekdayBuckets[getDay(d)];
    b.sum += c.combinedRate; b.count += 1;
  }
  const weekdayAvg = weekdayBuckets.map(b => (b.count ? Math.round(b.sum / b.count) : null));
  const orderedDows = thisWeekDays.map(d => getDay(d)); // 주 시작 요일 순서
  const dowWithData = orderedDows.filter(dow => weekdayAvg[dow] !== null);
  const bestDow = dowWithData.length ? dowWithData.reduce((a, b) => (weekdayAvg[b]! > weekdayAvg[a]! ? b : a)) : null;
  const worstDow = dowWithData.length ? dowWithData.reduce((a, b) => (weekdayAvg[b]! < weekdayAvg[a]! ? b : a)) : null;

  const encourage =
    perfectCount >= 5 ? '🔥 완벽한 한 주를 보내고 있어요!' :
    perfectCount >= 2 ? '👏 꾸준히 잘 해내고 있어요' :
    avgRate >= 50 ? '🌱 조금씩 쌓여가고 있어요' :
    '💪 오늘부터 다시 시작해봐요';

  const hasData = habits.length > 0 || faithRoutines.length > 0;

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      {/* ── 이번 주 도장 캘린더 ── */}
      <div className="bg-surface rounded-2xl border border-line px-4 py-4">
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
        <div className="grid grid-cols-3 gap-2">
          <SummaryStat label="완벽한 날" value={`${perfectCount}일`}
            sub={perfectDelta === 0 ? '지난주와 동일' : perfectDelta > 0 ? `지난주 +${perfectDelta}` : `지난주 ${perfectDelta}`}
            subColor={perfectDelta > 0 ? 'text-positive' : perfectDelta < 0 ? 'text-negative' : 'text-label-assistive'} />
          <SummaryStat label="평균 달성률" value={`${avgRate}%`} sub="경과일 기준" subColor="text-label-assistive" />
          <SummaryStat label="베스트 습관" value={bestHabit ? `${bestHabit.done}회` : '-'}
            sub={bestHabit ? `${bestHabit.emoji} ${bestHabit.title}` : '아직 없어요'} subColor="text-label-alt" />
        </div>
      )}

      {hasData && (
        <>
          {/* ── 이번 주 vs 지난주 ── */}
          <div className="bg-surface rounded-xl border border-line px-4 py-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-caption1 font-bold text-label-strong">이번 주 vs 지난주</p>
              <span className={`text-caption1 font-bold tabular-nums ${
                avgDelta > 0 ? 'text-positive' : avgDelta < 0 ? 'text-negative' : 'text-label-assistive'
              }`}>
                {avgDelta > 0 ? `▲ +${avgDelta}%p` : avgDelta < 0 ? `▼ ${avgDelta}%p` : '지난주와 동일'}
              </span>
            </div>
            <BarRow label="이번 주" value={avgRate} color="var(--color-primary)" highlight />
            <BarRow label="지난주" value={lastAvgRate} color="var(--color-label-assistive)" />
          </div>

          {/* ── 이번 주 개인·신앙 ── */}
          <div className="bg-surface rounded-xl border border-line px-4 py-3.5 flex flex-col gap-3">
            <p className="text-caption1 font-bold text-label-strong">이번 주 개인·신앙</p>
            <BarRow label="💪 개인" value={personalWeekRate} color="var(--color-primary)" highlight />
            <BarRow label="🙏 신앙" value={faithWeekRate} color="var(--color-positive)" highlight />
          </div>

          {/* ── 요일별 패턴 ── */}
          <div className="bg-surface rounded-xl border border-line px-4 py-3.5">
            <p className="text-caption1 font-bold text-label-strong mb-3">
              요일별 패턴 <span className="text-caption2 text-label-assistive font-medium">· 최근 4주</span>
            </p>
            <div className="flex gap-1.5">
              {orderedDows.map(dow => {
                const avg = weekdayAvg[dow];
                const isBest = bestDow === dow && dowWithData.length > 1;
                return (
                  <div key={dow} className="flex-1 flex flex-col items-center gap-1.5">
                    <div className="w-full h-16 bg-fill rounded-md flex items-end overflow-hidden">
                      {avg !== null && (
                        <motion.div initial={{ height: 0 }} animate={{ height: `${avg}%` }} transition={{ duration: 0.5 }}
                          className="w-full rounded-md" style={{ backgroundColor: isBest ? 'var(--color-positive)' : 'var(--color-primary)' }} />
                      )}
                    </div>
                    <span className={`text-caption2 font-bold ${isBest ? 'text-positive' : 'text-label-assistive'}`}>
                      {ALL_DAY_LABELS[dow]}
                    </span>
                  </div>
                );
              })}
            </div>
            {bestDow !== null && worstDow !== null && dowWithData.length > 1 ? (
              <p className="text-caption1 text-center font-semibold text-label-alt mt-3">
                💪 {ALL_DAY_LABELS[bestDow]}요일에 가장 꾸준해요{bestDow !== worstDow ? ` · ${ALL_DAY_LABELS[worstDow]}요일은 조금 약해요` : ''}
              </p>
            ) : (
              <p className="text-caption1 text-center text-label-assistive mt-3">기록이 쌓이면 요일별 패턴이 보여요</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   기록 통계 탭 (일기 + 주간 리뷰)
════════════════════════════════════════ */
function RecordsTab() {
  const navigate = useNavigate();
  const { entries } = useDiaryStore();
  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });
  const { weekStartDay } = useSettingsStore();
  const reviewPrompt = getReviewPrompt(reviews);

  /* ── 일기 집계 ── */
  const diaries = [...entries].sort((a, b) => (a.date < b.date ? 1 : -1));
  const diaryStreak = calcDiaryStreak(entries.map(e => e.date));
  const thisMonth = format(new Date(), 'yyyy-MM');
  const thisMonthCount = entries.filter(e => e.date.startsWith(thisMonth)).length;
  const diaryMoodCounts = DIARY_MOODS.map(m => ({
    ...m, count: entries.filter(e => e.mood === m.key).length,
  }));
  const diaryMoodTotal = diaryMoodCounts.reduce((a, m) => a + m.count, 0);

  /* ── 리뷰 집계 ── */
  const completedReviews = reviews
    .filter(r => r.completedAt !== null)
    .sort((a, b) => (a.year !== b.year ? b.year - a.year : b.weekNumber - a.weekNumber));
  const reviewStreak = calcReviewStreak(reviews);
  const avgPersonal = completedReviews.length
    ? Math.round(completedReviews.reduce((a, r) => a + r.personalRate, 0) / completedReviews.length) : 0;
  const avgFaith = completedReviews.length
    ? Math.round(completedReviews.reduce((a, r) => a + r.faithRate, 0) / completedReviews.length) : 0;
  const reviewMoodCounts = REVIEW_MOOD_META.map(m => ({
    ...m, count: completedReviews.filter(r => r.mood === m.key).length,
  }));
  const reviewMoodTotal = reviewMoodCounts.reduce((a, m) => a + m.count, 0);

  return (
    <div className="flex flex-col gap-6 px-4 py-4 pb-8">
      {/* ════ 이번 주 리뷰 작성 배너 ════ */}
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

      {/* ════ 일기 ════ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-body2 font-bold text-label-strong flex items-center gap-1.5"><BookOpen size={15} strokeWidth={1.9} className="text-label-strong" /> 하루 일기</h2>

        {entries.length === 0 ? (
          <EmptyRecord
            text="아직 작성한 일기가 없어요" sub="홈 상단 📖 버튼으로 오늘을 기록해 보세요"
            ctaLabel="일기 쓰러 가기" onCta={() => navigate('/diary')} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <SummaryStat label="총 일기" value={`${entries.length}개`} sub="지금까지" subColor="text-label-assistive" />
              <SummaryStat label="연속 작성" value={diaryStreak > 0 ? `${diaryStreak}일` : '-'}
                sub={diaryStreak >= 2 ? '🔥 이어가는 중' : diaryStreak === 1 ? '오늘 작성' : '오늘 써볼까요'}
                subColor={diaryStreak >= 2 ? 'text-orange-500' : 'text-label-assistive'} />
              <SummaryStat label="이번 달" value={`${thisMonthCount}일`} sub={format(new Date(), 'M월')} subColor="text-label-assistive" />
            </div>

            {diaryMoodTotal > 0 && (
              <MoodDistribution title="기분 분포" items={diaryMoodCounts} total={diaryMoodTotal} color="var(--color-primary)" />
            )}

            <div className="flex flex-col gap-2">
              <p className="text-caption1 font-bold text-label-alt mt-1">최근 일기</p>
              {diaries.slice(0, 5).map((d, i) => (
                <motion.button key={d.date}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.12 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/diary', { state: { date: d.date } })}
                  className="w-full bg-surface rounded-xl p-3.5 border border-line text-left flex items-center gap-3 hover:bg-fill transition-colors">
                  <span className="text-2xl flex-shrink-0 flex items-center justify-center w-7">
                    {d.mood ? DIARY_MOODS.find(m => m.key === d.mood)?.emoji : <FileText size={20} strokeWidth={1.9} className="text-label-assistive" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-caption1 font-semibold text-label-strong">
                      {format(new Date(d.date + 'T12:00:00'), 'M월 d일 (EEE)', { locale: ko })}
                    </p>
                    <p className="text-caption1 text-label-alt truncate mt-0.5">{d.content || '내용 없음'}</p>
                  </div>
                  <ChevronRight size={16} className="text-label-assistive flex-shrink-0" />
                </motion.button>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ════ 주간 리뷰 ════ */}
      <section className="flex flex-col gap-3">
        <h2 className="text-body2 font-bold text-label-strong flex items-center gap-1.5"><FileText size={15} strokeWidth={1.9} className="text-label-strong" /> 주간 리뷰</h2>

        {completedReviews.length === 0 ? (
          <EmptyRecord
            text="아직 완료한 리뷰가 없어요" sub="한 주를 돌아보며 첫 리뷰를 남겨보세요"
            ctaLabel="리뷰 쓰러 가기" onCta={() => navigate('/review')} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <SummaryStat label="총 리뷰" value={`${completedReviews.length}개`} sub="완료 기준" subColor="text-label-assistive" />
              <SummaryStat label="리뷰 연속" value={reviewStreak > 0 ? `${reviewStreak}주` : '-'}
                sub={reviewStreak >= 2 ? '🔥 연속 리뷰 중' : reviewStreak === 1 ? '이번 주 완료' : '이어가 볼까요'}
                subColor={reviewStreak >= 2 ? 'text-orange-500' : 'text-label-assistive'} />
              <SummaryStat label="평균 달성" value={`${avgPersonal}%`} sub={`신앙 ${avgFaith}%`} subColor="text-positive" />
            </div>

            {reviewMoodTotal > 0 && (
              <MoodDistribution title="한 주 난이도" items={reviewMoodCounts} total={reviewMoodTotal} color="var(--color-positive)" />
            )}

            <div className="flex flex-col gap-2">
              <p className="text-caption1 font-bold text-label-alt mt-1">최근 리뷰</p>
              {completedReviews.slice(0, 5).map((review, i) => (
                <motion.button key={review.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04, duration: 0.12 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate(`/review/result/${review.year}-${review.weekNumber}`)}
                  className="w-full bg-surface rounded-xl p-3.5 border border-line text-left flex items-center gap-3 hover:bg-fill transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-caption1 font-semibold text-label-strong">{review.year}년 {review.weekNumber}주차</p>
                      {review.mood && <span>{MOOD_EMOJI[review.mood]}</span>}
                    </div>
                    {review.comment ? (
                      <p className="text-caption1 text-label-alt truncate">{review.comment}</p>
                    ) : (
                      <div className="flex gap-3 text-caption1">
                        <span className="text-primary">개인 {review.personalRate}%</span>
                        <span className="text-positive">신앙 {review.faithRate}%</span>
                      </div>
                    )}
                  </div>
                  <ChevronRight size={16} className="text-label-assistive flex-shrink-0" />
                </motion.button>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function MoodDistribution({ title, items, total, color }: {
  title: string;
  items: { emoji: string; label: string; count: number }[];
  total: number;
  color: string;
}) {
  return (
    <div className="bg-surface rounded-xl border border-line px-4 py-3.5">
      <p className="text-caption1 font-bold text-label-strong mb-3">{title}</p>
      <div className="flex flex-col gap-2">
        {items.map(m => {
          const pct = total ? Math.round((m.count / total) * 100) : 0;
          return (
            <div key={m.label} className="flex items-center gap-2.5">
              <span className="text-base w-5 text-center flex-shrink-0">{m.emoji}</span>
              <span className="text-caption1 text-label-alt w-8 flex-shrink-0">{m.label}</span>
              <div className="flex-1 h-2 bg-fill-strong rounded-full overflow-hidden">
                <motion.div className="h-full rounded-full" style={{ backgroundColor: color }}
                  initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.5 }} />
              </div>
              <span className="text-caption1 font-bold text-label-strong w-8 text-right flex-shrink-0 tabular-nums">{m.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EmptyRecord({ text, sub, ctaLabel, onCta }: {
  text: string; sub: string; ctaLabel: string; onCta: () => void;
}) {
  return (
    <div className="bg-surface rounded-xl border border-line flex flex-col items-center text-center px-6 py-8">
      <p className="text-body2 font-bold text-label-strong mb-1">{text}</p>
      <p className="text-caption1 text-label-alt mb-4">{sub}</p>
      <motion.button whileTap={{ scale: 0.97 }} onClick={onCta}
        className="px-4 py-2 rounded-lg bg-primary text-white text-caption1 font-bold">
        {ctaLabel}
      </motion.button>
    </div>
  );
}

function BarRow({ label, value, color, highlight = false }: {
  label: string; value: number; color: string; highlight?: boolean;
}) {
  const has = value >= 0;
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-caption1 text-label-alt w-12 flex-shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-fill-strong rounded-full overflow-hidden">
        {has && (
          <motion.div className="h-full rounded-full" style={{ backgroundColor: color }}
            initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.5 }} />
        )}
      </div>
      <span className={`text-caption1 font-bold w-10 text-right flex-shrink-0 tabular-nums ${highlight ? 'text-label-strong' : 'text-label-alt'}`}>
        {has ? `${value}%` : '-'}
      </span>
    </div>
  );
}

function SummaryStat({ label, value, sub, subColor }: {
  label: string; value: string; sub: string; subColor: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-3">
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
            <StampSeal label="완료" color="#1f8a4c" size={40} />
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
          <Moon size={14} strokeWidth={1.9} className="text-label-assistive" />
        ) : (
          <span className="text-label-assistive text-[10px]">{format(new Date(info.date + 'T12:00:00'), 'd')}</span>
        )}
      </div>
    </div>
  );
}
