import { Trash2 } from 'lucide-react';
import type { WeeklyGoal } from '../../types';
import { useGoalStore } from '../../store/goalStore';
import { formatDateRange, elapsedDays } from '../../utils/date';

interface WeeklyGoalCardProps {
  goal: WeeklyGoal;
  monthlyTitle?: string;
}

export default function WeeklyGoalCard({ goal, monthlyTitle }: WeeklyGoalCardProps) {
  const { removeWeeklyGoal } = useGoalStore();
  const { elapsed, total } = elapsedDays(goal.startDate, goal.endDate);
  const progress = Math.round((elapsed / total) * 100);
  const isPast = goal.endDate < new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{goal.title}</p>
          {monthlyTitle && (
            <p className="text-xs text-indigo-500 mt-0.5">{monthlyTitle}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{formatDateRange(goal.startDate, goal.endDate)}</p>
        </div>
        <button
          onClick={() => removeWeeklyGoal(goal.id)}
          className="text-gray-300 hover:text-red-400 transition-colors p-1 flex-shrink-0"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${progress}%`,
              backgroundColor: isPast ? '#9ca3af' : progress >= 80 ? '#10b981' : progress >= 50 ? '#6366f1' : '#f59e0b',
            }}
          />
        </div>
        <span className="text-xs text-gray-400 w-12 text-right flex-shrink-0">
          {elapsed}/{total}일
        </span>
      </div>
    </div>
  );
}
