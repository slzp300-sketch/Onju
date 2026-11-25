import { newId } from '../utils/id';
import FormBoundary from '../components/FormBoundary';
import { useLocalDraft } from '../hooks/useLocalDraft';
import { useFormProtection } from '../hooks/useFormProtection';
import { useAuthStore } from '../store/authStore';
import { toast } from '../store/toastStore';
import { isReviewDraft, migrateReviewChanges, reviewChangesError, type ReviewSnapshot } from '../utils/reviewDraft';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Check, Plus, Pencil, ChevronLeft, Trash2, Target, PartyPopper, Dumbbell, Sprout, BookOpen, Zap, Flame, Smile, Meh, Frown } from '../icons';
import { useRoutineStore } from '../store/routineStore';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { prepareReviewSubmission, saveReviewSubmission, withReviewLock } from '../lib/reviewSubmission';
import { useReviewSubmission } from '../hooks/useReviewSubmission';
import ReviewSaveProgress from '../components/review/ReviewSaveProgress';
import { getPeriodCompletion } from '../utils/dayCompletion';
import { countWeeklyGoalDone, weeklyGoalRate } from '../utils/weeklyGoalProgress';
import { isItemDue } from '../utils/scheduleHistory';
import { currentWeek, currentYear, getWeekRangeText, getCurrentWeekRange } from '../utils/date';
import Button from '../components/ui/Button';
import type { RoutineChange, HabitChange, DailyRoutine, MonthlyGoal, WeeklyGoal, Habit, RoutineLog, HabitFrequency, SmallGroup, PersonalRoutine } from '../types';
import { useGroupStore } from '../store/groupStore';
import Switch from '../components/ui/Switch';
import { format } from 'date-fns';
import { useLocalNow } from '../hooks/useLocalNow';
import OnjuIcon from '../components/ui/OnjuIcon';
import CommunityGate from '../components/groups/CommunityGate';
import { useBlockedUsers } from '../hooks/useBlockedUsers';

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
  return <FormBoundary exists><ReviewEntry /></FormBoundary>;
}
function ReviewEntry() {
  const owner = useAuthStore(s => s.user?.id);
  const {journal,error} = useReviewSubmission(owner);
  const [autoStart,setAutoStart] = useState(false);
  if(error) return <div role="alert" className="p-6 text-body2">{error}<button className="block min-h-11 text-primary" onClick={()=>window.location.reload()}>다시 불러오기</button></div>;
  if(journal) return <ReviewSaveProgress key={journal.id} initial={journal} autoStart={autoStart} />;
  return <WeeklyReviewEditor onPrepared={()=>setAutoStart(true)} />;
}
function WeeklyReviewEditor({onPrepared}: {onPrepared:()=>void}) {
  const [owner] = useState(() => useAuthStore.getState().user?.id);
  const sameOwner = () => !!owner && useAuthStore.getState().user?.id === owner;
  const navigate      = useNavigate();
  const location      = useLocation();
  const routineStore  = useRoutineStore();
  const { monthlyGoals, weeklyGoals } = useGoalStore();
  const habitStore = useHabitStore();
  const { habits, habitLogs, personalRoutines } = habitStore;
  const allGroups = useGroupStore(s => s.groups);
  const { data: blocked = [] } = useBlockedUsers();
  const myGroups = allGroups.filter(group => !blocked.some(user => user.userId === group.creatorId));

  const [step, setStep] = useState(0);
  const [dir,  setDir]  = useState(1);
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [step]);

  // 리뷰 대상 주 — 유예 윈도우(월요일)에는 지난주를 가리킴
  const target = location.state as ReviewTarget | null;
  const [week] = useState(() => target?.targetWeek ?? currentWeek());
  const [year] = useState(() => target?.targetYear ?? currentYear());
  const [{ start, end }] = useState(() => target?.weekStart && target?.weekEnd
    ? { start: new Date(target.weekStart + 'T00:00:00'), end: new Date(target.weekEnd + 'T23:59:59') }
    : getCurrentWeekRange());
  const weekStartStr = format(start, 'yyyy-MM-dd');
  const weekEndStr   = format(end,   'yyyy-MM-dd');

  const now = useLocalNow();
  const todayIso = format(now, 'yyyy-MM-dd');
  const activeMonthlyGoals = monthlyGoals.filter(g => g.startDate <= todayIso && g.endDate >= todayIso);

  // 리뷰 대상 주의 주간 목표 결산 — 체크 로그에서 자동 계산
  const weeklyGoalResults = weeklyGoals
    .filter(g => g.startDate <= weekEndStr && g.endDate >= weekStartStr)
    .map(g => {
      const done = countWeeklyGoalDone(g, habitLogs, routineStore.logs);
      return { goal: g, done, rate: weeklyGoalRate(g, done) };
    });

  const { personalRate, faithRate, combinedRate } = getPeriodCompletion(
    start, end, todayIso, habits, habitLogs, routineStore.faithRoutines, routineStore.logs,
  );

  // Step 2
  const [mood,    setMood]    = useState<Mood | null>(null);
  const [comment, setComment] = useState('');

  // Step 3 — routines
  const allRoutines = [
    ...routineStore.faithRoutines.filter(r => r.isActive && !r.archivedAt),
  ];
  const [routineChanges, setRoutineChanges] = useState<RoutineChange[]>(() =>
    allRoutines.map(r => ({ routineId: r.id, title: r.title, baseRoutine: r, action: 'keep' as const }))
  );

  // Step 3 — 홈에 있는 모든 개인 습관 (목표 연결 여부와 무관)
  const activeHabits = habits.filter(h => !h.archivedAt);
  const [habitChanges, setHabitChanges] = useState<HabitChange[]>(() =>
    activeHabits.map(h => ({ habitId: h.id, title: h.title, baseHabit: h, action: 'keep' as const }))
  );

  // Step 4
  const [intention,     setIntention]     = useState('');
  const [shareToGroups, setShareToGroups] = useState<string[]>([]);

  const [submissionIds, setSubmissionIds] = useState<Record<string, string>>(() => Object.fromEntries(['review', ...myGroups.map(g => g.id)].map(id => [id, newId()])));
  const [snapshot, setSnapshot] = useState<ReviewSnapshot>();
  const [changesAppliedAt, setChangesAppliedAt] = useState<string>();
  const draftValues = { snapshot, changesAppliedAt, submissionIds, step, mood, comment, routineChanges, habitChanges, intention, shareToGroups };
  const draft = useLocalDraft({ document: `weekly-review:${year}:${week}:${weekStartStr}`, values: draftValues, validate: isReviewDraft, canDiscard: v => !v.changesAppliedAt,
    restore: v => { setSubmissionIds({ ...submissionIds, ...v.submissionIds }); setStep(v.step); setMood(v.mood); setComment(v.comment); setIntention(v.intention);
      const migrated = migrateReviewChanges(v);
      setChangesAppliedAt(v.changesAppliedAt);
      setSnapshot(v.snapshot);
      setRoutineChanges(migrated.routineChanges);
      setHabitChanges(migrated.habitChanges);
      setShareToGroups(v.shareToGroups.filter(id => myGroups.some(g => g.id === id))); } });
  const protection = useFormProtection(draftValues, draft.leaveMessage);
  const [saving,setSaving] = useState(false);
  const submit = async () => {
    if(saving || !sameOwner()) return;
    setSaving(true);
    try {
      const validation=reviewChangesError(habitChanges,routineChanges);
      if(validation) throw new Error(validation);
      const summary=snapshot ?? {personalRate,faithRate,combinedRate,goalAchievedCount:weeklyGoalResults.filter(r=>r.rate>=100).length,goalTotalCount:weeklyGoalResults.length};
      let prepared=false;
      await withReviewLock(owner!, async()=>{
        if(!sameOwner()) throw new Error('계정이 바뀌었어요. 원래 계정에서 다시 열어주세요.');
        const plan=prepareReviewSubmission({owner:owner!,week,year,weekStart:weekStartStr,weekEnd:weekEndStr,
          draft:draftValues,snapshot:summary,habits,routines:[...routineStore.personalRoutines,...routineStore.faithRoutines],bundles:personalRoutines,
          weekly:weeklyGoalResults,groups:myGroups.map(g=>({id:g.id,name:g.title}))});
        // Persist every request before unmounting the editable draft or sending anything.
        prepared=protection.save(()=>{ saveReviewSubmission(plan,null); });
      });
      if(prepared && sameOwner()) onPrepared();
    } catch(error) { if(sameOwner()) toast.error(error instanceof Error?error.message:'리뷰 저장 상태를 보관하지 못했어요. 다시 시도해주세요.'); }
    finally { setSaving(false); }
  };

  const goNext = () => { setDir(1);  setStep(s => s + 1); };
  const goBack = () => {
    if (step === 0) { protection.requestLeave(() => navigate(-1)); return; }
    setDir(-1); setStep(s => s - 1);
  };

  const isLastStep  = step === 3;
  const changeError = reviewChangesError(habitChanges, routineChanges);
  const canProceed = !((step === 2 || isLastStep) && changeError) && (!isLastStep || intention.trim().length > 0);
  const changedCount = [...habitChanges, ...routineChanges].filter(c => c.action !== 'keep').length;
  const applicationNotice = changesAppliedAt
    ? `${format(new Date(changesAppliedAt), 'M월 d일 HH:mm')}에 조정을 반영했어요. 저장·공유를 마저 완료해주세요.`
    : `리뷰를 완료하면 ${format(now, 'M월 d일')}부터 추가·수정·보관을 모두 바로 적용해요. 이전 날짜의 기록은 보존돼요.`;

  const steps = [
    <ReviewSummaryStep
      weekRangeText={getWeekRangeText(start)}
      personalRate={snapshot?.personalRate ?? personalRate} faithRate={snapshot?.faithRate ?? faithRate} overallRate={snapshot?.combinedRate ?? combinedRate}
      activeMonthlyGoals={activeMonthlyGoals}
      weeklyGoalResults={weeklyGoalResults}
    />,
    <ReviewFeedbackStep
      mood={mood} onMoodChange={setMood}
      comment={comment} onCommentChange={setComment}
    />,
    <ReviewImproveStep
      activeMonthlyGoals={activeMonthlyGoals}
      habits={[...activeHabits, ...habitChanges.flatMap(c => c.action !== 'keep' && c.baseHabit && !activeHabits.some(h => h.id === c.habitId) ? [c.baseHabit] : [])]} habitLogs={habitLogs} personalRoutines={personalRoutines}
      applicationNotice={applicationNotice} applied={!!changesAppliedAt}
      routines={[...allRoutines, ...routineChanges.flatMap(c => c.action !== 'keep' && c.baseRoutine && !allRoutines.some(r => r.id === c.routineId) ? [c.baseRoutine] : [])]} routineLogs={routineStore.logs}
      weekStart={weekStartStr} weekEnd={weekEndStr < todayIso ? weekEndStr : todayIso}
      routineChanges={routineChanges} onRoutineChangesUpdate={setRoutineChanges}
      habitChanges={habitChanges}   onHabitChangesUpdate={setHabitChanges}
    />,
    <ReviewIntentionStep
      applicationNotice={applicationNotice} changedCount={changedCount}
      intention={intention} onIntentionChange={setIntention}
      groups={myGroups} shareToGroups={shareToGroups}
      onToggleGroup={id => {
        if (!submissionIds[id]) setSubmissionIds(prev => ({ ...prev, [id]: newId() }));
        setShareToGroups(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
      }}
    />,
  ];

  return (
    <div className="review-paper min-h-dvh flex flex-col pb-28">
      {protection.guard}
      <div className="px-4 pt-3">{draft.banner}</div>
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-4 pb-2 gap-3">
        <button onClick={goBack} aria-label="뒤로 가기" className="paper-back-button hover:bg-fill text-label-alt">
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
            className="relative flex flex-col"
          >
            <fieldset disabled={draft.awaitingChoice || saving} className="contents">{steps[step]}</fieldset>
          </motion.div>
        </AnimatePresence>
      </div>

      {(step === 2 || isLastStep) && changeError && <p role="alert" className="px-6 pt-2 text-caption1 text-negative">{changeError}</p>}
      {/* 하단 버튼 */}
      <div className="review-paper-footer form-paper-footer fixed inset-x-0 mx-auto max-w-md px-5 pt-3 flex gap-3" style={{ paddingBottom: 'calc(1rem + var(--app-safe-bottom))' }}>
        {step > 0 && <Button variant="ghost" className="shrink-0 whitespace-nowrap px-4" onClick={goBack}>뒤로</Button>}
        {isLastStep ? (
          <Button fullWidth disabled={!canProceed || saving || draft.awaitingChoice} onClick={() => void submit()}>
            {saving ? '저장 중...' : '리뷰 완료'}
            {!saving && <Check size={16} />}
          </Button>
        ) : (
          <Button fullWidth disabled={!canProceed || draft.awaitingChoice} onClick={goNext}>
            다음 <ChevronRight size={16} />
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Step 1 ────────────────────────────────────────────
function ReviewSummaryStep({ weekRangeText, personalRate, faithRate, overallRate, activeMonthlyGoals, weeklyGoalResults }: {
  weekRangeText: string; personalRate: number; faithRate: number; overallRate: number; activeMonthlyGoals: MonthlyGoal[];
  weeklyGoalResults: { goal: WeeklyGoal; done: number; rate: number }[];
}) {
  const weeklyAvg = weeklyGoalResults.length
    ? Math.round(weeklyGoalResults.reduce((s, r) => s + r.rate, 0) / weeklyGoalResults.length)
    : 0;
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

      <div className="bg-surface-alt rounded-2xl px-4 py-3.5 mb-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption1 text-label-alt">예정일 기록률 · 완료·대체·쉼 포함</p>
          <p className="text-body2 font-semibold text-label-strong mt-0.5 flex items-center gap-1.5">
            <encouragement.Icon size={16} strokeWidth={1.9} /> {encouragement.text}
          </p>
        </div>
        <p className="shrink-0 text-3xl font-bold text-label-strong">{overallRate}%</p>
      </div>

      {weeklyGoalResults.length > 0 && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-body2 font-semibold text-label">이번 주 목표 결산</p>
            <p className={`text-caption1 font-bold ${weeklyAvg >= 80 ? 'text-positive' : 'text-label-alt'}`}>
              평균 {weeklyAvg}%
            </p>
          </div>
          <div className="flex flex-col gap-2 mb-6">
            {weeklyGoalResults.map(({ goal, done, rate }) => (
              <div key={goal.id} className="bg-surface-alt rounded-xl px-4 py-3 flex items-center gap-3">
                <span className="text-lg">{goal.emoji ?? '🎯'}</span>
                <p className="flex-1 text-body2 font-semibold text-label-strong truncate">
                  {goal.title} 주 {goal.targetCount}회
                </p>
                <p className={`text-body2 font-bold tabular-nums ${rate >= 100 ? 'text-positive' : 'text-cautionary'}`}>
                  {done}/{goal.targetCount} · {rate}%
                </p>
              </div>
            ))}
            <p className="text-caption1 text-label-assistive px-1">
              {weeklyAvg >= 80
                ? '80%를 넘었어요 — 다음 주 목표 칸이 늘어나요 🎉'
                : '평균 80% 이상이면 다음 주 목표 칸이 늘어나요'}
            </p>
          </div>
        </>
      )}

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
const MOODS: { value: Mood; Icon: typeof Smile; label: string }[] = [
  { value: 'hard',   Icon: Frown, label: '힘들었어요' },
  { value: 'normal', Icon: Meh, label: '보통이었어요' },
  { value: 'easy',   Icon: Smile, label: '여유로웠어요' },
];

function ReviewFeedbackStep({ mood, onMoodChange, comment, onCommentChange }: {
  mood: Mood | null; onMoodChange: (m: Mood) => void;
  comment: string; onCommentChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col px-6 pt-6 pb-4">
      <h2 className="text-title3 font-bold text-label-strong mb-2">기분 & 소감</h2>


      <p className="text-body2 font-semibold text-label mb-3">이번 주 어땠나요?</p>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {MOODS.map(m => (
          <button key={m.value} aria-pressed={mood === m.value} onClick={() => onMoodChange(m.value)}
            className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all ${
              mood === m.value ? 'border-accent bg-accent' : 'border-line-soft bg-surface'
            }`}>
            <m.Icon size={26} strokeWidth={1.7} />
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

function calcHabitWeeklyRate(habit: Habit, habitLogs: HabitLogItem[], weekDays: string[]): number | null {
  const scheduled = weekDays.filter(d => isItemDue(habit, d));
  if (!scheduled.length) return null;
  const done = habitLogs.filter(l =>
    l.habitId === habit.id && scheduled.includes(l.date) && (l.completed || l.skipped || l.substitute)
  ).length;
  return Math.round((done / scheduled.length) * 100);
}

function calcRoutineWeeklyRate(routine: DailyRoutine, routineLogs: RoutineLog[], weekDays: string[]): number | null {
  const scheduled = weekDays.filter(d => isItemDue(routine, d));
  if (!scheduled.length) return null;
  const done = routineLogs.filter(l =>
    l.routineId === routine.id && scheduled.includes(l.date) && (l.completed || l.skipped)
  ).length;
  return Math.round((done / scheduled.length) * 100);
}

function MiniBar({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-caption2 text-label-alt">예정 없음</span>;
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
  activeMonthlyGoals, habits, personalRoutines, habitLogs, routines, routineLogs,
  weekStart, weekEnd, routineChanges, onRoutineChangesUpdate,
  habitChanges, onHabitChangesUpdate, applicationNotice, applied,
}: {
  activeMonthlyGoals: MonthlyGoal[]; habits: Habit[]; personalRoutines: PersonalRoutine[];
  habitLogs: HabitLogItem[]; routines: DailyRoutine[]; routineLogs: RoutineLog[];
  weekStart: string; weekEnd: string; applicationNotice: string; applied: boolean;
  routineChanges: RoutineChange[]; onRoutineChangesUpdate: (c: RoutineChange[]) => void;
  habitChanges: HabitChange[]; onHabitChangesUpdate: (c: HabitChange[]) => void;
}) {
  const weekDays = getWeekDays(weekStart, weekEnd);
  const setHC = (id: string, action: HabitChange['action'], changes?: HabitChange['changes']) => {
    const prior = habitChanges.find(c => c.habitId === id);
    const next = { habitId: id, title: habits.find(h => h.id === id)?.title, baseHabit: prior ? prior.baseHabit : habits.find(h => h.id === id), action, changes };
    onHabitChangesUpdate(habitChanges.some(c => c.habitId === id)
      ? habitChanges.map(c => c.habitId === id ? next : c) : [...habitChanges, next]);
  };
  const patchHC = (id: string, patch: HabitChange['changes']) =>
    onHabitChangesUpdate(habitChanges.map(c => c.habitId === id ? { ...c, changes: { ...c.changes, ...patch } } : c));
  const setRC = (id: string, action: RoutineChange['action'], changes?: RoutineChange['changes']) => {
    const prior = routineChanges.find(c => c.routineId === id);
    const next = { routineId: id, title: routines.find(r => r.id === id)?.title, baseRoutine: prior ? prior.baseRoutine : routines.find(r => r.id === id), action, changes };
    onRoutineChangesUpdate(routineChanges.some(c => c.routineId === id)
      ? routineChanges.map(c => c.routineId === id ? next : c) : [...routineChanges, next]);
  };
  const card = (habit: Habit) => {
    const change = habitChanges.find(c => c.habitId === habit.id);
    const goal = activeMonthlyGoals.find(g => g.id === habit.goalId);
    return <div key={habit.id}>
      {goal && <p className="text-caption2 text-label-alt mb-1">연결 목표 · {goal.title}</p>}
      <HabitEditCard habit={habit} weekRate={calcHabitWeeklyRate(habit, habitLogs, weekDays)}
        action={change?.action === 'add' ? 'keep' : change?.action ?? 'keep'} changes={change?.changes}
        onKeep={() => setHC(habit.id, 'keep')}
        onEdit={() => setHC(habit.id, 'edit', { title: habit.title, frequency: habit.frequency,
          customDays: habit.customDays ?? [], when: habit.when, miniRoutine: habit.miniRoutine ?? '', twoMinuteHabit: habit.twoMinuteHabit ?? '' })}
        onDelete={() => setHC(habit.id, 'delete')} onPatch={patch => patchHC(habit.id, patch)} />
    </div>;
  };
  const grouped = new Set(personalRoutines.flatMap(r => r.habitIds));
  const standalone = habits.filter(h => !grouped.has(h.id));
  return <div className="flex flex-col px-5 pt-6 pb-4 gap-5">
    <div><h2 className="text-title3 font-bold text-label-strong mb-1">루틴 점검</h2>
      </div>
    <p className="rounded-xl bg-primary-soft p-3 text-caption1 text-primary leading-relaxed">{applicationNotice}</p>
    {habitChanges.filter(c => c.action !== 'add' && c.action !== 'keep' && !habits.some(h => h.id === c.habitId)).map(c => <p key={c.habitId} className="rounded-xl bg-primary-soft p-3 text-body2">{c.title ?? '이전 습관'}의 원래 항목을 찾지 못했어요. 입력은 초안에 남아 있어요. <button className="min-h-11 font-bold text-primary" onClick={() => onHabitChangesUpdate(habitChanges.filter(h => h.habitId !== c.habitId))}>이 조정 취소</button></p>)}
    {routineChanges.filter(c => c.action !== 'add' && c.action !== 'keep' && !routines.some(r => r.id === c.routineId)).map(c => <p key={c.routineId} className="rounded-xl bg-primary-soft p-3 text-body2">{c.title ?? '이전 루틴'}의 원래 항목을 찾지 못했어요. 입력은 초안에 남아 있어요. <button className="min-h-11 font-bold text-primary" onClick={() => onRoutineChangesUpdate(routineChanges.filter(r => r.routineId !== c.routineId))}>이 조정 취소</button></p>)}
    <fieldset disabled={applied} className="flex flex-col gap-5 min-w-0">
      {personalRoutines.map(group => {
        const members = group.habitIds.flatMap(id => habits.find(h => h.id === id) ?? []);
        if (!members.length) return null;
        return <section key={group.id} aria-label={group.title} className="flex flex-col gap-2">
          <h3 className="text-body2 font-bold text-label-strong">{group.title} <span className="text-caption1 text-label-alt">· 루틴 묶음</span></h3>
          {members.map(card)}
        </section>;
      })}
      {standalone.length > 0 && <section aria-label="개별 습관" className="flex flex-col gap-2">
        <h3 className="text-body2 font-bold text-label-strong">개별 습관</h3>{standalone.map(card)}
      </section>}
      {!habits.length && <p className="text-body2 text-label-alt">아직 개인 습관이 없어요. 작은 습관 하나를 추가해보세요.</p>}
      {!applied && habitChanges.filter(c => c.action === 'add' && c.newHabit).map(c => <section key={c.habitId} aria-label="새 개인 습관" className="flex flex-col gap-2">
        <HabitEditCard habit={{ ...c.newHabit!, id: c.habitId, userId: '', createdAt: '' }} weekRate={0} action="add"
          onKeep={() => {}} onEdit={() => {}} onDelete={() => onHabitChangesUpdate(habitChanges.filter(h => h.habitId !== c.habitId))}
          onPatch={patch => onHabitChangesUpdate(habitChanges.map(h => h.habitId === c.habitId ? { ...h, newHabit: { ...h.newHabit!, ...patch } } : h))} />
        {personalRoutines.length > 0 && <label className="text-caption1 text-label-alt">추가할 위치
          <select aria-label="추가할 위치" value={c.personalRoutineId ?? ''} onChange={e => onHabitChangesUpdate(habitChanges.map(h => h.habitId === c.habitId ? { ...h, personalRoutineId: e.target.value || undefined } : h))}
            className="w-full mt-1 min-h-11 rounded-xl border border-line bg-surface px-3 text-body2 text-label">
            <option value="">개별 습관</option>{personalRoutines.map(r => <option key={r.id} value={r.id}>{r.title}</option>)}
          </select>
        </label>}
      </section>)}
      <button onClick={() => onHabitChangesUpdate([...habitChanges, { habitId: newId(), action: 'add', newHabit: { title: '', emoji: '🌱', frequency: 'daily', when: '' } }])}
        className="flex items-center justify-center gap-2 min-h-11 rounded-xl border border-primary/30 text-body2 font-bold text-primary">
        <Plus size={16} /> 새 개인 습관 추가
      </button>
      {routines.length > 0 && <section aria-label="신앙 루틴" className="flex flex-col gap-2">
        <h3 className="text-body2 font-bold text-label-strong">신앙 루틴</h3>
        {routines.map(r => {
          const c = routineChanges.find(c => c.routineId === r.id);
          return <RoutineEditCard key={r.id} label={c?.changes?.title ?? r.title} emoji={r.emoji}
            weekRate={calcRoutineWeeklyRate(r, routineLogs, weekDays)} action={c?.action ?? 'keep'} changes={c?.changes} original={r}
            onKeep={() => setRC(r.id, 'keep')} onEdit={() => setRC(r.id, 'edit', { title: r.title, frequency: r.frequency, when: r.when ?? '', twoMinuteHabit: r.twoMinuteHabit ?? '' })}
            onDelete={() => setRC(r.id, 'delete')}
            onPatch={patch => onRoutineChangesUpdate(routineChanges.map(x => x.routineId === r.id ? { ...x, changes: { ...x.changes, ...patch } } : x))} />;
        })}
      </section>}
    </fieldset>
  </div>;
}

// ── 루틴 수정 카드 ─────────────────────────────────────
function RoutineEditCard({
  label, emoji, weekRate, action, changes, original,
  onKeep, onEdit, onDelete, onPatch,
}: {
  label: string; emoji?: string; weekRate: number | null;
  action: RoutineChange['action'];
  changes?: RoutineChange['changes'];
  original: { title: string; frequency: DailyRoutine['frequency']; when?: string; twoMinuteHabit?: string; emoji?: string };
  onKeep: () => void; onEdit: () => void; onDelete: () => void;
  onPatch: (p: RoutineChange['changes']) => void;
}) {
  const isDelete = action === 'delete';
  const isEdit   = action === 'edit';
  const freq = changes?.frequency ?? original.frequency;

  return (
    <div className={`rounded-xl border p-3 transition-all ${isDelete ? 'border-red-200 bg-red-50' : 'border-line-soft bg-surface'}`}>
      <div className="flex items-center gap-2 mb-2">
        {emoji && <OnjuIcon emoji={emoji} size={24} />}
        <p className={`text-body2 font-medium flex-1 truncate ${isDelete ? 'text-red-400 line-through' : 'text-label-strong'}`}>{label}</p>
        <MiniBar rate={weekRate} />
      </div>
      <div className="flex gap-1.5">
        <ActionBtn active={action === 'keep'} onClick={onKeep}   label="유지" icon={<Check size={13}/>}  activeColor="bg-primary-soft text-primary" />
        <ActionBtn active={isEdit}            onClick={onEdit}   label="수정" icon={<Pencil size={13}/>} activeColor="bg-amber-100 text-amber-700" />
        <ActionBtn active={isDelete}          onClick={onDelete} label="보관" icon={<Trash2 size={13}/>} activeColor="bg-red-100 text-red-600" />
      </div>

      {isEdit && (
        <div className="mt-3 flex flex-col gap-3 pt-3 border-t border-line-soft">
          {/* 이름 */}
          <FieldGroup label="루틴 이름">
            <input aria-label="루틴 이름" value={changes?.title ?? original.title} onChange={e => onPatch({ title: e.target.value })}
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

          {Array.isArray(freq) && <div className="flex flex-col gap-1">
            <p className="text-caption2 text-label-alt">직접 선택한 요일</p>
            <div className="flex gap-1">{WEEKDAY_LABELS.map((label, day) => <button key={day} aria-label={`${label}요일`} aria-pressed={freq.includes(day)}
              onClick={() => onPatch({ frequency: freq.includes(day) ? freq.filter(d => d !== day) : [...freq, day] })}
              className={`flex-1 min-h-11 rounded-lg text-caption1 ${freq.includes(day) ? 'bg-primary text-white' : 'bg-fill text-label-alt'}`}>{label}</button>)}</div>
          </div>}
          {/* 언제 */}
          <FieldGroup label="언제 (선택)">
            <input aria-label="언제" value={changes?.when ?? original.when ?? ''} onChange={e => onPatch({ when: e.target.value })}
              placeholder="예: 기상 후, 점심 식사 전"
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>

          {/* 2분 트리거 */}
          <FieldGroup label={<span className="flex items-center gap-1"><Zap size={12} strokeWidth={1.9} /> 2분 트리거 (선택)</span>}>
            <input aria-label="2분 트리거" value={changes?.twoMinuteHabit ?? original.twoMinuteHabit ?? ''} onChange={e => onPatch({ twoMinuteHabit: e.target.value })}
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
  habit: Habit; weekRate: number | null;
  action: HabitChange['action'];
  changes?: HabitChange['changes'];
  onKeep: () => void; onEdit: () => void; onDelete: () => void;
  onPatch: (p: HabitChange['changes']) => void;
}) {
  const isDelete = action === 'delete';
  const isEdit = action === 'edit' || action === 'add';
  const freq     = changes?.frequency ?? habit.frequency;
  const days     = changes?.customDays ?? habit.customDays ?? [];

  const toggleDay = (dow: number) => {
    const next = days.includes(dow) ? days.filter(d => d !== dow) : [...days, dow];
    onPatch({ customDays: next });
  };

  return (
    <div className={`rounded-xl border p-3 transition-all ${isDelete ? 'border-red-200 bg-red-50' : 'border-line-soft bg-surface'}`}>
      <div className="flex items-center gap-2 mb-2">
        <OnjuIcon emoji={habit.emoji} size={24} />
        <p className={`text-body2 font-medium flex-1 truncate ${isDelete ? 'text-red-400 line-through' : 'text-label-strong'}`}>
          {(changes?.title ?? habit.title) || '새 개인 습관'}
        </p>
        {action !== 'add' && <MiniBar rate={weekRate} />}
      </div>
      {action === 'add' ? <button onClick={onDelete} className="min-h-11 text-caption1 text-label-alt">추가 취소</button> : <div className="flex gap-1.5">
        <ActionBtn active={action === 'keep'} onClick={onKeep}   label="유지" icon={<Check size={13}/>}  activeColor="bg-primary-soft text-primary" />
        <ActionBtn active={isEdit}            onClick={onEdit}   label="수정" icon={<Pencil size={13}/>} activeColor="bg-amber-100 text-amber-700" />
        <ActionBtn active={isDelete}          onClick={onDelete} label="보관" icon={<Trash2 size={13}/>} activeColor="bg-red-100 text-red-600" />
      </div>}

      {isEdit && (
        <div className="mt-3 flex flex-col gap-3 pt-3 border-t border-line-soft">
          {/* 이름 */}
          <FieldGroup label="습관 이름">
            <input aria-label="습관 이름" placeholder="새 습관 이름" value={changes?.title ?? habit.title} onChange={e => onPatch({ title: e.target.value })}
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>

          {/* 빈도 */}
          <FieldGroup label="반복 주기">
            <div className="grid grid-cols-2 gap-1.5">
              {HABIT_FREQ_OPTIONS.map(opt => (
                <button key={opt.value} aria-pressed={freq === opt.value} onClick={() => onPatch({ frequency: opt.value })}
                  className={`min-h-11 rounded-lg text-caption1 font-medium transition-colors ${freq === opt.value ? 'bg-primary-soft text-primary border border-primary/30' : 'bg-fill border border-line text-label-alt'}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {/* 요일 직접 선택 */}
            {freq === 'custom' && (
              <div className="flex gap-1 mt-2">
                {WEEKDAY_LABELS.map((lbl, dow) => (
                  <button key={dow} aria-label={`${lbl}요일`} aria-pressed={days.includes(dow)} onClick={() => toggleDay(dow)}
                    className={`flex-1 min-h-11 rounded-lg text-caption2 font-bold transition-colors ${days.includes(dow) ? 'bg-primary text-white' : 'bg-fill border border-line text-label-alt'}`}>
                    {lbl}
                  </button>
                ))}
              </div>
            )}
          </FieldGroup>

          {/* 언제 */}
          <FieldGroup label="언제">
            <input aria-label="언제" value={changes?.when ?? habit.when ?? ''} onChange={e => onPatch({ when: e.target.value })}
              placeholder="예: 기상 후, 점심 식사 전"
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>

          {/* 미니 습관 */}
          <FieldGroup label={<span className="flex items-center gap-1"><Flame size={12} strokeWidth={1.9} /> 미니 습관 (대체용)</span>}>
            <input aria-label="미니 습관" value={changes?.miniRoutine ?? habit.miniRoutine ?? ''} onChange={e => onPatch({ miniRoutine: e.target.value })}
              placeholder="예: 10분 걷기, 영상 1개"
              className="w-full border border-line rounded-xl px-3 py-2 text-body2 focus:outline-none focus:ring-2 focus:ring-primary" />
          </FieldGroup>

          {/* 2분 트리거 */}
          <FieldGroup label={<span className="flex items-center gap-1"><Zap size={12} strokeWidth={1.9} /> 2분 트리거</span>}>
            <input aria-label="2분 트리거" value={changes?.twoMinuteHabit ?? habit.twoMinuteHabit ?? ''} onChange={e => onPatch({ twoMinuteHabit: e.target.value })}
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
    <button aria-pressed={active} onClick={onClick} className={`flex items-center justify-center min-h-11 flex-1 gap-1 px-2.5 py-1 rounded-lg text-caption1 font-medium transition-colors ${active ? activeColor : 'bg-surface border border-line text-label-alt'}`}>
      {icon}{label}
    </button>
  );
}

// ── Step 4 ────────────────────────────────────────────
function ReviewIntentionStep({ applicationNotice, changedCount, intention, onIntentionChange, groups, shareToGroups, onToggleGroup }: {
  applicationNotice: string; changedCount: number;
  intention: string; onIntentionChange: (v: string) => void;
  groups: SmallGroup[]; shareToGroups: string[]; onToggleGroup: (id: string) => void;
}) {
  return (
    <div className="flex flex-col px-6 pt-6 pb-4">
      <h2 className="text-title3 font-bold text-label-strong mb-2">다음 주 다짐</h2>
      <div className="rounded-xl bg-primary-soft p-3 mb-4 text-caption1 text-primary leading-relaxed"><p className="font-bold mb-1">조정 {changedCount}건 · 완료 시 적용</p>{applicationNotice}</div>
      <p className="text-body2 text-label-alt mb-5">다음 주에 집중할 한 가지를 정해보세요.</p>

      <textarea value={intention} onChange={e => onIntentionChange(e.target.value)}
        placeholder="다음 주에 집중할 한 가지는..." rows={4}
        className="w-full border border-line rounded-2xl px-4 py-3 text-body2 resize-none focus:outline-none focus:ring-2 focus:ring-primary mb-6" />

      <p className="text-body2 font-semibold text-label mb-2">소모임 나눔</p>
      <p className="text-caption1 text-label-alt mb-3">선택한 소모임에 이번 주 소감과 다음 주 다짐을 공유해요.</p>
      {groups.length > 0 && <CommunityGate>
      <div className="flex flex-col gap-2">
        {groups.map(group => {
          const on = shareToGroups.includes(group.id);
          return (
            <div key={group.id} className="flex items-center gap-3 bg-surface-alt rounded-2xl px-4 py-3">
              <p className="text-body2 font-medium text-label-strong flex-1 truncate">{group.title}</p>
              <Switch checked={on} onCheckedChange={() => onToggleGroup(group.id)}
                label={`${group.title}에 회고 공유`} />
            </div>
          );
        })}
      </div>
      </CommunityGate>}
    </div>
  );
}
