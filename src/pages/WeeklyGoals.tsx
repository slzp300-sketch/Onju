import { useState } from 'react';
import { Plus, TrendingUp } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SlotBadge from '../components/ui/SlotBadge';
import WeeklyGoalCard from '../components/goals/WeeklyGoalCard';
import GoalCreateModal from '../components/goals/GoalCreateModal';
import MonthlyGoalCard from '../components/goals/MonthlyGoalCard';
import EmptyState from '../components/ui/EmptyState';
import { useGoalStore } from '../store/goalStore';
import { useAuthStore } from '../store/authStore';
import { getAvailableSlots, checkSlotUnlock } from '../utils/slots';
import { currentWeek, currentYear } from '../utils/date';

export default function WeeklyGoals() {
  const [showCreate, setShowCreate] = useState(false);
  const { weeklyGoals, monthlyGoals } = useGoalStore();
  const { user } = useAuthStore();

  const thisWeekGoals = weeklyGoals.filter(
    g => g.weekNumber === currentWeek() && g.year === currentYear()
  );

  const slots = getAvailableSlots(user, thisWeekGoals.length);

  // 지난 주 달성률 계산 (샘플: 이번 주와 동일한 목표들 사용)
  const { currentRate, shouldUnlock } = checkSlotUnlock(weeklyGoals, user.weeklyGoalSlots);

  const getMonthlyTitle = (monthlyGoalId?: string) =>
    monthlyGoals.find(g => g.id === monthlyGoalId)?.title;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5">
        <h1 className="text-lg font-bold text-gray-900">주간 목표</h1>
        <p className="text-xs text-gray-400 mt-0.5">{currentYear()}년 {currentWeek()}주차</p>
      </div>

      {/* 목표 현황 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-semibold text-gray-900">이번 주 목표 현황</p>
          <SlotBadge total={slots.total} used={slots.used} />
        </div>

        {/* 지난 주 달성률 안내 */}
        <div className={`rounded-xl p-3 text-xs ${shouldUnlock ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}`}>
          <div className="flex items-center gap-1.5">
            <TrendingUp size={13} />
            {shouldUnlock ? (
              <span className="font-medium">지난 주 {currentRate}% 달성! 다음 주 목표 칸이 1개 늘어나요 🎉</span>
            ) : (
              <span>지난 주 달성률 {currentRate}% — 80% 이상 달성하면 목표를 더 세울 수 있어요</span>
            )}
          </div>
        </div>
      </Card>

      {/* 월간 목표 */}
      {monthlyGoals.length > 0 && (
        <div className="px-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">이번 달 목표</p>
          {monthlyGoals.map(g => <MonthlyGoalCard key={g.id} goal={g} />)}
        </div>
      )}

      {/* 이번 주 목표 목록 */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-500">이번 주 목표</p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowCreate(true)}
            disabled={slots.remaining <= 0}
          >
            <Plus size={15} /> 추가
          </Button>
        </div>

        {slots.remaining <= 0 && (
          <p className="text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 mb-2">
            목표를 모두 채웠어요. 지난 주 달성률 80% 이상이면 목표 칸이 늘어나요.
          </p>
        )}

        {thisWeekGoals.length === 0 ? (
          <EmptyState
            title="이번 주 목표가 없어요"
            description="+ 추가 버튼으로 이번 주 목표를 설정해 보세요"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {thisWeekGoals.map(goal => (
              <WeeklyGoalCard
                key={goal.id}
                goal={goal}
                monthlyTitle={getMonthlyTitle(goal.monthlyGoalId)}
              />
            ))}
          </div>
        )}
      </div>

      <GoalCreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}
