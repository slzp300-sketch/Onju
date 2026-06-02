import type { MonthlyGoal } from '../../types';
import { formatDateRange } from '../../utils/date';

export default function MonthlyGoalCard({ goal }: { goal: MonthlyGoal }) {
  const range = goal.startDate && goal.endDate
    ? formatDateRange(goal.startDate, goal.endDate)
    : `${goal.year}년 ${goal.month}월`;

  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-4 border border-primary-soft">
      <p className="text-caption1 font-medium text-primary mb-1">{range}</p>
      <p className="text-label1 font-semibold text-label-strong mb-1">{goal.title}</p>
      {goal.description && (
        <p className="text-caption1 text-label-alt leading-relaxed">{goal.description}</p>
      )}
    </div>
  );
}
