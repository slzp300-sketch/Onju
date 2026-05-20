import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Plus, X, Check } from 'lucide-react';
import Button from '../components/ui/Button';
import { useAuthStore } from '../store/authStore';
import { useGoalStore } from '../store/goalStore';
import { useRoutineStore } from '../store/routineStore';
import { faithRoutineTemplates } from '../mocks/data/faithTemplates';
import { mockGroups } from '../mocks/data/seed';
import type { DailyRoutine, MonthlyGoal } from '../types';

type Frequency = 'daily' | 'weekdays' | 'weekends';

interface TempRoutine {
  title: string;
  frequency: Frequency;
}

const FREQ_LABELS: Record<Frequency, string> = {
  daily: '매일',
  weekdays: '평일',
  weekends: '주말',
};

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? '100%' : '-100%', opacity: 0 }),
};

export default function Onboarding() {
  const navigate = useNavigate();
  const { setOnboardingDone } = useAuthStore();
  const { setMonthlyGoals } = useGoalStore();
  const { setRoutines: commitRoutines } = useRoutineStore();

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);

  // Step 1
  const [monthlyGoalTitle, setMonthlyGoalTitle] = useState('');
  // Step 2
  const [routines, setRoutines] = useState<TempRoutine[]>([]);
  const [routineInput, setRoutineInput] = useState('');
  const [routineFreq, setRoutineFreq] = useState<Frequency>('daily');
  // Step 3
  const defaultFaithIds = ['ft-1', 'ft-2'];
  const [selectedFaithIds, setSelectedFaithIds] = useState<string[]>(defaultFaithIds);

  const goNext = () => { setDir(1); setStep(s => s + 1); };
  const goBack = () => { setDir(-1); setStep(s => s - 1); };

  const addRoutineItem = () => {
    if (!routineInput.trim()) return;
    setRoutines(r => [...r, { title: routineInput.trim(), frequency: routineFreq }]);
    setRoutineInput('');
    setRoutineFreq('daily');
  };

  const removeRoutine = (i: number) => setRoutines(r => r.filter((_, idx) => idx !== i));

  const toggleFaith = (id: string) => {
    setSelectedFaithIds(ids =>
      ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]
    );
  };

  const finish = () => {
    const today = new Date();
    // 월간 목표 저장
    if (monthlyGoalTitle.trim()) {
      const goal: MonthlyGoal = {
        id: `mg-ob-${Date.now()}`,
        userId: 'user-1',
        title: monthlyGoalTitle.trim(),
        month: today.getMonth() + 1,
        year: today.getFullYear(),
        status: 'active',
        createdAt: today.toISOString(),
      };
      setMonthlyGoals([goal]);
    }
    const ts = Date.now();
    const personalToSave: DailyRoutine[] = routines.map((r, i) => ({
      id: `pr-ob-${ts}-${i}`,
      userId: 'user-1',
      title: r.title,
      type: 'personal',
      frequency: r.frequency,
      isActive: true,
      order: i,
      createdAt: today.toISOString(),
    }));
    const faithToSave: DailyRoutine[] = faithRoutineTemplates
      .filter(t => selectedFaithIds.includes(t.id))
      .map((t, i) => ({
        id: `fr-ob-${ts}-${i}`,
        userId: 'user-1',
        title: t.title,
        type: 'faith' as const,
        frequency: 'daily' as const,
        isActive: true,
        order: i,
        createdAt: today.toISOString(),
      }));
    commitRoutines(personalToSave, faithToSave);

    setOnboardingDone();
    navigate('/');
  };

  const steps = [
    <Step1
      value={monthlyGoalTitle}
      onChange={setMonthlyGoalTitle}
      onNext={goNext}
      onSkip={goNext}
    />,
    <Step2
      routines={routines}
      input={routineInput}
      freq={routineFreq}
      onInputChange={setRoutineInput}
      onFreqChange={setRoutineFreq}
      onAdd={addRoutineItem}
      onRemove={removeRoutine}
      onNext={goNext}
      onBack={goBack}
    />,
    <Step3
      selectedIds={selectedFaithIds}
      onToggle={toggleFaith}
      onNext={goNext}
      onBack={goBack}
    />,
    <Step4
      groups={mockGroups.slice(0, 3)}
      onFinish={finish}
      onSkip={finish}
      onBack={goBack}
    />,
  ];

  return (
    <div className="min-h-dvh bg-white flex flex-col">
      {/* 상단 바 */}
      <div className="flex items-center justify-end px-4 pt-3 pb-1">
        <button onClick={finish} className="text-sm text-gray-400 py-1">
          건너뛰기
        </button>
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
            className="absolute inset-0 flex flex-col"
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ── Step 1: 월간 목표 ─────────────────────────────── */
function Step1({ value, onChange, onNext, onSkip }: {
  value: string;
  onChange: (v: string) => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="flex flex-col px-6 pt-12 pb-8 h-full">
      <p className="text-xs font-semibold text-indigo-500 mb-2">1 / 4</p>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">이번 달 목표가 뭔가요?</h2>
      <p className="text-sm text-gray-400 mb-8">월간 목표를 중심으로 주간 루틴을 연결할 수 있어요.</p>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && onNext()}
        placeholder="예) 직장에서 선한 영향력 실천하기"
        className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        autoFocus
      />
      <div className="flex-1" />
      <div className="flex flex-col gap-3">
        <Button fullWidth onClick={onNext}>
          다음 <ChevronRight size={16} className="inline" />
        </Button>
        <button onClick={onSkip} className="text-sm text-gray-400 text-center py-1">
          지금 건너뛰기
        </button>
      </div>
    </div>
  );
}

/* ── Step 2: 개인 루틴 ─────────────────────────────── */
function Step2({ routines, input, freq, onInputChange, onFreqChange, onAdd, onRemove, onNext, onBack }: {
  routines: TempRoutine[];
  input: string;
  freq: Frequency;
  onInputChange: (v: string) => void;
  onFreqChange: (v: Frequency) => void;
  onAdd: () => void;
  onRemove: (i: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col px-6 pt-12 pb-8 h-full">
      <p className="text-xs font-semibold text-indigo-500 mb-2">2 / 4</p>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">개인 루틴 설정</h2>
      <p className="text-sm text-gray-400 mb-6">매일 실천할 루틴을 1개 이상 추가해 주세요.</p>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={input}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onAdd()}
          placeholder="루틴 이름"
          className="flex-1 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button
          onClick={onAdd}
          disabled={!input.trim()}
          className="px-3 py-2.5 rounded-xl bg-indigo-500 text-white disabled:opacity-40"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {(['daily', 'weekdays', 'weekends'] as Frequency[]).map(f => (
          <button
            key={f}
            onClick={() => onFreqChange(f)}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              freq === f ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'
            }`}
          >
            {FREQ_LABELS[f]}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto flex-1 min-h-0">
        {routines.map((r, i) => (
          <div key={i} className="flex items-center gap-2 bg-indigo-50 rounded-xl px-3 py-2.5">
            <span className="flex-1 text-sm text-gray-800">{r.title}</span>
            <span className="text-xs text-indigo-400">{FREQ_LABELS[r.frequency]}</span>
            <button onClick={() => onRemove(i)} className="text-gray-400 ml-1">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-4">
        <Button variant="ghost" onClick={onBack}>뒤로</Button>
        <Button fullWidth onClick={onNext} disabled={routines.length === 0}>
          다음 <ChevronRight size={16} className="inline" />
        </Button>
      </div>
    </div>
  );
}

/* ── Step 3: 신앙 루틴 ─────────────────────────────── */
function Step3({ selectedIds, onToggle, onNext, onBack }: {
  selectedIds: string[];
  onToggle: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col px-6 pt-12 pb-8 h-full">
      <p className="text-xs font-semibold text-emerald-500 mb-2">3 / 4</p>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">신앙 루틴 선택</h2>
      <p className="text-sm text-gray-400 mb-6">기도와 말씀은 기본으로 선택되어 있어요.</p>

      <div className="grid grid-cols-2 gap-2 overflow-y-auto flex-1 min-h-0">
        {faithRoutineTemplates.map(t => {
          const selected = selectedIds.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => onToggle(t.id)}
              className={`relative flex flex-col gap-1 p-3 rounded-2xl border-2 text-left transition-all ${
                selected
                  ? 'border-emerald-400 bg-emerald-50'
                  : 'border-gray-100 bg-white'
              }`}
            >
              {selected && (
                <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Check size={12} strokeWidth={3} className="text-white" />
                </div>
              )}
              <span className="text-sm font-semibold text-gray-900">{t.title}</span>
              <span className="text-xs text-gray-400 leading-relaxed">{t.description}</span>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3 mt-4">
        <Button variant="ghost" onClick={onBack}>뒤로</Button>
        <Button fullWidth onClick={onNext}>
          다음 <ChevronRight size={16} className="inline" />
        </Button>
      </div>
    </div>
  );
}

/* ── Step 4: 소모임 탐색 ───────────────────────────── */
function Step4({ groups, onFinish, onSkip, onBack }: {
  groups: typeof mockGroups;
  onFinish: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col px-6 pt-12 pb-8 h-full">
      <p className="text-xs font-semibold text-indigo-500 mb-2">4 / 4</p>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">소모임도 둘러보세요</h2>
      <p className="text-sm text-gray-400 mb-6">함께하면 더 잘 지킬 수 있어요.</p>

      <div className="flex flex-col gap-3 flex-1 overflow-y-auto min-h-0">
        {groups.map(g => (
          <div key={g.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100">
            <p className="text-sm font-semibold text-gray-900 mb-1">{g.title}</p>
            <p className="text-xs text-gray-500 line-clamp-2">{g.goal}</p>
            <p className="text-xs text-gray-400 mt-2">{g.currentMemberCount}/{g.maxMembers}명 참여 중</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 mt-4">
        <Button fullWidth onClick={onFinish}>소모임 둘러보기</Button>
        <div className="flex gap-3">
          <Button variant="ghost" onClick={onBack}>뒤로</Button>
          <button onClick={onSkip} className="flex-1 text-sm text-gray-400 text-center py-1">
            나중에 할게요
          </button>
        </div>
      </div>
    </div>
  );
}
