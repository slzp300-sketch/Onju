import { useState } from 'react';
import { Plus, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGoalStore } from '../store/goalStore';
import type { MonthlyGoal } from '../types';
import { formatDateRange, elapsedDays } from '../utils/date';

export default function MonthlyGoals() {
  const navigate = useNavigate();
  const { monthlyGoals, removeMonthlyGoal } = useGoalStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });

  // 월별 그룹핑 (최신순)
  const sorted = [...monthlyGoals].sort((a, b) => {
    const ak = `${a.year}${String(a.month).padStart(2, '0')}`;
    const bk = `${b.year}${String(b.month).padStart(2, '0')}`;
    return bk.localeCompare(ak);
  });

  const groups: { label: string; goals: MonthlyGoal[] }[] = [];
  sorted.forEach(g => {
    const label = format(new Date(g.year, g.month - 1), 'yyyy년 M월', { locale: ko });
    const last = groups[groups.length - 1];
    if (last?.label === label) {
      last.goals.push(g);
    } else {
      groups.push({ label, goals: [g] });
    }
  });

  const todayIso = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5">
        <h1 className="text-heading2 font-bold text-label-strong font-brand">월간 목표</h1>
        <p className="text-caption1 text-label-alt mt-0.5">진행 중인 목표를 관리해요</p>
      </div>

      <div className="px-4 flex flex-col gap-5">
        {groups.map(({ label, goals }) => (
          <div key={label}>
            {/* 월 헤더 */}
            <p className="text-caption1 font-bold text-label-alt mb-2 px-0.5">{label}</p>
            <div className="flex flex-col gap-2.5">
              {goals.map(g => {
                const past = g.endDate < todayIso;
                const isOpen = expanded.has(g.id);
                return (
                  <GoalCard
                    key={g.id}
                    goal={g}
                    past={past}
                    isOpen={isOpen}
                    onToggle={() => toggle(g.id)}
                    onEdit={() => navigate(`/goals/monthly/edit/${g.id}`)}
                    onDelete={() => removeMonthlyGoal(g.id)}
                  />
                );
              })}
            </div>
          </div>
        ))}

        {/* 목표 추가 카드 */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 600, damping: 20 }}
          onClick={() => navigate('/goals/monthly/new')}
          className="w-full rounded-xl border-2 border-dashed border-line py-5 flex items-center justify-center gap-2 text-label-assistive hover:border-primary hover:text-primary hover:bg-primary-soft/30 transition-all"
        >
          <Plus size={20} />
          <span className="text-body2 font-semibold">목표 추가</span>
        </motion.button>
      </div>
    </div>
  );
}

/* ── 목표 카드 ── */
interface GoalCardProps {
  goal: MonthlyGoal;
  past: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function GoalCard({ goal, past, isOpen, onToggle, onEdit, onDelete }: GoalCardProps) {
  const { elapsed, total } = elapsedDays(goal.startDate, goal.endDate);
  const progress = Math.round((elapsed / total) * 100);
  const habit = goal.goalRoutines?.[0];

  return (
    <div className={`rounded-xl border shadow-emphasize overflow-hidden ${
      past ? 'bg-fill border-line' : 'bg-primary-soft border-primary/20'
    }`}>
      {/* 카드 헤더 — 항상 표시 */}
      <button className="w-full text-left px-4 pt-4 pb-3" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className={`text-caption1 font-medium mb-1 ${past ? 'text-label-assistive' : 'text-primary'}`}>
              {formatDateRange(goal.startDate, goal.endDate)}
            </p>
            <p className={`text-body2 font-semibold leading-snug ${past ? 'text-label-alt' : 'text-label-strong'}`}>
              {goal.title}
            </p>
          </div>
          <div className={`flex-shrink-0 mt-0.5 ${past ? 'text-label-assistive' : 'text-primary'}`}>
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </div>
        </div>

        {!past && (
          <div className="mt-3">
            <div className="flex justify-between text-caption2 text-label-assistive mb-1">
              <span>D+{elapsed - 1}</span>
              <span>{elapsed}/{total}일</span>
            </div>
            <div className="bg-white/60 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </button>

      {/* 상세 내용 — 펼쳐질 때 */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="overflow-hidden"
          >
            <div className={`mx-3 mb-3 rounded-xl px-4 py-3.5 flex flex-col gap-2.5 ${
              past ? 'bg-surface border border-line-soft' : 'bg-white/60 border border-primary/10'
            }`}>
              {habit ? (
                <>
                  {/* 핵심 습관 */}
                  <p className="text-caption1 font-bold text-label-strong">💪 핵심 습관</p>
                  <DetailRow icon="📌" label={habit.title} />
                  {habit.when  && <DetailRow icon="⏰" label={habit.when} />}
                  {habit.where && <DetailRow icon="📍" label={habit.where} />}

                  {/* 미니 / 2분 */}
                  {(habit.miniRoutine || habit.twoMinuteHabit) && (
                    <div className="h-px bg-line-soft mx-0.5" />
                  )}
                  {habit.miniRoutine     && <DetailRow icon="🔥" label={`미니: ${habit.miniRoutine}`} color="text-amber-600" />}
                  {habit.twoMinuteHabit && <DetailRow icon="⚡" label={`2분: ${habit.twoMinuteHabit}`} color="text-emerald-600" />}
                </>
              ) : (
                <p className="text-caption1 text-label-assistive">설정된 습관이 없어요</p>
              )}
            </div>

            {/* 수정 / 삭제 버튼 */}
            <div className="flex items-center justify-end gap-1 px-4 pb-3">
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption1 font-semibold text-primary bg-primary-soft hover:bg-primary-soft/80 transition-colors"
              >
                <Pencil size={12} />
                수정
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.88 }}
                onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption1 font-semibold text-negative bg-red-50 hover:bg-red-100 transition-colors"
              >
                <Trash2 size={12} />
                삭제
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailRow({ icon, label, color = 'text-label' }: { icon: string; label: string; color?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-sm flex-shrink-0 leading-snug">{icon}</span>
      <span className={`text-body2 leading-snug ${color}`}>{label}</span>
    </div>
  );
}
