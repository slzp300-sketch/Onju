import type { MonthlyGoal } from '../../types';

export default function MonthlyGoalCard({ goal }: { goal: MonthlyGoal }) {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-4 border border-indigo-100">
      <p className="text-xs font-medium text-indigo-500 mb-1">{goal.year}년 {goal.month}월 목표</p>
      <p className="text-sm font-semibold text-gray-900 mb-1">{goal.title}</p>
      {goal.description && (
        <p className="text-xs text-gray-500 leading-relaxed">{goal.description}</p>
      )}
    </div>
  );
}
