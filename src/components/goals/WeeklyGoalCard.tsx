import { Trash2 } from 'lucide-react';
import type { WeeklyGoal } from '../../types';
import { useGoalStore } from '../../store/goalStore';

interface WeeklyGoalCardProps {
  goal: WeeklyGoal;
  monthlyTitle?: string;
}

export default function WeeklyGoalCard({ goal, monthlyTitle }: WeeklyGoalCardProps) {
  const { removeWeeklyGoal } = useGoalStore();

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{goal.title}</p>
          {monthlyTitle && (
            <p className="text-xs text-indigo-500 mt-0.5">{monthlyTitle}</p>
          )}
        </div>
        <button
          onClick={() => removeWeeklyGoal(goal.id)}
          className="text-gray-300 hover:text-red-400 transition-colors p-1"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${goal.completionRate}%`,
              backgroundColor: goal.completionRate >= 80 ? '#10b981' : goal.completionRate >= 50 ? '#6366f1' : '#f59e0b',
            }}
          />
        </div>
        <span className="text-xs font-medium text-gray-600 w-8 text-right">{goal.completionRate}%</span>
      </div>
    </div>
  );
}
