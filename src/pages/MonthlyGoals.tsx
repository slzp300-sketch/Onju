import { Plus, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useGoalStore } from '../store/goalStore';
import type { MonthlyGoal } from '../types';
import { formatDateRange, elapsedDays } from '../utils/date';

export default function MonthlyGoals() {
  const navigate = useNavigate();
  const { monthlyGoals, removeMonthlyGoal } = useGoalStore();

  const now = new Date();
  // 오늘 날짜가 startDate~endDate 범위에 포함된 목표만 표시
  const todayIso = format(now, 'yyyy-MM-dd');
  const activeGoals = monthlyGoals.filter(g => g.startDate <= todayIso && g.endDate >= todayIso);
  const pastGoals = monthlyGoals.filter(g => g.endDate < todayIso);

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5">
        <h1 className="text-heading2 font-bold text-label-strong font-brand">월간 목표</h1>
        <p className="text-caption1 text-label-alt mt-0.5">진행 중인 목표를 관리해요</p>
      </div>

      <div className="px-4 flex flex-col gap-3">
        {activeGoals.map(g => <GoalCard key={g.id} goal={g} onDelete={() => removeMonthlyGoal(g.id)} />)}

        {pastGoals.length > 0 && (
          <>
            <p className="text-caption1 font-semibold text-label-assistive mt-1">종료된 목표</p>
            {pastGoals.map(g => <GoalCard key={g.id} goal={g} onDelete={() => removeMonthlyGoal(g.id)} past />)}
          </>
        )}

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

function GoalCard({ goal, onDelete, past }: { goal: MonthlyGoal; onDelete: () => void; past?: boolean }) {
  const { elapsed, total } = elapsedDays(goal.startDate, goal.endDate);
  const progress = Math.round((elapsed / total) * 100);

  return (
    <div className={`rounded-xl p-4 border shadow-emphasize ${past ? 'bg-fill border-line' : 'bg-primary-soft border-primary/20'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-caption1 font-medium mb-1 ${past ? 'text-label-assistive' : 'text-primary'}`}>
            {formatDateRange(goal.startDate, goal.endDate)}
          </p>
          <p className={`text-body2 font-semibold mb-1 ${past ? 'text-label-alt' : 'text-label-strong'}`}>{goal.title}</p>
          {goal.description && (
            <p className="text-caption1 text-label-assistive leading-relaxed">{goal.description}</p>
          )}
        </div>
        <button onClick={onDelete} className="text-label-assistive hover:text-negative transition-colors p-1 flex-shrink-0">
          <Trash2 size={14} />
        </button>
      </div>
      {!past && (
        <div className="mt-3">
          <div className="flex justify-between text-caption2 text-label-assistive mb-1">
            <span>D+{elapsed - 1}</span>
            <span>{elapsed}/{total}일</span>
          </div>
          <div className="bg-white/60 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
