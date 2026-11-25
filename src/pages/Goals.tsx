import { useState, useEffect, useRef } from 'react';
import { Plus, ChevronLeft, ChevronDown, ChevronUp, Pencil, Trash2, Lock, PartyPopper, BookOpen, Dumbbell, Link2, ClipboardList, Pin, Clock, CheckCircle2, Flame, Zap } from '../icons';
import { format, subDays } from 'date-fns';
import { getPeriodCompletion } from '../utils/dayCompletion';
import { motion, AnimatePresence } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import WeeklyGoalsSection from '../components/goals/WeeklyGoalsSection';
import type { MonthlyGoal } from '../types';
import { elapsedDays } from '../utils/date';
import { getLinkedItems, rateFromItems, adherenceFromItems, type LinkedItem } from '../utils/goalProgress';
import OnjuIcon from '../components/ui/OnjuIcon';
import ConfirmModal from '../components/ui/ConfirmModal';
import { toast } from '../store/toastStore';
import { useLocalNow } from '../hooks/useLocalNow';
import { useGoalDeletionIds } from '../hooks/useGoalDeletionIds';

const tapSm = { whileTap: { scale: 0.88 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };
const MAX_SLOTS = 5;

export default function Goals() {
  useLocalNow();
  const navigate = useNavigate();
  const location = useLocation();
  const focusedGoalId = typeof location.state?.goalId === 'string' ? location.state.goalId : undefined;
  const { monthlyGoals, goalSlots, removeMonthlyGoal, unlockGoalSlot } = useGoalStore();
  const { habits, habitLogs } = useHabitStore();
  const { faithRoutines, personalRoutines, logs } = useRoutineStore();

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(focusedGoalId ? [focusedGoalId] : []));
  const scrolledGoal = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!focusedGoalId || scrolledGoal.current === focusedGoalId || !monthlyGoals.some(g => g.id === focusedGoalId)) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(`goal-${focusedGoalId}`)?.scrollIntoView({ block: 'start' });
      scrolledGoal.current = focusedGoalId;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedGoalId, monthlyGoals]);
  const [unlockBanner, setUnlockBanner] = useState(false);
  const pendingDeletes = useGoalDeletionIds();
  const [deleting, setDeleting] = useState<{ goal: MonthlyGoal; date: string; linked: string }>();
  const deleteId = deleting?.goal.id;
  const linked = JSON.stringify([...habits, ...faithRoutines, ...personalRoutines].filter(item => item.goalId === deleteId || ('monthlyGoalId' in item && item.monthlyGoalId === deleteId)));
  const linkedCount = [...habits, ...faithRoutines, ...personalRoutines]
    .filter(item => item.goalId === deleteId || ('monthlyGoalId' in item && item.monthlyGoalId === deleteId)).length;

  const todayIso   = format(new Date(), 'yyyy-MM-dd');
  const deletionValid = !!deleting && deleting.date === todayIso && deleting.linked === linked
    && JSON.stringify(deleting.goal) === JSON.stringify(monthlyGoals.find(g => g.id === deleteId)) && !pendingDeletes.includes(deleteId!);
  const activeGoals = monthlyGoals.filter(g => g.endDate >= todayIso);
  const pastGoals   = monthlyGoals.filter(g => g.endDate < todayIso);

  const weeklyRate  = getPeriodCompletion(subDays(new Date(), 6), new Date(), todayIso, habits, habitLogs, [], []).personalRate;
  const canUnlock   = weeklyRate >= 80 && goalSlots < MAX_SLOTS;
  const canAdd      = activeGoals.length < goalSlots;

  // 달성률 80%+ → 슬롯 해제 배너 표시
  useEffect(() => {
    if (canUnlock) {
      const t = setTimeout(() => setUnlockBanner(true), 0);
      return () => clearTimeout(t);
    }
  }, [canUnlock]);

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });

  const renderGoal = (g: MonthlyGoal, past: boolean) => {
    const items = getLinkedItems(g, habits, habitLogs, faithRoutines, logs, todayIso);
    return (
      <GoalCard key={g.id} goal={g} past={past} pendingDeletion={pendingDeletes.includes(g.id)}
        isOpen={expanded.has(g.id)} featured={!past && activeGoals[0]?.id === g.id}
        adherence={adherenceFromItems(items)}
        rate={rateFromItems(items)}
        linkedItems={items}
        onToggle={() => toggle(g.id)}
        onEdit={() => navigate(`/goals/monthly/edit/${g.id}`)}
        onDelete={() => setDeleting({ goal: g, date: todayIso, linked: JSON.stringify([...habits, ...faithRoutines, ...personalRoutines].filter(item => item.goalId === g.id || ('monthlyGoalId' in item && item.monthlyGoalId === g.id))) })}
        onCreateHabit={() => navigate(`/goals/${g.id}/connect`)}
      />
    );
  };

  return (
    <div className="records-paper flex min-h-full flex-col gap-4 pb-8">
      <ConfirmModal isOpen={!!deleting} title="목표만 삭제할까요?"
        message={deletionValid ? `‘${deleting?.goal.title ?? ''}’ 목표를 삭제하고 연결된 습관·루틴 ${linkedCount}개의 현재 연결을 ${todayIso}부터 해제해요. 습관·루틴, 보관 상태, 주간 목표와 과거 수행 기록은 남아요. 삭제한 목표의 상세·진척 화면은 다시 볼 수 없어요. 서버 버전을 확인한 뒤 삭제하며, 내용이 바뀌면 멈추고 다시 확인해요.` : '목표 또는 연결 내용이 바뀌었어요. 취소 후 다시 확인해주세요.'}
        confirmDisabled={!deletionValid} confirmLabel="목표만 삭제" onCancel={() => setDeleting(undefined)} onConfirm={() => {
          try {
            if (!deletionValid || !deleting) return;
            removeMonthlyGoal(deleting.goal.id, deleting.goal); toast.success('삭제 요청을 보관했어요. 서버 확인 전까지 목표와 연결을 유지해요.');
            setDeleting(undefined);
          } catch { toast.error('목표를 삭제하지 못했어요. 기기 저장 공간 또는 목표 충돌 안내를 확인해주세요.'); }
        }} />
      {/* 헤더 */}
      <div className="px-4 pt-5 flex items-center gap-2">
        <motion.button {...tapSm} onClick={() => navigate(-1)} aria-label="뒤로 가기" className="paper-back-button text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <div className="flex-1">
          <h1 className="text-heading2 font-bold text-label-strong font-brand">목표</h1>
        </div>
        {/* 슬롯 현황 */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: MAX_SLOTS }).map((_, i) => (
            <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${
              i < goalSlots ? (i < activeGoals.length ? 'bg-primary' : 'bg-primary/30') : 'bg-fill-strong'
            }`} />
          ))}
          <span className="text-caption1 text-label-alt font-medium ml-1">{activeGoals.length}/{goalSlots}</span>
        </div>
      </div>

      {/* 달성률 80%+ 슬롯 해제 배너 */}
      <AnimatePresence>
        {unlockBanner && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="mx-4 bg-positive/10 border border-positive/20 rounded-xl px-4 py-3 flex items-center justify-between"
          >
            <div>
              <p className="text-body2 font-bold text-positive flex items-center gap-1.5"><PartyPopper size={16} strokeWidth={1.9} /> 목표 슬롯이 열렸어요!</p>
              <p className="text-caption1 text-label-alt mt-0.5">달성률 {weeklyRate}% 달성! 목표를 하나 더 추가할 수 있어요</p>
            </div>
            <motion.button {...tapSm}
              onClick={() => { unlockGoalSlot(); setUnlockBanner(false); }}
              className="min-h-11 px-3 py-1.5 bg-positive text-white rounded-xl text-caption1 font-bold flex-shrink-0 ml-3">
              해제
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 이번 주 목표 — 습관·루틴 연동 횟수 목표 */}
      <div className="px-4">
        <WeeklyGoalsSection />
      </div>

      <p className="text-caption1 font-semibold text-label-alt px-4 -mb-1">이달의 목표</p>

      {/* 목표 목록 */}
      <div className="px-4 flex flex-col gap-2.5">
        {activeGoals.length === 0 && pastGoals.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-line py-12 flex flex-col items-center gap-2 text-center">
            <p className="text-body2 font-semibold text-label-alt">아직 목표가 없어요</p>
            <p className="text-caption1 text-label-assistive">작은 목표부터 시작해보세요</p>
          </div>
        ) : (
          <>
            {activeGoals.map(g => renderGoal(g, false))}
            {pastGoals.length > 0 && (
              <>
                <details className="quiet-details"><summary>지난 목표 {pastGoals.length}개</summary><div className="flex flex-col gap-3">{pastGoals.map(g => renderGoal(g, true))}</div></details>
              </>
            )}
          </>
        )}

        {/* 추가 버튼 */}
        {canAdd ? (
          <motion.button {...tapSm}
            onClick={() => navigate('/goals/monthly/new')}
            className="w-full rounded-xl border-2 border-dashed border-line py-5 flex items-center justify-center gap-2 text-label-assistive hover:border-primary hover:text-primary hover:bg-primary-soft/30 transition-all">
            <Plus size={20} />
            <span className="text-body2 font-semibold">목표 추가</span>
          </motion.button>
        ) : (
          <div className="w-full rounded-xl border-2 border-dashed border-line/50 py-4 flex flex-col items-center gap-1 text-label-assistive">
            <div className="flex items-center gap-1.5">
              <Lock size={14} />
              <span className="text-body2 font-medium">
                {goalSlots >= MAX_SLOTS ? `최대 ${MAX_SLOTS}개까지 설정 가능해요` : '달성률 80% 이상 시 목표를 추가할 수 있어요'}
              </span>
            </div>
            {goalSlots < MAX_SLOTS && (
              <p className="text-caption1">현재 주간 달성률: {weeklyRate}%</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── 목표 카드 ── */
function GoalCard({ goal, featured = false, past = false, pendingDeletion, isOpen, adherence, rate, linkedItems, onToggle, onEdit, onDelete, onCreateHabit }: {
  goal: MonthlyGoal; featured?: boolean; past?: boolean; pendingDeletion: boolean; isOpen: boolean;
  adherence: number; rate: number; linkedItems: LinkedItem[];
  onToggle: () => void; onEdit: () => void; onDelete: () => void; onCreateHabit: () => void;
}) {
  const { elapsed, total } = elapsedDays(goal.startDate, goal.endDate);
  const habit = goal.goalRoutines?.[0];
  const accentColor = past ? 'var(--color-label-assistive)' : 'var(--color-primary)';
  const todayIso  = format(new Date(), 'yyyy-MM-dd');
  const isPast    = goal.endDate < todayIso;
  const isFuture = goal.startDate > todayIso;

  return (
    <div
      id={`goal-${goal.id}`}
      className={`monthly-goal-paper-card overflow-hidden ${featured ? 'goal-featured' : 'goal-secondary'} ${
        isPast ? 'bg-fill border-line' : 'bg-surface border-line'
      }`}
    >
      <button className="w-full text-left px-4 pt-4 pb-3" aria-expanded={isOpen} aria-label={goal.title + ' 상세'} onClick={onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-0.5">
              {goal.color && <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: goal.color }} />}
              <p className="text-caption1 font-medium" style={{ color: accentColor }}>
                {format(new Date(goal.startDate + 'T12:00:00'), 'M/d')} ~ {format(new Date(goal.endDate + 'T12:00:00'), 'M/d')}
              </p>
              {goal.category && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full inline-flex items-center gap-1 ${
                  goal.category === 'faith'
                    ? 'bg-faith-soft text-faith'
                    : 'bg-primary-soft text-primary'
                }`}>
                  {goal.category === 'faith'
                    ? <><BookOpen size={11} strokeWidth={1.9} /> 신앙</>
                    : <><Dumbbell size={11} strokeWidth={1.9} /> 개인</>}
                </span>
              )}
            </div>
            <p className={`text-body2 font-semibold leading-snug ${isPast ? 'text-label-alt' : 'text-label-strong'}`}>
              {goal.title}
            </p>
          </div>
          <span className="flex-shrink-0 mt-0.5 text-label-assistive">
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>

        {/* 수행률 바 (대표) + 진척도 (보조) */}
        {!isPast && (
          <div className="mt-2.5">
            <div className="flex justify-between items-center text-caption2 mb-1">
              <span className="text-label-assistive">{isFuture ? '시작 전' : '전체 기간 진척'}</span>
              <span className="font-bold" style={{ color: accentColor }}>{rate}%</span>
            </div>
            <div className="bg-surface/60 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: 'var(--color-accent)' }} />
            </div>
          </div>
        )}
      </button>

      {pendingDeletion && <p role="status" className="px-4 py-3 text-caption1 bg-primary-soft">삭제 확인 대기 · 서버 확인 전까지 목표와 연결을 유지해요. 충돌 안내가 뜨면 최신 내용을 확인해주세요.</p>}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="overflow-hidden">

            <p className="px-4 pb-3 text-caption1 text-label-alt">기간 {elapsed}/{total}일 · 지난 예정일 수행률 {adherence}% · 전체 기간 진척 {rate}%</p>
            {/* 연동된 습관/루틴 + 개별 달성률 */}
            <div className="mx-3 mb-2 rounded-xl px-4 py-3.5 flex flex-col gap-2.5 bg-surface/60 border border-line-soft">
              <p className="text-caption1 font-bold text-label-strong flex items-center gap-1.5">
                <Link2 size={14} strokeWidth={1.9} /> 실천별 기록 {linkedItems.length > 0 && `(${linkedItems.length})`}
              </p>
              <button className="min-h-11 text-left font-bold text-primary" onClick={onCreateHabit}>{isPast ? '지난 목표의 실천 연결 관리' : '실천 연결·관리'}</button>
              {linkedItems.length > 0 ? (
                linkedItems.map(item => (
                  <div key={`${item.kind}:${item.id}`}>
                    {!item.currentlyLinked && <p className="text-caption2 text-label-alt mb-1">이전 연결 기록 · 현재는 연결 해제됨</p>}
                    {item.currentlyLinked && item.scheduledTotal === 0 && <p className="text-caption2 text-label-alt mb-1">연결 유지 · 이 목표 기간 안의 예정일 없음</p>}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-body2 text-label truncate flex-1 mr-2 inline-flex items-center gap-1.5">
                        {item.emoji
                          ? <OnjuIcon emoji={item.emoji} size={22} />
                          : item.kind === 'faith'
                            ? <BookOpen size={13} strokeWidth={1.9} className="flex-shrink-0" />
                            : <Pin size={13} strokeWidth={1.9} className="flex-shrink-0" />} {item.title}
                      </span>
                      <span className="flex items-center gap-1.5 flex-shrink-0">
                        <span className="text-caption2 text-label-assistive">{item.scheduledElapsed ? `${item.doneCount}/${item.scheduledElapsed}일` : item.scheduledTotal ? '예정 전' : '예정 없음'}</span>
                        <span className="text-caption1 font-bold" style={{ color: accentColor }}>
                          {item.scheduledElapsed ? `${item.adherence}%` : '—'}
                        </span>
                      </span>
                    </div>
                    <div className="bg-fill-strong rounded-full h-1 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${item.adherence}%`, backgroundColor: accentColor }} />
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-caption1 text-label-assistive leading-relaxed">
                  아직 연동된 습관이 없어요.<br />
                  습관·루틴을 추가할 때 이 목표를 연동하면 달성률에 반영돼요.
                </p>
              )}
            </div>

            {/* 계획한 습관 → 습관으로 만들기 */}
            {habit && (() => {
              const alreadyTracked = linkedItems.some(it => it.id === habit.id && it.currentlyLinked);
              return (
                <div className="mx-3 mb-3 rounded-xl px-4 py-3 flex flex-col gap-2 bg-fill/60 border border-line-soft">
                  <div className="flex items-center justify-between">
                    <p className="text-caption2 font-bold text-label-assistive flex items-center gap-1.5"><ClipboardList size={13} strokeWidth={1.9} /> 계획한 습관</p>
                    {alreadyTracked ? (
                      <span className="text-caption2 font-bold text-positive flex items-center gap-1"><CheckCircle2 size={13} strokeWidth={1.9} /> 추적 중</span>
                    ) : !isPast && (
                      <motion.button {...tapSm} onClick={onCreateHabit}
                        className="flex min-h-11 items-center gap-1 px-2.5 py-1 rounded-lg text-caption2 font-bold text-white"
                        style={{ backgroundColor: accentColor }}>
                        <Plus size={11} /> 습관으로 만들기
                      </motion.button>
                    )}
                  </div>
                  <p className="text-caption1 text-label-alt flex items-center gap-1.5"><Pin size={13} strokeWidth={1.9} className="flex-shrink-0" /> {habit.title}</p>
                  {habit.when  && <p className="text-caption1 text-label-assistive flex items-center gap-1.5"><Clock size={13} strokeWidth={1.9} className="flex-shrink-0" /> {habit.when}</p>}
                  {habit.miniRoutine     && <p className="text-caption1 text-cautionary flex items-center gap-1.5"><Flame size={13} strokeWidth={1.9} className="flex-shrink-0" /> 미니: {habit.miniRoutine}</p>}
                  {habit.twoMinuteHabit && <p className="text-caption1 text-primary flex items-center gap-1.5"><Zap size={13} strokeWidth={1.9} className="flex-shrink-0" /> 2분: {habit.twoMinuteHabit}</p>}
                </div>
              );
            })()}

            <div className="flex items-center justify-end gap-1 px-4 pb-3">
              <motion.button {...tapSm} onClick={onEdit} disabled={pendingDeletion}
                className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption1 font-semibold text-primary bg-primary-soft disabled:opacity-50">
                <Pencil size={12} /> 수정
              </motion.button>
              <motion.button {...tapSm} onClick={onDelete} disabled={pendingDeletion}
                className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption1 font-semibold text-negative bg-negative/10 disabled:opacity-50">
                <Trash2 size={12} /> 삭제
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
