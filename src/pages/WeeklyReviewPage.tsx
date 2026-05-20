import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Star, ChevronRight, Check, Plus, X, Pencil, ChevronLeft, Trash2 } from 'lucide-react';
import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { useRoutineStore } from '../store/routineStore';
import { useGoalStore } from '../store/goalStore';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { createReview, fetchReviews, createWeeklyShare } from '../api/reviews';
import { applyRoutineChanges } from '../utils/applyRoutineChanges';
import { getRoutineRecommendations } from '../utils/routineRecommendation';
import { calcCompletionRate } from '../utils/completion';
import { currentWeek, currentYear, getWeekRangeText, getCurrentWeekRange } from '../utils/date';
import { checkSlotUnlock } from '../utils/slots';
import Button from '../components/ui/Button';
import type { RoutineChange, DailyRoutine } from '../types';
import type { RoutineRecommendation } from '../utils/routineRecommendation';
import { mockGroups } from '../mocks/data/seed';

// ── 애니메이션 ─────────────────────────────────────────
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? '100%' : '-100%', opacity: 0 }),
};

type Frequency = 'daily' | 'weekdays' | 'weekends';
type Mood = 'hard' | 'normal' | 'easy';

const FREQ_LABELS: Record<Frequency, string> = {
  daily: '매일',
  weekdays: '평일',
  weekends: '주말',
};

// ── 메인 컴포넌트 ──────────────────────────────────────
export default function WeeklyReviewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const routineStore = useRoutineStore();
  const { weeklyGoals } = useGoalStore();
  const { user, updateWeeklySlots } = useAuthStore();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  // 주간 목표 (이번 주)
  const week = currentWeek();
  const year = currentYear();
  const thisWeekGoals = weeklyGoals.filter(
    (g) => g.weekNumber === week && g.year === year
  );

  // Step 1 계산값
  const { start, end } = getCurrentWeekRange();
  const personalRate = calcCompletionRate(
    routineStore.personalRoutines.filter((r) => r.isActive),
    routineStore.logs,
    start,
    end
  );
  const faithRate = calcCompletionRate(
    routineStore.faithRoutines.filter((r) => r.isActive),
    routineStore.logs,
    start,
    end
  );
  const goalAchievedCount = thisWeekGoals.filter((g) => g.completionRate >= 80).length;
  const goalTotalCount = thisWeekGoals.length;

  // Step 2 상태
  const [mood, setMood] = useState<Mood | null>(null);
  const [goalRatings, setGoalRatings] = useState<Record<string, 1 | 2 | 3 | 4 | 5>>({});
  const [comment, setComment] = useState('');

  // Step 3 상태
  const [routineChanges, setRoutineChanges] = useState<RoutineChange[]>(() =>
    [
      ...routineStore.personalRoutines.filter((r) => r.isActive),
      ...routineStore.faithRoutines.filter((r) => r.isActive),
    ].map((r) => ({ routineId: r.id, action: 'keep' as const }))
  );

  // Step 4 상태
  const [intention, setIntention] = useState('');
  const [shareToGroups, setShareToGroups] = useState<string[]>([]);

  // 과거 리뷰 (루틴 추천용)
  const { data: pastReviews = [] } = useQuery({
    queryKey: ['reviews'],
    queryFn: fetchReviews,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      // 1. 리뷰 생성
      await createReview({
        weekNumber: week,
        year,
        personalRate,
        faithRate,
        goalAchievedCount,
        goalTotalCount,
        mood,
        goalRatings,
        comment,
        intention,
        shareToGroups,
        routineChanges,
        completedAt: new Date().toISOString(),
      });

      // 2. 루틴 변경 적용
      applyRoutineChanges(routineChanges, routineStore, 'user-1');

      // 3. 소모임 나눔
      for (const groupId of shareToGroups) {
        await createWeeklyShare(groupId, {
          personalRate,
          faithRate,
          comment,
          intention,
        });
      }

      // 4. 목표 칸 추가 여부 확인
      const { shouldUnlock, newSlotCount } = checkSlotUnlock(
        thisWeekGoals,
        user?.weeklyGoalSlots ?? 3
      );
      if (shouldUnlock) {
        useUIStore.getState().setPendingUnlock(newSlotCount);
        updateWeeklySlots(newSlotCount);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews'] });
      navigate('/');
    },
  });

  const goNext = () => {
    setDir(1);
    setStep((s) => s + 1);
  };
  const goBack = () => {
    if (step === 0) {
      navigate(-1);
      return;
    }
    setDir(-1);
    setStep((s) => s - 1);
  };

  const allRoutines = [
    ...routineStore.personalRoutines.filter((r) => r.isActive),
    ...routineStore.faithRoutines.filter((r) => r.isActive),
  ];

  const recommendations = getRoutineRecommendations(
    allRoutines,
    routineStore.logs,
    pastReviews
  );

  const stepContents = [
    <ReviewSummaryStep
      weekRangeText={getWeekRangeText()}
      personalRate={personalRate}
      faithRate={faithRate}
      weeklyGoals={thisWeekGoals}
      goalAchievedCount={goalAchievedCount}
      goalTotalCount={goalTotalCount}
    />,
    <ReviewFeedbackStep
      mood={mood}
      onMoodChange={setMood}
      weeklyGoals={thisWeekGoals}
      goalRatings={goalRatings}
      onRatingChange={(goalId, rating) =>
        setGoalRatings((prev) => ({ ...prev, [goalId]: rating }))
      }
      comment={comment}
      onCommentChange={setComment}
    />,
    <ReviewImproveStep
      routines={allRoutines}
      recommendations={recommendations}
      changes={routineChanges}
      onChangesUpdate={setRoutineChanges}
    />,
    <ReviewIntentionStep
      intention={intention}
      onIntentionChange={setIntention}
      groups={mockGroups}
      shareToGroups={shareToGroups}
      onToggleGroup={(id) =>
        setShareToGroups((prev) =>
          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
        )
      }
    />,
  ];

  const isLastStep = step === 3;
  const canProceed = isLastStep ? intention.trim().length > 0 : true;

  return (
    <div className="min-h-dvh bg-white flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-4 pb-2 gap-3">
        <button
          onClick={goBack}
          className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500"
        >
          <ChevronLeft size={20} />
        </button>
        <span className="text-xs font-semibold text-indigo-500 ml-auto">
          {step + 1} / 4
        </span>
      </div>

      {/* 프로그레스 바 */}
      <div className="h-1 bg-gray-100 w-full">
        <motion.div
          className="h-full bg-indigo-500"
          animate={{ width: `${((step + 1) / 4) * 100}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* 스텝 콘텐츠 */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence initial={false} custom={dir} mode="wait">
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'tween', duration: 0.28 }}
            className="absolute inset-0 flex flex-col overflow-y-auto"
          >
            {stepContents[step]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 하단 버튼 */}
      <div className="px-6 pb-8 pt-4 flex gap-3 border-t border-gray-100 bg-white">
        {step > 0 && (
          <Button variant="ghost" onClick={goBack}>
            뒤로
          </Button>
        )}
        {isLastStep ? (
          <Button
            fullWidth
            disabled={!canProceed || submitMutation.isPending}
            onClick={() => submitMutation.mutate()}
          >
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

// ── Step 1: 주간 요약 ──────────────────────────────────
type WeeklyGoalItem = {
  id: string;
  title: string;
  completionRate: number;
};

function ReviewSummaryStep({
  weekRangeText,
  personalRate,
  faithRate,
  weeklyGoals,
  goalAchievedCount,
  goalTotalCount,
}: {
  weekRangeText: string;
  personalRate: number;
  faithRate: number;
  weeklyGoals: WeeklyGoalItem[];
  goalAchievedCount: number;
  goalTotalCount: number;
}) {
  return (
    <div className="flex flex-col px-6 pt-6 pb-4">
      <p className="text-xs text-gray-400 mb-1">{weekRangeText}</p>
      <h2 className="text-2xl font-bold text-gray-900 mb-6">이번 주 요약</h2>

      {/* 달성률 카드 */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-indigo-50 rounded-2xl p-4 flex flex-col items-center">
          <p className="text-xs font-medium text-indigo-400 mb-1">개인 루틴</p>
          <p className="text-4xl font-bold text-indigo-600">{personalRate}%</p>
        </div>
        <div className="bg-emerald-50 rounded-2xl p-4 flex flex-col items-center">
          <p className="text-xs font-medium text-emerald-400 mb-1">신앙 루틴</p>
          <p className="text-4xl font-bold text-emerald-600">{faithRate}%</p>
        </div>
      </div>

      {/* 주간 목표 */}
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-gray-700">주간 목표</p>
        <p className="text-xs text-gray-400">
          {goalAchievedCount} / {goalTotalCount} 달성
        </p>
      </div>

      {goalTotalCount === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">이번 주 목표가 없어요.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {weeklyGoals.map((goal) => {
            const low = goal.completionRate < 80;
            return (
              <div key={goal.id} className="bg-gray-50 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-sm text-gray-800 font-medium flex-1 mr-2 line-clamp-1">
                    {goal.title}
                  </p>
                  <p
                    className={`text-xs font-semibold ${
                      low ? 'text-red-500' : 'text-emerald-600'
                    }`}
                  >
                    {goal.completionRate}%
                  </p>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${low ? 'bg-red-400' : 'bg-emerald-400'}`}
                    style={{ width: `${goal.completionRate}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Step 2: 자기 피드백 ────────────────────────────────
const MOODS: { value: Mood; emoji: string; label: string }[] = [
  { value: 'hard', emoji: '😓', label: '힘들었어요' },
  { value: 'normal', emoji: '😊', label: '보통이었어요' },
  { value: 'easy', emoji: '😌', label: '여유로웠어요' },
];

function ReviewFeedbackStep({
  mood,
  onMoodChange,
  weeklyGoals,
  goalRatings,
  onRatingChange,
  comment,
  onCommentChange,
}: {
  mood: Mood | null;
  onMoodChange: (m: Mood) => void;
  weeklyGoals: WeeklyGoalItem[];
  goalRatings: Record<string, 1 | 2 | 3 | 4 | 5>;
  onRatingChange: (goalId: string, rating: 1 | 2 | 3 | 4 | 5) => void;
  comment: string;
  onCommentChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col px-6 pt-6 pb-4">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">자기 피드백</h2>

      {/* 기분 선택 */}
      <p className="text-sm font-semibold text-gray-700 mb-3">이번 주 어땠나요?</p>
      <div className="grid grid-cols-3 gap-2 mb-6">
        {MOODS.map((m) => (
          <button
            key={m.value}
            onClick={() => onMoodChange(m.value)}
            className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border-2 transition-all ${
              mood === m.value
                ? 'border-indigo-400 bg-indigo-50'
                : 'border-gray-100 bg-white'
            }`}
          >
            <span className="text-2xl">{m.emoji}</span>
            <span className="text-xs font-medium text-gray-700">{m.label}</span>
          </button>
        ))}
      </div>

      {/* 목표별 별점 */}
      {weeklyGoals.length > 0 && (
        <>
          <p className="text-sm font-semibold text-gray-700 mb-3">목표별 만족도</p>
          <div className="flex flex-col gap-3 mb-6">
            {weeklyGoals.map((goal) => (
              <div key={goal.id} className="bg-gray-50 rounded-xl px-3 py-3">
                <p className="text-sm text-gray-700 mb-2 line-clamp-1">{goal.title}</p>
                <StarRating
                  value={goalRatings[goal.id] ?? 0}
                  onChange={(r) => onRatingChange(goal.id, r)}
                />
              </div>
            ))}
          </div>
        </>
      )}

      {/* 한 줄 소감 */}
      <p className="text-sm font-semibold text-gray-700 mb-2">한 줄 소감</p>
      <textarea
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        placeholder="이번 주 한 줄 소감을 남겨보세요..."
        rows={3}
        className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300"
      />
    </div>
  );
}

function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}
          className="p-0.5"
        >
          <Star
            size={22}
            className={n <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}
          />
        </button>
      ))}
    </div>
  );
}

// ── Step 3: 루틴 개선 ──────────────────────────────────
function ReviewImproveStep({
  routines,
  recommendations,
  changes,
  onChangesUpdate,
}: {
  routines: DailyRoutine[];
  recommendations: RoutineRecommendation[];
  changes: RoutineChange[];
  onChangesUpdate: (changes: RoutineChange[]) => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [newFreq, setNewFreq] = useState<Frequency>('daily');
  const [showAddForm, setShowAddForm] = useState(false);

  const getChange = (routineId: string) =>
    changes.find((c) => c.routineId === routineId);

  const setAction = (
    routineId: string,
    action: 'keep' | 'edit' | 'delete',
    editData?: { title?: string; frequency?: DailyRoutine['frequency'] }
  ) => {
    onChangesUpdate(
      changes.map((c) =>
        c.routineId === routineId
          ? { ...c, action, changes: action === 'edit' ? editData : undefined }
          : c
      )
    );
  };

  const updateEditData = (
    routineId: string,
    patch: { title?: string; frequency?: DailyRoutine['frequency'] }
  ) => {
    onChangesUpdate(
      changes.map((c) =>
        c.routineId === routineId
          ? { ...c, changes: { ...c.changes, ...patch } }
          : c
      )
    );
  };

  const addNewRoutine = () => {
    if (!newTitle.trim()) return;
    const newChange: RoutineChange = {
      routineId: `new-${Date.now()}`,
      action: 'add',
      newRoutine: {
        title: newTitle.trim(),
        type: 'personal',
        frequency: newFreq,
        isActive: true,
        order: 999,
      },
    };
    onChangesUpdate([...changes, newChange]);
    setNewTitle('');
    setNewFreq('daily');
    setShowAddForm(false);
  };

  return (
    <div className="flex flex-col px-6 pt-6 pb-4">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">루틴 개선</h2>
      <p className="text-sm text-gray-400 mb-5">다음 주 루틴을 조정해 보세요.</p>

      <div className="flex flex-col gap-3 mb-4">
        {routines.map((routine) => {
          const change = getChange(routine.id);
          const action = change?.action ?? 'keep';
          const rec = recommendations.find((r) => r.routineId === routine.id);

          return (
            <div
              key={routine.id}
              className={`rounded-2xl border p-3 transition-all ${
                action === 'delete'
                  ? 'border-red-200 bg-red-50'
                  : 'border-gray-100 bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p
                  className={`text-sm font-medium ${
                    action === 'delete' ? 'text-red-400 line-through' : 'text-gray-800'
                  }`}
                >
                  {routine.title}
                </p>
                <span className="text-xs text-gray-400 ml-2 shrink-0">
                  {routine.type === 'personal' ? '개인' : '신앙'}
                </span>
              </div>

              {rec && (
                <p className="text-xs text-indigo-500 mb-2">{rec.message}</p>
              )}

              {/* 액션 버튼 */}
              <div className="flex gap-1.5 mb-2">
                <ActionButton
                  active={action === 'keep'}
                  onClick={() => setAction(routine.id, 'keep')}
                  label="유지"
                  icon={<Check size={13} />}
                  activeColor="bg-indigo-100 text-indigo-700"
                />
                <ActionButton
                  active={action === 'edit'}
                  onClick={() => setAction(routine.id, 'edit', { title: routine.title, frequency: routine.frequency as Frequency })}
                  label="수정"
                  icon={<Pencil size={13} />}
                  activeColor="bg-amber-100 text-amber-700"
                />
                <ActionButton
                  active={action === 'delete'}
                  onClick={() => setAction(routine.id, 'delete')}
                  label="삭제"
                  icon={<Trash2 size={13} />}
                  activeColor="bg-red-100 text-red-600"
                />
              </div>

              {/* 수정 인라인 폼 */}
              {action === 'edit' && (
                <div className="mt-2 flex flex-col gap-2">
                  <input
                    type="text"
                    value={change?.changes?.title ?? routine.title}
                    onChange={(e) =>
                      updateEditData(routine.id, { title: e.target.value })
                    }
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  />
                  <div className="flex gap-1.5">
                    {(['daily', 'weekdays', 'weekends'] as Frequency[]).map((f) => {
                      const currentFreq =
                        (change?.changes?.frequency as Frequency) ??
                        (routine.frequency as Frequency);
                      return (
                        <button
                          key={f}
                          onClick={() => updateEditData(routine.id, { frequency: f })}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                            currentFreq === f
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-white border border-gray-200 text-gray-500'
                          }`}
                        >
                          {FREQ_LABELS[f]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 새 루틴 추가 */}
      {showAddForm ? (
        <div className="border border-indigo-200 bg-indigo-50 rounded-2xl p-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addNewRoutine()}
              placeholder="새 루틴 이름"
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 bg-white"
              autoFocus
            />
            <button
              onClick={() => setShowAddForm(false)}
              className="text-gray-400 px-1"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex gap-1.5">
            {(['daily', 'weekdays', 'weekends'] as Frequency[]).map((f) => (
              <button
                key={f}
                onClick={() => setNewFreq(f)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  newFreq === f
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-white border border-gray-200 text-gray-500'
                }`}
              >
                {FREQ_LABELS[f]}
              </button>
            ))}
          </div>
          <Button size="sm" fullWidth onClick={addNewRoutine} disabled={!newTitle.trim()}>
            추가
          </Button>
        </div>
      ) : (
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-1.5 text-sm font-medium text-indigo-600 py-2 px-1"
        >
          <Plus size={16} />
          새 루틴 추가
        </button>
      )}

      {/* 추가될 루틴 목록 */}
      {changes
        .filter((c) => c.action === 'add' && c.newRoutine)
        .map((c) => (
          <div
            key={c.routineId}
            className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2.5 mt-2"
          >
            <Plus size={13} className="text-indigo-400 shrink-0" />
            <span className="flex-1 text-sm text-gray-800">{c.newRoutine!.title}</span>
            <span className="text-xs text-indigo-400">
              {FREQ_LABELS[c.newRoutine!.frequency as Frequency]}
            </span>
            <button
              onClick={() =>
                onChangesUpdate(changes.filter((x) => x.routineId !== c.routineId))
              }
              className="text-gray-400 ml-1"
            >
              <X size={14} />
            </button>
          </div>
        ))}
    </div>
  );
}

function ActionButton({
  active,
  onClick,
  label,
  icon,
  activeColor,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: ReactNode;
  activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
        active ? activeColor : 'bg-white border border-gray-200 text-gray-500'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Step 4: 다음 주 의도 ───────────────────────────────
function ReviewIntentionStep({
  intention,
  onIntentionChange,
  groups,
  shareToGroups,
  onToggleGroup,
}: {
  intention: string;
  onIntentionChange: (v: string) => void;
  groups: typeof mockGroups;
  shareToGroups: string[];
  onToggleGroup: (id: string) => void;
}) {
  return (
    <div className="flex flex-col px-6 pt-6 pb-4">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">다음 주 의도</h2>
      <p className="text-sm text-gray-400 mb-5">한 가지 집중할 것을 정해보세요.</p>

      <textarea
        value={intention}
        onChange={(e) => onIntentionChange(e.target.value)}
        placeholder="다음 주에 집중할 한 가지는..."
        rows={4}
        className="w-full border border-gray-200 rounded-2xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-6"
      />

      {/* 소모임 나눔 */}
      <p className="text-sm font-semibold text-gray-700 mb-3">소모임 나눔</p>
      <p className="text-xs text-gray-400 mb-3">
        선택한 소모임에 이번 주 소감과 다음 주 의도를 공유해요.
      </p>
      <div className="flex flex-col gap-2">
        {groups.map((group) => {
          const on = shareToGroups.includes(group.id);
          return (
            <div
              key={group.id}
              className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{group.title}</p>
              </div>
              {/* 토글 스위치 */}
              <button
                onClick={() => onToggleGroup(group.id)}
                className={`w-11 h-6 rounded-full transition-colors shrink-0 relative ${
                  on ? 'bg-indigo-500' : 'bg-gray-200'
                }`}
              >
                <motion.div
                  className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow"
                  animate={{ left: on ? '1.375rem' : '0.125rem' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
