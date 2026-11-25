import { useLocalDraft } from '../hooks/useLocalDraft';
import { isGoalDraft } from '../utils/formDrafts';
import FormBoundary from '../components/FormBoundary';
import { useFormProtection } from '../hooks/useFormProtection';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Check, Star, Lightbulb, Calendar, Dumbbell, Flame, Zap, Palette, BookOpen } from '../icons';
import { motion } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { useGoalStore } from '../store/goalStore';
import type { GoalRoutineItem, MonthlyGoal } from '../types';
import { newId } from '../utils/id';
import Switch from '../components/ui/Switch';
import { goalPeriodError } from '../utils/goalRules';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { useLocalNow } from '../hooks/useLocalNow';
import GoalEditImpact from '../components/goals/GoalEditImpact';
import OverlayDialog from '../components/ui/OverlayDialog';
import Button from '../components/ui/Button';
import { toast } from '../store/toastStore';
import { useAuthStore } from '../store/authStore';
import { readDraft } from '../lib/localDrafts';
import { useGoalDeletionIds } from '../hooks/useGoalDeletionIds';

const tapSm = { whileTap: { scale: 0.92 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };

const todayStr   = () => format(new Date(), 'yyyy-MM-dd');
const defaultEnd = () => format(addDays(new Date(), 29), 'yyyy-MM-dd');

const inputCls = 'form-paper-field w-full px-4 py-3 text-body2 font-medium placeholder:text-label-assistive';

const COLORS = [
  '#6366f1', '#ef4444', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#84cc16', '#06b6d4', '#64748b',
];

export default function MonthlyGoalNew() {
  const { id } = useParams<{ id?: string }>();
  const owner = useAuthStore(s => s.user?.id);
  const exists = useGoalStore(s => s.monthlyGoals.some(item => item.id === id));
  let fallback: MonthlyGoal | undefined;
  if (id && owner && !exists) {
    try {
      const saved = readDraft(owner, `monthly-goal:${id}`, isGoalDraft)?.values;
      if (saved) fallback = saved.baseGoal?.id === id ? saved.baseGoal : { id, userId: '', title: saved.toBeStatement,
        toBeStatement: saved.toBeStatement, startDate: saved.startDate, endDate: saved.endDate,
        month: Number(saved.startDate.slice(5, 7)), year: Number(saved.startDate.slice(0, 4)),
        status: 'active', createdAt: new Date().toISOString(), category: saved.category };
    } catch { /* The draft hook shows storage errors when an existing form is available. */ }
  }
  return <FormBoundary id={id} exists={exists || !!fallback}><MonthlyGoalNewEditor fallback={fallback} /></FormBoundary>;
}

function MonthlyGoalNewEditor({ fallback }: { fallback?: MonthlyGoal }) {
  useLocalNow();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { monthlyGoals, addMonthlyGoal, updateMonthlyGoal } = useGoalStore();
  const deletionPending = useGoalDeletionIds().includes(id ?? '');

  const existing = id ? monthlyGoals.find(g => g.id === id) ?? fallback : null;
  const isEdit = !!existing;
  const existingHabit = existing?.goalRoutines?.[0];
  const [baseGoal, setBaseGoal] = useState(existing ?? undefined);

  const [toBeStatement, setToBeStatement] = useState(existing?.toBeStatement ?? existing?.title ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayStr());
  const [endDate, setEndDate]     = useState(existing?.endDate ?? defaultEnd());
  const [habitTitle, setHabitTitle]         = useState(existingHabit?.title ?? '');
  const [habitWhen, setHabitWhen]           = useState(existingHabit?.when ?? '');
  const [habitWhere, setHabitWhere]         = useState(existingHabit?.where ?? '');
  const [miniHabit, setMiniHabit]           = useState(existingHabit?.miniRoutine ?? '');
  const [twoMinuteHabit, setTwoMinuteHabit] = useState(existingHabit?.twoMinuteHabit ?? '');
  const [category, setCategory] = useState<'personal' | 'faith'>(existing?.category ?? 'personal');
  const [colorEnabled, setColorEnabled] = useState(!!existing?.color);
  const [selectedColor, setSelectedColor] = useState<string>(existing?.color ?? '');

  const [entityId, setEntityId] = useState<string>(newId);
  const [coreHabitId, setCoreHabitId] = useState(() => existingHabit?.id ?? newId());
  const draftValues = { baseGoal, entityId, coreHabitId, toBeStatement, startDate, endDate, habitTitle, habitWhen, habitWhere, miniHabit, twoMinuteHabit, category, colorEnabled, selectedColor };
  const draft = useLocalDraft({ document: `monthly-goal:${id ?? 'new'}`, values: draftValues, validate: isGoalDraft, restore: v => {
    // 구버전 초안은 기준 버전을 알 수 없으므로 서버 비교를 거치게 한다.
    setBaseGoal(v.baseGoal?.id === id ? v.baseGoal : existing ? { ...existing, revision: undefined } : undefined);
    setEntityId(v.entityId); setCoreHabitId(v.coreHabitId); setToBeStatement(v.toBeStatement); setStartDate(v.startDate); setEndDate(v.endDate);
    setHabitTitle(v.habitTitle); setHabitWhen(v.habitWhen); setHabitWhere(v.habitWhere); setMiniHabit(v.miniHabit); setTwoMinuteHabit(v.twoMinuteHabit);
    setCategory(v.category); setColorEnabled(v.colorEnabled); setSelectedColor(v.selectedColor);
  } });
  const protection = useFormProtection(draftValues, draft.leaveMessage);
  const leave = () => { if (window.history.state?.idx > 0) navigate(-1); else navigate('/'); };

  const dateError = goalPeriodError(startDate, endDate);
  const canSave = toBeStatement.trim().length > 0 && !dateError && !deletionPending;
  const { habits, habitLogs } = useHabitStore();
  const { faithRoutines, logs } = useRoutineStore();
  const [reviewed, setReviewed] = useState<string>();
  const changedScope = existing && (existing.startDate !== startDate || existing.endDate !== endDate || (existing.category ?? 'personal') !== category);
  const proposed = existing ? { ...existing, startDate, endDate, category } : undefined;
  const revision = JSON.stringify({ existing, draftValues, habits, habitLogs, faithRoutines, logs, date: todayStr() });

  const handleSave = (confirmed = false) => {
    if (draft.awaitingChoice || !canSave) return;
    if (changedScope && !confirmed) { setReviewed(revision); return; }
    if (confirmed && reviewed !== revision) { toast.error('목표나 기록이 바뀌었어요. 변경 영향을 다시 확인해주세요.'); return; }

    const habit: GoalRoutineItem | undefined = habitTitle.trim() ? {
      id: coreHabitId,
      title: habitTitle.trim(),
      when: habitWhen.trim() || undefined,
      where: habitWhere.trim() || undefined,
      miniRoutine: miniHabit.trim() || undefined,
      twoMinuteHabit: twoMinuteHabit.trim() || undefined,
    } : undefined;

    const color = colorEnabled && selectedColor ? selectedColor : undefined;

    if (!protection.save(() => {
      if (isEdit && existing) {
        updateMonthlyGoal(existing.id, {
          title: toBeStatement.trim(),
          month: Number(startDate.slice(5, 7)),
          year: Number(startDate.slice(0, 4)),
          startDate,
          endDate,
          toBeStatement: toBeStatement.trim(),
          goalRoutines: [ ...(habit ? [habit] : []), ...(baseGoal?.goalRoutines?.slice(1) ?? []) ],
          color,
          category,
        }, baseGoal);
      } else {
        const newGoal: MonthlyGoal = {
          id: entityId,
          userId: '',
          title: toBeStatement.trim(),
          month: Number(startDate.slice(5, 7)),
          year: Number(startDate.slice(0, 4)),
          startDate,
          endDate,
          status: 'active',
          createdAt: new Date().toISOString(),
          toBeStatement: toBeStatement.trim(),
          goalRoutines: habit ? [habit] : undefined,
          color,
          category,
        };
        addMonthlyGoal(newGoal);
      }
      draft.clear();
    })) return;
    navigate(isEdit ? '/goals' : `/goals/${entityId}/connect`, { replace: true });
  };

  return (
    <div className="form-paper min-h-dvh flex flex-col">
      {protection.guard}
      {deletionPending && <p role="status" className="p-4 text-body2 bg-primary-soft">이 목표의 삭제 결과를 확인하고 있어요. 작성 내용은 초안으로 보관하며, 삭제 요청을 해결한 뒤 저장할 수 있어요.</p>}
      {fallback && <p role="status" className="p-4 text-body2 bg-primary-soft">목표가 목록에서 사라졌지만 이 기기의 입력은 남아 있어요. 복원 후 저장하면 서버 상태를 확인하고, 삭제된 목표는 충돌 복구 화면에서 새 목표로 복사할 수 있어요.</p>}
      <OverlayDialog isOpen={reviewed !== undefined} onClose={() => setReviewed(undefined)} labelledBy="goal-edit-confirm-title" className="p-4">
        <h2 id="goal-edit-confirm-title" className="text-headline1 font-bold mb-3">분류·기간 변경을 적용할까요?</h2>
        {existing && proposed && <GoalEditImpact before={existing} after={proposed} />}
        {reviewed !== undefined && reviewed !== revision && <p role="alert" className="mt-3 text-body2 text-negative">확인 중 목표나 기록이 바뀌었어요. 취소한 뒤 변경 영향을 다시 확인해주세요.</p>}
        <div className="mt-4 flex gap-2">
          <Button size="md" variant="assistive" className="flex-1 px-2" onClick={() => setReviewed(undefined)}>취소</Button>
          <Button size="md" className="flex-1 px-2 whitespace-nowrap" disabled={reviewed !== revision || !canSave} onClick={() => handleSave(true)}>확인하고 저장</Button>
        </div>
      </OverlayDialog>
      {/* 헤더 */}
      <div className="form-paper-header flex items-center px-4 pt-5 pb-3 flex-shrink-0">
        <motion.button {...tapSm} onClick={() => protection.requestLeave(leave)} aria-label="뒤로 가기" className="paper-back-button text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">
          {isEdit ? '목표 수정하기' : '목표 추가하기'}
        </h1>
        <div className="w-8" />
      </div>

      <div className="px-4 pt-3">{draft.banner}</div>
      <fieldset disabled={draft.awaitingChoice} className="contents">
      {/* 스크롤 콘텐츠 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 flex flex-col gap-5 pb-28">

          {/* ── 카테고리 선택 ── */}
          <div className="bg-surface rounded-xl border border-line">
            <div className="px-4 py-4">
              <p className="text-body2 font-bold text-label-strong mb-3">목표 유형</p>
              <div className="flex gap-3">
                {([
                  { value: 'personal', label: '개인', Icon: Dumbbell, desc: '개인 습관·루틴 목표' },
                  { value: 'faith',    label: '신앙', Icon: BookOpen, desc: '신앙 루틴 목표' },
                ] as const).map(opt => (
                  <motion.button
                    key={opt.value}
                    aria-pressed={category === opt.value}
                    aria-label={`${opt.label} 목표`}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setCategory(opt.value)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl border-2 transition-all ${
                      category === opt.value
                        ? 'border-primary bg-primary-soft'
                        : 'border-line bg-fill'
                    }`}
                  >
                    <opt.Icon size={24} strokeWidth={1.9} className={category === opt.value ? 'text-primary' : 'text-label-alt'} />
                    <p className={`text-body2 font-bold ${category === opt.value ? 'text-primary' : 'text-label-alt'}`}>
                      {opt.label}
                    </p>
                    <p className={`text-caption2 ${category === opt.value ? 'text-primary/70' : 'text-label-assistive'}`}>
                      {opt.desc}
                    </p>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* ── To-Be 선언 ── */}
          <div className="bg-surface rounded-xl border border-line">
            <div className="px-4 py-4 border-b border-line-soft">
              <p className="text-body2 font-bold text-label-strong mb-0.5 flex items-center gap-1.5"><Star size={15} strokeWidth={1.9} /> 이루고 싶은 목표</p>
            </div>
            <div className="px-4 py-4">
              <textarea
                aria-label="되고 싶은 모습"
                value={toBeStatement}
                onChange={e => setToBeStatement(e.target.value)}
                placeholder="두 발로 꾸준히 달리며 체력과 의지를 쌓아가는 사람"
                rows={3}
                autoFocus
                className="form-paper-field w-full px-4 py-3 text-body2 font-medium resize-none placeholder:text-label-assistive leading-relaxed"
              />
              <p className="text-caption2 text-label-assistive mt-1.5 flex items-center gap-1.5">
                <Lightbulb size={13} strokeWidth={1.9} className="flex-shrink-0" /> 내가 되고 싶은 모습을 구체적인 문장으로 적어주세요
              </p>
            </div>
          </div>

          {/* ── 목표 기간 ── */}
          <div className="bg-surface rounded-xl border border-line">
            <div className="px-4 py-4 border-b border-line-soft">
              <p className="text-body2 font-bold text-label-strong flex items-center gap-1.5"><Calendar size={15} strokeWidth={1.9} /> 목표 기간</p>
            </div>
            <div className="px-4 py-4 grid gap-3">
              <label className="text-caption1 text-label-alt">시작일
                <input type="date" aria-label="목표 시작일" min="0001-01-01" max="9999-12-31" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="mt-1 block w-full min-w-0 border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-primary bg-fill text-label" />
              </label>
              <label className="text-caption1 text-label-alt">종료일
                <input type="date" aria-label="목표 종료일" value={endDate} min={startDate || '0001-01-01'} max="9999-12-31" onChange={e => setEndDate(e.target.value)}
                  className="mt-1 block w-full min-w-0 border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-primary bg-fill text-label" />
              </label>
            </div>
            {dateError && <p role="alert" className="px-4 pb-4 text-caption1 text-negative">{dateError}</p>}
          </div>

          {changedScope && !dateError && existing && proposed && <GoalEditImpact before={existing} after={proposed} />}

          <details className="quiet-details"><summary>추가 설정 · 실천 계획·색상</summary><div className="space-y-5">
          {/* ── 계획할 행동 ── */}
          <div className="bg-surface rounded-xl border border-line">
            <div className="px-4 py-4 border-b border-line-soft">
              <p className="text-body2 font-bold text-label-strong mb-0.5 flex items-center gap-1.5"><Dumbbell size={15} strokeWidth={1.9} /> 계획할 행동</p>
              <p className="text-caption1 text-label-alt">저장한 뒤 홈에서 실행할 습관·루틴으로 연결해요</p>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <input aria-label="계획할 습관" value={habitTitle} onChange={e => setHabitTitle(e.target.value)}
                placeholder="습관명 (예: 러닝 30분)"
                className={inputCls} />
              <input aria-label="계획할 습관 시간" value={habitWhen} onChange={e => setHabitWhen(e.target.value)}
                placeholder="⏰ 언제 (예: 출근 전 6시)"
                className={inputCls} />
              <input aria-label="계획할 습관 장소" value={habitWhere} onChange={e => setHabitWhere(e.target.value)}
                placeholder="📍 어디서 (예: 공원)"
                className={inputCls} />
            </div>

            {/* 미니 습관 */}
            <div className="mx-4 mb-4 bg-fill rounded-xl px-4 py-3.5 border border-line">
              <p className="text-caption1 font-bold text-label-strong mb-2 flex items-center gap-1.5"><Flame size={14} strokeWidth={1.9} className="text-cautionary" /> 미니 습관 (대체용)</p>
              <input aria-label="목표의 대체 습관" value={miniHabit} onChange={e => setMiniHabit(e.target.value)}
                placeholder="하기 힘든 날의 대체 습관 (예: 10분 스트레칭)"
                className="form-paper-field w-full px-3 py-2.5" />
            </div>

            {/* 2분 습관 */}
            <div className="mx-4 mb-4 bg-primary-soft rounded-xl px-4 py-3.5 border border-line">
              <p className="text-caption1 font-bold text-primary mb-1 flex items-center gap-1.5"><Zap size={14} strokeWidth={1.9} /> 2분 습관 (시작 트리거)</p>
              <p className="text-caption2 text-label-alt mb-2">
                시작을 쉽게 만드는 2분 이내의 작은 행동을 적어요
              </p>
              <input aria-label="목표의 2분 습관" value={twoMinuteHabit} onChange={e => setTwoMinuteHabit(e.target.value)}
                placeholder="예: 운동복으로 갈아입기, 러닝화 신기"
                className="form-paper-field w-full px-3 py-2.5" />
            </div>
          </div>{/* 계획할 행동 카드 닫기 */}

          {/* ── 색상 선택 ── */}
          <div className="bg-surface rounded-xl border border-line">
            {/* 토글 헤더 */}
            <div className="px-4 py-4 flex items-center justify-between">
              <div>
                <p className="text-body2 font-bold text-label-strong flex items-center gap-1.5"><Palette size={15} strokeWidth={1.9} /> 색상 선택</p>
                <p className="text-caption1 text-label-alt mt-0.5">목표를 구분하는 작은 표시색이에요</p>
              </div>
              <Switch checked={colorEnabled} label="목표 카드 색상"
                onCheckedChange={enabled => { setColorEnabled(enabled); if (!enabled) setSelectedColor(''); }} />
            </div>

            {/* 색상 그리드 — 항상 표시, 비활성 시 채도 낮음 */}
            <div className="px-4 pb-4">
              <div className="grid grid-cols-[repeat(auto-fit,minmax(44px,1fr))] gap-2.5">
                {COLORS.map(c => {
                  const isSelected = colorEnabled && selectedColor === c;
                  return (
                    <motion.button
                      key={c}
                      aria-label={`목표 색상 ${c} 선택`} aria-pressed={isSelected} disabled={!colorEnabled}
                      whileTap={colorEnabled ? { scale: 0.85 } : {}}
                      onClick={() => colorEnabled && setSelectedColor(prev => prev === c ? '' : c)}
                      className="w-full aspect-square rounded-full flex items-center justify-center transition-all"
                      style={{
                        backgroundColor: c,
                        filter: colorEnabled ? 'none' : 'saturate(0.2) brightness(0.85)',
                        boxShadow: isSelected ? `0 0 0 3px var(--color-surface), 0 0 0 5px ${c}` : 'none',
                        transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                        cursor: colorEnabled ? 'pointer' : 'default',
                      }}
                    >
                      {isSelected && (
                        <Check size={14} className="text-white" strokeWidth={3} />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>

          </div></details>
        </div>
      </div>

      </fieldset>
      {/* 하단 고정 버튼 */}
      <div className="form-paper-footer fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4"
        style={{ paddingBottom: 'max(1rem, var(--app-safe-bottom))' }}>
        <motion.button
          whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
          onClick={() => handleSave()}
          disabled={draft.awaitingChoice || !canSave}
          className="w-full h-12 mt-3 rounded-xl bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors"
        >
          {isEdit ? '수정 완료' : '목표 시작하기'}
        </motion.button>
      </div>
    </div>
  );
}
