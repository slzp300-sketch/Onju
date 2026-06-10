import { useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Check, Plus, X, Pencil, ChevronLeft, Trash2, Target, PartyPopper, Dumbbell, Sprout, BookOpen, Smile, Zap, Flame } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRoutineStore } from '../store/routineStore';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { createReview, createWeeklyShare } from '../api/reviews';
import { applyRoutineChanges } from '../utils/applyRoutineChanges';
import { applyHabitChanges } from '../utils/applyHabitChanges';
import { calcCompletionRate } from '../utils/completion';
import { isScheduled } from '../utils/goalProgress';
import { currentWeek, currentYear, getWeekRangeText, getCurrentWeekRange } from '../utils/date';
import Button from '../components/ui/Button';
import type { RoutineChange, HabitChange, DailyRoutine, MonthlyGoal, Habit, RoutineLog, HabitFrequency } from '../types';
import { mockGroups } from '../mocks/data/seed';
import { format } from 'date-fns';

// ── 상수 ──────────────────────────────────────────────
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:  (dir: number) => ({ x: dir < 0 ? '100%' : '-100%', opacity: 0 }),
};

type RoutineFreq = 'daily' | 'weekdays' | 'weekends';
type Mood = 'hard' | 'normal' | 'easy';

const ROUTINE_FREQ_LABELS: Record<RoutineFreq, string> = { daily: '매일', weekdays: '평일', weekends: '주말' };
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;
const HABIT_FREQ_OPTIONS: { value: HabitFrequency; label: string }[] = [
  { value: 'daily',    label: '매일'   },
  { value: 'weekdays', label: '평일'   },
  { value: 'weekends', label: '주말'   },
  { value: 'custom',   label: '직접 선택' },
];

// 홈 배너에서 전달하는 리뷰 대상 주 (없으면 이번 주)
interface ReviewTarget {
  targetWeek?: number;
  targetYear?: number;
  weekStart?: string; // YYYY-MM-DD
  weekEnd?: string;   // YYYY-MM-DD
}

// ── 메인 컴포넌트 ──────────────────────────────────────
export default function WeeklyReviewPage() {
  const navigate      = useNavigate();
  const location      = useLocation();
  const queryClient   = useQueryClient();
  const routineStore  = useRoutineStore();
  const { monthlyGoals } = useGoalStore();
  const { habits, habitLogs, removeHabit, updateHabit } = useHabitStore();

  const [step, setStep] = useState(0);
  const [dir,  setDir]  = useState(1);

  // 리뷰 대상 주 — 유예 윈도우(월요일)에는 지난주를 가리킴
  const target = location.state as ReviewTarget | null;
  const week   = target?.targetWeek ?? currentWeek();
  const year   = target?.targetYear ?? currentYear();
  const { start, end } = target?.weekStart && target?.weekEnd
    ? { start: new Date(target.weekStart + 'T00:00:00'), end: new Date(target.weekEnd + 'T23:59:59') }
    : getCurrentWeekRange();
  const weekStartStr = format(start, 'yyyy-MM-dd');
  const weekEndStr   = format(end,   'yyyy-MM-dd');

  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const activeMonthlyGoals = monthlyGoals.filter(g => g.endDate >= todayIso);
  const activeGoalIds      = new Set(activeMonthlyGoals.map(g => g.id));

  const personalRate = calcCompletionRate(
    routineStore.personalRoutines.filter(r => r.isActive), routineStore.logs, start, end
  );
  const faithRate = calcCompletionRate(
    routineStore.faithRoutines.filter(r => r.isActive), routineStore.logs, start, end
  );

  // Step 2
  const [mood,    setMood]    = useState<Mood | null>(null);
  const [comment, setComment] = useState('');

  // Step 3 — routines
  const allRoutines = [
    ...routineStore.personalRoutines.filter(r => r.isActive),
    ...routineStore.faithRoutines.filter(r => r.isActive),
  ];
  const [routineChanges, setRoutineChanges] = useState<RoutineChange[]>(() =>
    allRoutines.map(r => ({ routineId: r.id, action: 'keep' as const }))
  );

  // Step 3 — habits (only those linked to active goals)
  const linkedHabits = habits.filter(h => h.goalId && activeGoalIds.has(h.goalId));
  const [habitChanges, setHabitChanges] = useState<HabitChange[]>(() =>
    linkedHabits.map(h => ({ habitId: h.id, action: 'keep' as const }))
  );

  // Step 4
  const [intention,     setIntention]     = useState('');
  const [shareToGroups, setShareToGroups] = useState<string[]>([]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      await createReview({
        weekNumber: week, year,
        personalRate, faithRate,
        goalAchievedCount: 0, goalTotalCount: activeMonthlyGoals.length,
        mood, goalRatings: {}, comment, intention,
        shareToGroups, routineChanges,
        completedAt: new Date().toISOString(),
      });
      applyRoutineChanges(routineChanges, routineStore, 'user-1');
      applyHabitChanges(habitChanges, { removeHabit, updateHabit });
      for (const groupId of shareToGroups) {
        await createWeeklyShare(groupId, { personalRate, faithRate, comment, intention });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      navigate('/', { replace: true });
    },
  });

  const goNext = () => { setDir(1);  setStep(s => s + 1); };
  const goBack = () => {
    if (step === 0) { navigate(-1); return; }
    setDir(-1); setStep(s => s - 1);
  };

  const isLastStep  = step === 3;
  const canProceed  = isLastStep ? intention.trim().length > 0 : true;

  const steps = [
    <ReviewSummaryStep
      weekRangeText={getWeekRangeText(start)}
      personalRate={personalRate} faithRate={faithRate}
      activeMonthlyGoals={activeMonthlyGoals}
    />,
    <ReviewFeedbackStep
      mood={mood} onMoodChange={setMood}
      comment={comment} onCommentChange={setComment}
    />,
    <ReviewImproveStep
      activeMonthlyGoals={activeMonthlyGoals}
      habits={habits} habitLogs={habitLogs}
      routines={allRoutines} routineLogs={routineStore.logs}
      weekStart={weekStartStr} weekEnd={weekEndStr}
      routineChanges={routineChanges} onRoutineChangesUpdate={setRoutineChanges}
      habitChanges={habitChanges}   onHabitChangesUpdate={setHabitChanges}
    />,
    <ReviewIntentionStep
      intention={intention} onIntentionChange={setIntention}
      groups={mockGroups} shareToGroups={shareToGroups}
      onToggleGroup={id =>
        setShareToGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
      }
    />,
  ];

  return (
    <div className="min-h-dvh bg-surface flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-4 pb-2 gap-3">
        <button onClick={goBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-fill text-label-alt">
          <ChevronLeft size={20} />
        </button>
        <span className="text-caption1 font-semibold text-primary ml-auto">{step + 1} / 4</span>
      </div>

      <div className="h-1 bg-fill w-full">
        <motion.div className="h-full bg-primary" animate={{ width: `${((step + 1) / 4) * 100}%` }} transition={{ duration: 0.3 }} />
      </div>

      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence initial={false} custom={dir} mode="wait">
          <motion.div
            key={step} custom={dir} variants={slideVariants}
            initial="enter" animate="center" exit="exit"
            transition={{ type: 'tween', duration: 0.28 }}
            className="absolute inset-0 flex flex-col overflow-y-auto"
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 버튼 */}
      <div className="px-6 pb-8 pt-4 flex gap-3 border-t border-line-soft bg-surface">
        {step > 0 && <Button variant="ghost" onClick={goBack}>뒤로</Button>}
        {isLastStep ? (
          <Button fullWidth disabled={!canProceed || submitMutation.isPending} onClick={() => submitMutation.mutate()}>
            {submitMutation.isPending ? '저장 중...' : '리뷰 완료'}
            {!submitMutation.isPending && <Check size={16} />}
          </Button>
        ) : (
          <Button fullWidth disabled={!canProceed} onClick={goNext}>
            다음 <ChevronRight size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step 1 ────────────────────────────────────────────
function ReviewSummaryStep({ weekRangeText, personalRate, faithRate, activeMonthlyGoals }: {
  weekRangeText: string; personalRate: number; faithRate: number; activeMonthlyGoals: MonthlyGoal[];
}) {
  const overallRate    = Math.round((personalRate + faithRate) / 2);
  const encouragement  =
    overallRate >= 80 ? { Icon: PartyPopper, text: '이번 주 정말 잘했어요!' }
    : overallRate >= 50 ? { Icon: Dumbbell, text: '꾸준히 해나가고 있어요' }
    : { Icon: Sprout, text: '다음 주도 한 걸음씩!' };

  return (
    <div className="flex flex-col px-6 pt-6 pb-6">
      <p className="text-caption1 text-label-alt mb-1">{weekRangeText}</p>
      <h2 className="text-title3 font-bold text-label-strong mb-6">이번 주 현황</h2>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-primary-soft rounded-2xl p-4 flex flex-col items-center gap-1">
          <p className="text-caption1 font-medium text-primary">개인 루틴</p>
          <p className="text-4xl font-bold text-primary">{personalRate}%</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-4 flex flex-col items-center gap-1">
          <p className="text-caption1 font-medium text-emerald-500">신앙 루틴</p>
          <p className="text-4xl font-bold text-emerald-600">{faithRate}%</p>
        </div>
      </div>

      <div className="bg-surface-alt rounded-2xl px-4 py-3.5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-caption1 text-label-alt">이번 주 전체 달성률</p>
          <p className="text-body2 font-semibold text-label-strong mt-0.5 flex items-center gap-1.5">
            <encouragement.Icon size={16} strokeWidth={1.9} /> {encouragement.text}
          </p>
        </div>
        <p className="text-3xl font-bold text-label-strong">{overallRate}%</p>
      </div>

      <div className="flex items-center justify-between mb-3">
        <p className="text-body2 font-semibold text-label">이달의 목표</p>
        <p className="text-caption1 text-label-alt">{activeMonthlyGoals.length}개 진행 중</p>
      </div>

      {activeMonthlyGoals.length === 0 ? (
        <div className="bg-surface-alt rounded-xl px-4 py-6 flex flex-col items-center gap-2 text-center">
          <Target size={24} className="text-label-assistive" />
          <p className="text-body2 text-label-alt font-medium">설정된 목표가 없어요</p>
          <p className="text-caption1 text-label-assistive">목표 관리에서 목표를 추가해보세요</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {activeMonthlyGoals.map(goal => (
            <div key={goal.id} className="bg-surface-alt rounded-xl px-4 py-3 flex items-center gap-3"
              style={goal.color ? { borderLeft: `3px solid ${goal.color}` } : {}}>
              <div className="flex-1 min-w-0">
                <p className="text-body2 font-semibold text-label-strong truncate">{goal.title}</p>
                <p className="text-caption2 text-label-assistive mt-0.5 flex items-center gap-1">
                  {goal.category === 'faith'
                    ? <BookOpen size={12} strokeWidth={1.9} className="text-label-assistive" />
                    : <Dumbbell size={12} strokeWidth={1.9} className="text-label-assistive" />}
                  {goal.category === 'faith' ? '신앙' : '개인'} · {goal.startDate.slice(5).replace('-', '/')} ~ {goal.endDate.slice(5).replace('-', '/')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step 2 ────────────────────────────────────────────
const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 'hard',   emoji: '😓', label: '힘들었어요' },
  { value: 'normal', emoji: '😊', label: '보통이었어요' },
  { value: 'easy',   emoji: '😌', label: '여유로웠어요' },
];

function ReviewFeedbackStep({ mood, onMoodChange, comment, onCommentChange }: {
  mood: Mood | null; onMoodChange: (m: Mood) => void;
  comment: string; onCommentChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col px-6 pt-6 pb-4">
      <h2 className="text-title3 font-bold text-label-strong mb-2">기분 & 소감</h2>
      <p className="text-body2 text-label-alt mb-6">이번 주를 솔직하게 돌아봐요.</p>

      <p className="text-body2 font-semibold text-label mb-3">이번 주 어땠나요?</p>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {MOODS.map(m => (
          <button key={m.value} onClick={() => onMoodChange(m.value)}
            className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all ${
              mood === m.value ? 'border-primary bg-primary-soft' : 'border-line-soft bg-surface'
            }`}>
            <span className="text-2xl">{m.emoji}</span>
            <span className="text-caption1 font-medium text-label">{m.label}</span>
          </button>
        ))}
      </div>

      <p className="text-body2 font-semibold text-label mb-1.5">이번 주 한마디</p>
      <p className="text-caption1 text-label-alt mb-3">루틴 달성, 하이라이트, 감사한 점을 자유롭게 적어보세요.</p>
      <textarea value={comment} onChange={e => onCommentChange(e.target.value)}
        placeholder="이번 주 한 줄 소감을 남겨보세요..." rows={4}
        className="w-full border border-line rounded-2xl px-4 py-3 text-body2 resize-none focus:outline-none focus:ring-2 focus:ring-primary" />
    </div>
  );
}

// ── Step 3 유틸 ───────────────────────────────────────
type HabitLogItem = { habitId: string; date: string; completed: boolean; skipped?: boolean; substitute?: boolean };

function getWeekDays(weekStart: string, weekEnd: string): string[] {
  const days: string[] = [];
  const d   = new Date(weekStart + 'T12:00:00');
  const end = new Date(weekEnd   + 'T12:00:00');
  while (d <= end) { days.push(format(d, 'yyyy-MM-dd')); d.setDate(d.getDate() + 1); }
  return days;
}

function calcHabitWeeklyRate(habit: Habit, habitLogs: HabitLogItem[], weekDays: string[]): number {
  const scheduled = weekDays.filter(d => isScheduled(d, habit.frequency, habit.customDays));
  if (!scheduled.length) return 0;
  const done = habitLogs.filter(l =>
    l.habitId === habit.id && scheduled.includes(l.date) && (l.completed || l.skipped || l.substitute)
  ).length;
  return Math.round((done / scheduled.length) * 100);
}

function calcRoutineWeeklyRate(routine: DailyRoutine, routineLogs: RoutineLog[], weekDays: string[]): number {
  const scheduled = weekDays.filter(d => isScheduled(d, routine.frequency));
  if (!scheduled.length) return 0;
  const done = routineLogs.filter(l =>
    l.routineId === routine.id && scheduled.includes(l.date) && (l.completed || l.skipped)
  ).length;
  return Math.round((done / scheduled.length) * 100);
}

function getGoalFeedback(rate: number | null) {
  if (rate === null) return { feedback: '아직 연동된 루틴이나 습관이 없어요.', Icon: null, suggestion: '목표 카드에서 "습관으로 만들기"를 눌러 시작해보세요.', accent: 'text-label-alt', bg: 'bg-surface-alt', bar: '#cbd5e1' };
  if (rate >= 80)    return { feedback: '이번 주 목표 루틴을 잘 지켜냈어요!',       Icon: Dumbbell, suggestion: '지금 리듬을 유지하세요. 좋은 습관이 쌓이고 있어요.',                          accent: 'text-emerald-600', bg: 'bg-emerald-50', bar: '#1f8a4c' };
  if (rate >= 50)    return { feedback: '절반 이상 달성했어요. 일관성을 높여볼까요?', Icon: Smile, suggestion: '언제, 어디서 할지를 더 구체적으로 정해두면 도움이 돼요.',                        accent: 'text-amber-600',   bg: 'bg-amber-50',   bar: '#f59e0b' };
  if (rate > 0)      return { feedback: '이번 주 쉽지 않았네요. 같이 방법을 찾아봐요.', Icon: Sprout, suggestion: '루틴을 더 작게 쪼개거나 빈도를 줄여보는 건 어떨까요?',                       accent: 'text-red-500',     bg: 'bg-red-50',     bar: '#ef4444' };
  return               { feedback: '이번 주 관련 루틴이 진행되지 않았어요.',             Icon: null, suggestion: '2분 습관처럼 아주 작게 시작해보세요.',                                          accent: 'text-red-500',     bg: 'bg-red-50',     bar: '#ef4444' };
}

function RateBar({ rate, bar }: { rate: number; bar: string }) {
  return (
    <div className="h-1.5 bg-black/5 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: bar }} />
    </div>
  );
}

function MiniBar({ rate }: { rate: number }) {
  const color = rate >= 80 ? '#1f8a4c' : rate >= 50 ? '#f59e0b' : '#ef4444';
  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      <div className="w-10 h-1.5 bg-fill-strong rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${rate}%`, backgroundColor: color }} />
      </div>
      <span className="text-caption2 font-bold text-label-alt w-6 text-right">{rate}%</span>
    </div>
  );
}

// ── Step 3: 루틴 점검 ──────────────────────────────────
function ReviewImproveStep({
  activeMonthlyGoals, habits, habitLogs, routines, routineLogs,
  weekStart, weekEnd,
  routineChanges, onRoutineChangesUpdate,
  habitChanges,   onHabitChangesUpdate,
}: {
  activeMonthlyGoals: MonthlyGoal[];
  habits: Habit[]; habitLogs: HabitLogItem[];
  routines: DailyRoutine[]; routineLogs: RoutineLog[];
  weekStart: string; weekEnd: string;
  routineChanges: RoutineChange[]; onRoutineChangesUpdate: (c: RoutineChange[]) => void;
  habitChanges: HabitChange[];     onHabitChangesUpdate:   (c: HabitChange[]) => void;
}) {
  const [newTitle,    setNewTitle]    = useState('');
  const [newFreq,     setNewFreq]     = useState<RoutineFreq>('daily');
  const [showAddForm, setShowAddForm] = useState(false);

  const weekDays       = getWeekDays(weekStart, weekEnd);
  const activeGoalIds  = new Set(activeMonthlyGoals.map(g => g.id));

  const getGoalHabits   = (gid: string) => habits.filter(h => h.goalId === gid);
  const getGoalRoutines = (gid: string) => routines.filter(r => r.goalId === gid);

  const getGoalRate = (gid: string): number | null => {
    const gh = getGoalHabits(gid), gr = getGoalRoutines(gid);
    if (!gh.length && !gr.length) return null;
    const sum = gh.reduce((a, h) => a + calcHabitWeeklyRate(h, habitLogs, weekDays), 0)
              + gr.reduce((a, r) => a + calcRoutineWeeklyRate(r, routineLogs, weekDays), 0);
    return Math.round(sum / (gh.length + gr.length));
  };

  const unlinkedRoutines = routines.filter(r => !r.goalId || !activeGoalIds.has(r.goalId));

  // RoutineChange 헬퍼
  const getRC    = (id: string) => routineChanges.find(c => c.routineId === id);
  const setRC    = (id: string, action: RoutineChange['action'], ch?: RoutineChange['changes']) =>
    onRoutineChangesUpdate(routineChanges.map(c => c.routineId === id ? { ...c, action, changes: action === 'edit' ? ch : undefined } : c));
  const patchRC  = (id: string, patch: RoutineChange['changes']) =>
    onRoutineChangesUpdate(routineChanges.map(c => c.routineId === id ? { ...c, changes: { ...c.changes, ...patch } } : c));

  // HabitChange 헬퍼
  const getHC    = (id: string) => habitChanges.find(c => c.habitId === id);
  const setHC    = (id: string, action: HabitChange['action'], ch?: HabitChange['changes']) =>
    onHabitChangesUpdate(habitChanges.map(c => c.habitId === id ? { ...c, action, changes: action === 'edit' ? ch : undefined } : c));
  const patchHC  = (id: string, patch: HabitChange['changes']) =>
    onHabitChangesUpdate(habitChanges.map(c => c.habitId === id ? { ...c, changes: { ...c.changes, ...patch } } : c));

  const addNewRoutine = () => {
    if (!newTitle.trim()) return;
    onRoutineChangesUpdate([...routineChanges, {
      routineId: `new-${Date.now()}`,
      action: 'add',
      newRoutine: { title: newTitle.trim(), type: 'personal', frequency: newFreq, isActive: true, order: 999 },
    }]);
    setNewTitle(''); setNewFreq('daily'); setShowAddForm(false);
  };

  return (
    <div className="flex flex-col px-5 pt-6 pb-4 gap-5">
      <div>
        <h2 className="text-title3 font-bold text-label-strong mb-1">루틴 점검</h2>
        <p className="text-body2 text-label-alt">목표별 한 주를 돌아보고 루틴·습관을 조정해요.</p>
      </div>

      {/* ── 목표별 섹션 ── */}
      {activeMonthlyGoals.map(goal => {
        const rate = getGoalRate(goal.id);
        const { feedback, Icon: FeedbackIcon, suggestion, accent, bg, bar } = getGoalFeedback(rate);
        const gh = getGoalHabits(goal.id);
        const gr = getGoalRoutines(goal.id);

        return (
          <div key={goal.id} className="rounded-2xl border border-line-soft overflow-hidden">
            {/* 목표 헤더 */}
            <div className="px-4 py-3 flex items-center gap-2 border-b border-line-soft"
              style={goal.color ? { backgroundColor: `${goal.color}12` } : { backgroundColor: 'var(--color-surface-alt)' }}>
              <p className="text-body2 font-bold text-label-strong flex-1 truncate">{goal.title}</p>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 inline-flex items-center gap-1 ${
                goal.category === 'faith' ? 'bg-emerald-100 text-emerald-600' : 'bg-primary-soft text-primary'
              }`}>
                {goal.category === 'faith'
                  ? <BookOpen size={11} strokeWidth={1.9} />
                  : <Dumbbell size={11} strokeWidth={1.9} />}
                {goal.category === 'faith' ? '신앙' : '개인'}
              </span>
            </div>

            <div className="px-4 py-3 flex flex-col gap-3">
              {/* 피드백 */}
              <div className={`${bg} rounded-xl px-3 py-3`}>
                {rate !== null && (
                  <>
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-caption2 text-label-alt">이번 주 달성률</p>
                      <p className={`text-body2 font-bold ${accent}`}>{rate}%</p>
                    </div>
                    <RateBar rate={rate} bar={bar} />
                    <div className="mb-2" />
                  </>
                )}
                <p className={`text-caption1 font-semibold ${accent} mb-0.5 flex items-center gap-1`}>
                  {FeedbackIcon && <FeedbackIcon size={13} strokeWidth={1.9} />}{feedback}
                </p>
                <p className="text-caption2 text-label-alt leading-relaxed">{suggestion}</p>
              </div>

              {/* 연동 루틴 */}
              {gr.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-caption2 font-bold text-label-alt">연동 루틴</p>
                  {gr.map(routine => {
                    const rc = getRC(routine.id);
                    const weekRate = calcRoutineWeeklyRate(routine, routineLogs, weekDays);
                    return (
                      <RoutineEditCard
                        key={routine.id}
                        label={rc?.changes?.title ?? routine.title}
                        emoji={rc?.changes?.emoji ?? routine.emoji}
                        weekRate={weekRate}
                        action={rc?.action ?? 'keep'}
                        changes={rc?.changes}
                        original={{ title: routine.title, frequency: routine.frequency as RoutineFreq, when: routine.when, twoMinuteHabit: routine.twoMinuteHabit, emoji: routine.emoji }}
                        onKeep={()   => setRC(routine.id, 'keep')}
                        onEdit={()   => setRC(routine.id, 'edit', { title: routine.title, frequency: routine.frequency as RoutineFreq, when: routine.when ?? '', twoMinuteHabit: routine.twoMinuteHabit ?? '', emoji: routine.emoji ?? '' })}
                        onDelete={()  => setRC(routine.id, 'delete')}
                        onPatch={patch => patchRC(routine.id, patch)}
                      />
                    );
                  })}
                </div>
              )}

              {/* 연동 습관 */}
              {gh.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-caption2 font-bold text-label-alt">연동 습관</p>
                  {gh.map(habit => {
                    const hc = getHC(habit.id);
                    const weekRate = calcHabitWeeklyRate(habit, habitLogs, weekDays);
                    return (
                      <HabitEditCard
                        key={habit.id}
                        habit={habit}
                        weekRate={weekRate}
                        action={hc?.action ?? 'keep'}
                        changes={hc?.changes}
                        onKeep={()    => setHC(habit.id, 'keep')}
                        onEdit={()    => setHC(habit.id, 'edit', {
                          title: habit.title, frequency: habit.frequency,
                          customDays: habit.customDays ?? [],
                          when: habit.when ?? '', miniRoutine: habit.miniRoutine ?? '',
                          twoMinuteHabit: habit.twoMinuteHabit ?? '',
                        })}
                        onDelete={()   => setHC(habit.id, 'delete')}
                        onPatch={patch => patchHC(habit.id, patch)}
                      />
                    );
                  })}
                </div>
              )}

              {!gh.length && !gr.length && (
                <p className="text-caption1 text-label-assistive text-center py-1">연동된 습관·루틴이 없어요</p>
              )}
            </div>
          </div>
        );
      })}

      {/* ── 기타 루틴 ── */}
      {unlinkedRoutines.length > 0 && (
        <div className="flex flex-col gap-2">
          {activeMonthlyGoals.length > 0 && <p className="text-caption1 font-bold text-label-alt">기타 루틴</p>}
          {unlinkedRoutines.map(routine => {
            const rc = getRC(routine.id);
            const weekRate = calcRoutineWeeklyRate(routine, routineLogs, weekDays);
            return (
              <RoutineEditCard
                key={routine.id}
                label={rc?.changes?.title ?? routine.title}
                emoji={rc?.changes?.emoji ?? routine.emoji}
                weekRate={weekRate}
                action={rc?.action ?? 'keep'}
                changes={rc?.changes}
                original={{ title: routine.title, frequency: routine.frequency as RoutineFreq, when: routine.when, twoMinuteHabit: routine.twoMinuteHabit, emoji: routine.emoji }}
                onKeep={()   => setRC(routine.id, 'keep')}
                onEdit={()   => setRC(routine.id, 'edit', { title: routine.title, frequency: routine.frequency as RoutineFreq, when: routine.when ?? '', twoMinuteHabit: routine.twoMinuteHabit ?? '', emoji: routine.emoji ?? '' })}
                onDelete={()  => setRC(routine.id, 'delete')}
                onPatch={patch => patchRC(routine.id, patch)}
              />
            );
          })}
        </div>
      )}

      {/* ── 새 루틴 추가 ── */}
      {showAddForm ? (
        <div className="border border-primary/30 bg-primary-soft rounded-2xl p-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input type="text" value={newTitle} onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNewRoutine()}
              placeholder="새 루틴 이름"
              className="flex-1 border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary bg-surface"
              autoFocus />
            <button onClick={() => setShowAddForm(false)} className="text-label-alt px-1"><X size={18} /></button>
          </div>
          <div className="flex gap-1.5">
            {(['daily', 'weekdays', 'weekends'] as RoutineFreq[]).map(f => (
              <button key={f} onClick={() => setNewFreq(f)}
                className={`flex-1 py-1.5 rounded-lg text-caption1 font-medium transition-colors ${newFreq === f ? 'bg-primary text-white' : 'bg-surface border border-line text-label-alt'}`}>
                {ROUTINE_FREQ_LABELS[f]}
              </button>
            ))}
          </div>
          <Button size="sm" fullWidth onClick={addNewRoutine} disabled={!newTitle.trim()}>추가</Button>
        </div>
      ) : (
        <button onClick={() => setShowAddForm(true)} className="flex items-center gap-1.5 text-body2 font-medium text-primary py-1 px-1">
          <Plus size={16} /> 새 루틴 추가
        </button>
      )}

      {routineChanges.filter(c => c.action === 'add' && c.newRoutine).map(c => (
        <div key={c.routineId} className="flex items-center gap-2 bg-primary-soft rounded-xl px-3 py-2.5">
          <Plus size={13} className="text-primary shrink-0" />
          <span className="flex-1 text-body2 text-label-strong">{c.newRoutine!.title}</span>
          <span className="text-caption1 text-primary">{ROUTINE_FREQ_LABELS[c.newRoutine!.frequency as RoutineFreq]}</span>
          <button onClick={() => onRoutineChangesUpdate(routineChanges.filter(x => x.routineId !== c.routineId))} className="text-label-alt ml-1">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── 루틴 수정 카드 ─────────────────────────────────────
function RoutineEditCard({
  label, emoji, weekRate, action, changes, original,
  onKeep, onEdit, onDelete, onPatch,
}: {
  label: string; emoji?: string; weekRate: number;
  action: RoutineChange['action'];
  changes?: RoutineChange['changes'];
  original: { title: string; frequency: RoutineFreq; when?: string; twoMinuteHabit?: string; emoji?: string };
  onKeep: () => void; onEdit: () => void; onDelete: () => void;
  onPatch: (p: RoutineChange['changes']) => void;
}) {
  const isDelete = action === 'delete';
  const isEdit   = action === 'edit';
  const freq     = (changes?.frequency as RoutineFreq) ?? original.frequency;

  return (
    <div className={`rounded-xl border p-3 transition-all ${isDelete ? 'border-red-200 bg-red-50' : 'border-line-soft bg-surface'}`}>
      <div className="flex items-center gap-2 mb-2">
        {emoji && <span className="text-base flex-shrink-0">{emoji}</span>}
        <p className={`text-body2 font-medium flex-1 truncate ${isDelete ? 'text-red-400 line-through' : 'text-label-strong'}`}>{label}</p>
        <MiniBar rate={weekRate} />
      </div>
      <div className="flex gap-1.5">
        <ActionBtn active={action === 'keep'} onClick={onKeep}   label="유지" icon={<Check size={13}/>}  activeColor="bg-primary-soft text-primary" />
        <ActionBtn active={isEdit}            onClick={onEdit}   label="수정" icon={<Pencil size={13}/>} activeColor="bg-amber-100 text-amber-700" />
        <ActionBtn active={isDelete}          onClick={onDelete} label="삭제" icon={<Trash2 size={13}/>} activeColor="bg-red-100 text-red-600" />
      </div>

      {isEdit && (
        <div className="mt-3 flex flex-col gap-3 pt-3 border-t border-line-soft">
          {/* 이름 */}
          <FieldGroup label="루틴 이름">
            <input value={changes?.title ?? original.title} onChange={e => onPatch({ title: e.target.value })}
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>

          {/* 빈도 */}
          <FieldGroup label="반복 주기">
            <div className="flex gap-1.5">
              {(['daily', 'weekdays', 'weekends'] as RoutineFreq[]).map(f => (
                <button key={f} onClick={() => onPatch({ frequency: f })}
                  className={`flex-1 py-1.5 rounded-lg text-caption1 font-medium transition-colors ${freq === f ? 'bg-primary-soft text-primary border border-primary/30' : 'bg-fill border border-line text-label-alt'}`}>
                  {ROUTINE_FREQ_LABELS[f]}
                </button>
              ))}
            </div>
          </FieldGroup>

          {/* 언제 */}
          <FieldGroup label="언제 (선택)">
            <input value={changes?.when ?? original.when ?? ''} onChange={e => onPatch({ when: e.target.value })}
              placeholder="예: 기상 후, 점심 식사 전"
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>

          {/* 2분 트리거 */}
          <FieldGroup label={<span className="flex items-center gap-1"><Zap size={12} strokeWidth={1.9} /> 2분 트리거 (선택)</span>}>
            <input value={changes?.twoMinuteHabit ?? original.twoMinuteHabit ?? ''} onChange={e => onPatch({ twoMinuteHabit: e.target.value })}
              placeholder="예: 책 펴기, 스트레칭 1회"
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>
        </div>
      )}
    </div>
  );
}

// ── 습관 수정 카드 ─────────────────────────────────────
function HabitEditCard({
  habit, weekRate, action, changes,
  onKeep, onEdit, onDelete, onPatch,
}: {
  habit: Habit; weekRate: number;
  action: HabitChange['action'];
  changes?: HabitChange['changes'];
  onKeep: () => void; onEdit: () => void; onDelete: () => void;
  onPatch: (p: HabitChange['changes']) => void;
}) {
  const isDelete = action === 'delete';
  const isEdit   = action === 'edit';
  const freq     = changes?.frequency ?? habit.frequency;
  const days     = changes?.customDays ?? habit.customDays ?? [];

  const toggleDay = (dow: number) => {
    const next = days.includes(dow) ? days.filter(d => d !== dow) : [...days, dow];
    onPatch({ customDays: next });
  };

  return (
    <div className={`rounded-xl border p-3 transition-all ${isDelete ? 'border-red-200 bg-red-50' : 'border-line-soft bg-surface'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base flex-shrink-0">{habit.emoji}</span>
        <p className={`text-body2 font-medium flex-1 truncate ${isDelete ? 'text-red-400 line-through' : 'text-label-strong'}`}>
          {changes?.title ?? habit.title}
        </p>
        <MiniBar rate={weekRate} />
      </div>
      <div className="flex gap-1.5">
        <ActionBtn active={action === 'keep'} onClick={onKeep}   label="유지" icon={<Check size={13}/>}  activeColor="bg-primary-soft text-primary" />
        <ActionBtn active={isEdit}            onClick={onEdit}   label="수정" icon={<Pencil size={13}/>} activeColor="bg-amber-100 text-amber-700" />
        <ActionBtn active={isDelete}          onClick={onDelete} label="삭제" icon={<Trash2 size={13}/>} activeColor="bg-red-100 text-red-600" />
      </div>

      {isEdit && (
        <div className="mt-3 flex flex-col gap-3 pt-3 border-t border-line-soft">
          {/* 이름 */}
          <FieldGroup label="습관 이름">
            <input value={changes?.title ?? habit.title} onChange={e => onPatch({ title: e.target.value })}
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>

          {/* 빈도 */}
          <FieldGroup label="반복 주기">
            <div className="grid grid-cols-2 gap-1.5">
              {HABIT_FREQ_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => onPatch({ frequency: opt.value })}
                  className={`py-1.5 rounded-lg text-caption1 font-medium transition-colors ${freq === opt.value ? 'bg-primary-soft text-primary border border-primary/30' : 'bg-fill border border-line text-label-alt'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {/* 요일 직접 선택 */}
            {freq === 'custom' && (
              <div className="flex gap-1 mt-2">
                {WEEKDAY_LABELS.map((lbl, dow) => (
                  <button key={dow} onClick={() => toggleDay(dow)}
                    className={`flex-1 py-1.5 rounded-lg text-caption2 font-bold transition-colors ${days.includes(dow) ? 'bg-primary text-white' : 'bg-fill border border-line text-label-alt'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </FieldGroup>

          {/* 언제 */}
          <FieldGroup label="언제">
            <input value={changes?.when ?? habit.when ?? ''} onChange={e => onPatch({ when: e.target.value })}
              placeholder="예: 기상 후, 점심 식사 전"
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>

          {/* 미니 습관 */}
          <FieldGroup label={<span className="flex items-center gap-1"><Flame size={12} strokeWidth={1.9} /> 미니 습관 (대체용)</span>}>
            <input value={changes?.miniRoutine ?? habit.miniRoutine ?? ''} onChange={e => onPatch({ miniRoutine: e.target.value })}
              placeholder="예: 10분 걷기, 영상 1개"
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>

          {/* 2분 트리거 */}
          <FieldGroup label={<span className="flex items-center gap-1"><Zap size={12} strokeWidth={1.9} /> 2분 트리거</span>}>
            <input value={changes?.twoMinuteHabit ?? habit.twoMinuteHabit ?? ''} onChange={e => onPatch({ twoMinuteHabit: e.target.value })}
              placeholder="예: 운동복 입기, 책 펴기"
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>
        </div>
      )}
    </div>
  );
}

// ── 공용 컴포넌트 ──────────────────────────────────────
function FieldGroup({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-caption2 font-semibold text-label-alt">{label}</p>
      {children}
    </div>
  );
}

function ActionBtn({ active, onClick, label, icon, activeColor }: {
  active: boolean; onClick: () => void; label: string; icon: ReactNode; activeColor: string;
}) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-caption1 font-medium transition-colors ${active ? activeColor : 'bg-surface border border-line text-label-alt'}`}>
      {icon}{label}
    </button>
  );
}

// ── Step 4 ────────────────────────────────────────────
function ReviewIntentionStep({ intention, onIntentionChange, groups, shareToGroups, onToggleGroup }: {
  intention: string; onIntentionChange: (v: string) => void;
  groups: typeof mockGroups; shareToGroups: string[]; onToggleGroup: (id: string) => void;
}) {
  return (
    <div className="flex flex-col px-6 pt-6 pb-4">
      <h2 className="text-title3 font-bold text-label-strong mb-2">다음 주 다짐</h2>
      <p className="text-body2 text-label-alt mb-5">다음 주에 집중할 한 가지를 정해보세요.</p>

      <textarea value={intention} onChange={e => onIntentionChange(e.target.value)}
        placeholder="다음 주에 집중할 한 가지는..." rows={4}
        className="w-full border border-line rounded-2xl px-4 py-3 text-body2 resize-none focus:outline-none focus:ring-2 focus:ring-primary mb-6" />

      <p className="text-body2 font-semibold text-label mb-2">소모임 나눔</p>
      <p className="text-caption1 text-label-alt mb-3">선택한 소모임에 이번 주 소감과 다음 주 다짐을 공유해요.</p>
      <div className="flex flex-col gap-2">
        {groups.map(group => {
          const on = shareToGroups.includes(group.id);
          return (
            <div key={group.id} className="flex items-center gap-3 bg-surface-alt rounded-2xl px-4 py-3">
              <p className="text-body2 font-medium text-label-strong flex-1 truncate">{group.title}</p>
              <button onClick={() => onToggleGroup(group.id)}
                className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${on ? 'bg-primary' : 'bg-fill-strong'}`}>
                <motion.div className="absolute top-0.5 w-5 h-5 bg-surface rounded-full shadow"
                  animate={{ left: on ? '1.375rem' : '0.125rem' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
