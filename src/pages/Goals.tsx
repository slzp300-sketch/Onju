import { useState, useEffect } from 'react';
import { Plus, ChevronLeft, ChevronDown, ChevronUp, Pencil, Trash2, Lock } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import type { MonthlyGoal } from '../types';
import { elapsedDays } from '../utils/date';
import { getLinkedItems, getGoalRate, type LinkedItem } from '../utils/goalProgress';

const tapSm = { whileTap: { scale: 0.88 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };
const MAX_SLOTS = 3;

/** 최근 7일 습관 달성률 계산 */
function calcWeeklyHabitRate(
  habitLogs: { habitId: string; date: string; completed: boolean; skipped?: boolean; substitute?: boolean }[],
  habitCount: number,
): number {
  if (habitCount === 0) return 0;
  const today = new Date();
  const days: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    return format(d, 'yyyy-MM-dd');
  });
  const done = habitLogs.filter(l =>
    days.includes(l.date) && (l.completed || l.skipped || l.substitute)
  ).length;
  return Math.round((done / (habitCount * 7)) * 100);
}

export default function Goals() {
  const navigate = useNavigate();
  const { monthlyGoals, goalSlots, removeMonthlyGoal, unlockGoalSlot } = useGoalStore();
  const { habits, habitLogs } = useHabitStore();
  const { faithRoutines, logs } = useRoutineStore();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [unlockBanner, setUnlockBanner] = useState(false);

  const todayIso   = format(new Date(), 'yyyy-MM-dd');
  const activeGoals = monthlyGoals.filter(g => g.endDate >= todayIso);
  const pastGoals   = monthlyGoals.filter(g => g.endDate < todayIso);

  const weeklyRate  = calcWeeklyHabitRate(habitLogs, habits.length);
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

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* 헤더 */}
      <div className="px-4 pt-5 flex items-center gap-2">
        <motion.button {...tapSm} onClick={() => navigate(-1)} className="p-1 -ml-1 text-label-alt flex-shrink-0">
          <ChevronLeft size={24} />
        </motion.button>
        <div className="flex-1">
          <h1 className="text-heading2 font-bold text-label-strong font-brand">목표 관리</h1>
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
              <p className="text-body2 font-bold text-positive">🎉 목표 슬롯이 열렸어요!</p>
              <p className="text-caption1 text-label-alt mt-0.5">달성률 {weeklyRate}% 달성! 목표를 하나 더 추가할 수 있어요</p>
            </div>
            <motion.button {...tapSm}
              onClick={() => { unlockGoalSlot(); setUnlockBanner(false); }}
              className="px-3 py-1.5 bg-positive text-white rounded-xl text-caption1 font-bold flex-shrink-0 ml-3">
              해제
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 목표 목록 */}
      <div className="px-4 flex flex-col gap-2.5">
        {activeGoals.length === 0 && pastGoals.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-line py-12 flex flex-col items-center gap-2 text-center">
            <p className="text-body2 font-semibold text-label-alt">아직 목표가 없어요</p>
            <p className="text-caption1 text-label-assistive">나의 To-Be를 설정하고<br />방향을 잡아보세요</p>
          </div>
        ) : (
          <>
            {activeGoals.map(g => (
              <GoalCard key={g.id} goal={g}
                isOpen={expanded.has(g.id)}
                rate={getGoalRate(g, habits, habitLogs, faithRoutines, logs, todayIso)}
                linkedItems={getLinkedItems(g, habits, habitLogs, faithRoutines, logs, todayIso)}
                onToggle={() => toggle(g.id)}
                onEdit={() => navigate(`/goals/monthly/edit/${g.id}`)}
                onDelete={() => removeMonthlyGoal(g.id)}
              />
            ))}
            {pastGoals.length > 0 && (
              <>
                <p className="text-caption1 text-label-assistive font-semibold mt-1">종료된 목표</p>
                {pastGoals.map(g => (
                  <GoalCard key={g.id} goal={g} past
                    isOpen={expanded.has(g.id)}
                    rate={getGoalRate(g, habits, habitLogs, faithRoutines, logs, todayIso)}
                    linkedItems={getLinkedItems(g, habits, habitLogs, faithRoutines, logs, todayIso)}
                    onToggle={() => toggle(g.id)}
                    onEdit={() => navigate(`/goals/monthly/edit/${g.id}`)}
                    onDelete={() => removeMonthlyGoal(g.id)}
                  />
                ))}
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
function GoalCard({ goal, past = false, isOpen, rate, linkedItems, onToggle, onEdit, onDelete }: {
  goal: MonthlyGoal; past?: boolean; isOpen: boolean;
  rate: number; linkedItems: LinkedItem[];
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { elapsed, total } = elapsedDays(goal.startDate, goal.endDate);
  const habit = goal.goalRoutines?.[0];
  const cardBg    = goal.color ? `${goal.color}18` : undefined;
  const cardBorder = goal.color ? `${goal.color}50` : undefined;
  const accentColor = goal.color ?? (past ? 'var(--color-label-assistive)' : 'var(--color-primary)');
  const todayIso  = format(new Date(), 'yyyy-MM-dd');
  const isPast    = goal.endDate < todayIso;

  return (
    <div
      className={`rounded-xl border shadow-emphasize overflow-hidden ${
        goal.color ? '' : isPast ? 'bg-fill border-line' : 'bg-surface border-line'
      }`}
      style={goal.color ? { backgroundColor: cardBg, borderColor: cardBorder } : undefined}
    >
      <button className="w-full text-left px-4 pt-4 pb-3" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-caption1 font-medium" style={{ color: accentColor }}>
                {format(new Date(goal.startDate + 'T12:00:00'), 'M/d')} ~ {format(new Date(goal.endDate + 'T12:00:00'), 'M/d')}
              </p>
              {goal.category && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  goal.category === 'faith'
                    ? 'bg-emerald-100 text-emerald-600'
                    : 'bg-primary-soft text-primary'
                }`}>
                  {goal.category === 'faith' ? '🙏 신앙' : '💪 개인'}
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

        {/* 달성률 바 */}
        {!isPast && (
          <div className="mt-2.5">
            <div className="flex justify-between items-center text-caption2 mb-1">
              <span className="text-label-assistive">D+{elapsed - 1} · {elapsed}/{total}일</span>
              <span className="font-bold" style={{ color: accentColor }}>{rate}%</span>
            </div>
            <div className="bg-surface/60 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${rate}%`, backgroundColor: accentColor }} />
            </div>
          </div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="overflow-hidden">

            {/* 연동된 습관/루틴 + 개별 달성률 */}
            <div className="mx-3 mb-2 rounded-xl px-4 py-3.5 flex flex-col gap-2.5 bg-surface/60 border border-line-soft">
              <p className="text-caption1 font-bold text-label-strong">
                🔗 연동된 습관 {linkedItems.length > 0 && `(${linkedItems.length})`}
              </p>
              {linkedItems.length > 0 ? (
                linkedItems.map(item => (
                  <div key={item.id}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-body2 text-label truncate flex-1 mr-2">
                        {item.emoji ?? (item.kind === 'faith' ? '🙏' : '📌')} {item.title}
                      </span>
                      <span className="text-caption1 font-bold flex-shrink-0" style={{ color: accentColor }}>
                        {item.rate}%
                      </span>
                    </div>
                    <div className="bg-fill-strong rounded-full h-1 overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{ width: `${item.rate}%`, backgroundColor: accentColor }} />
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

            {/* 목표 설정 메모 (참고) */}
            {habit && (
              <div className="mx-3 mb-3 rounded-xl px-4 py-3 flex flex-col gap-1 bg-fill/60 border border-line-soft">
                <p className="text-caption2 font-bold text-label-assistive mb-0.5">📝 목표 설정 메모</p>
                <p className="text-caption1 text-label-alt">📌 {habit.title}</p>
                {habit.when  && <p className="text-caption1 text-label-assistive">⏰ {habit.when}</p>}
                {habit.miniRoutine     && <p className="text-caption1 text-amber-600">🔥 미니: {habit.miniRoutine}</p>}
                {habit.twoMinuteHabit && <p className="text-caption1 text-emerald-600">⚡ 2분: {habit.twoMinuteHabit}</p>}
              </div>
            )}

            <div className="flex items-center justify-end gap-1 px-4 pb-3">
              <motion.button {...tapSm} onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption1 font-semibold text-primary bg-primary-soft">
                <Pencil size={12} /> 수정
              </motion.button>
              <motion.button {...tapSm} onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption1 font-semibold text-negative bg-red-50">
                <Trash2 size={12} /> 삭제
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
