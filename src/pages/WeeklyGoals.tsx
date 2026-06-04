import { useState } from 'react';
import { Plus, TrendingUp, ChevronDown, ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SlotBadge from '../components/ui/SlotBadge';
import WeeklyGoalCard from '../components/goals/WeeklyGoalCard';
import GoalCreateModal from '../components/goals/GoalCreateModal';
import MonthlyGoalCard from '../components/goals/MonthlyGoalCard';
import EmptyState from '../components/ui/EmptyState';
import { useGoalStore } from '../store/goalStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { getAvailableSlots, checkSlotUnlock } from '../utils/slots';
import { getWeekRangeFor, formatDateRange } from '../utils/date';

const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export default function WeeklyGoals() {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [showWeekSetting, setShowWeekSetting] = useState(false);
  const { weeklyGoals, monthlyGoals } = useGoalStore();
  const { user } = useAuthStore();
  const { weekStartDay, setWeekStartDay } = useSettingsStore();

  const today = format(new Date(), 'yyyy-MM-dd');
  const { start, end } = getWeekRangeFor(new Date(), weekStartDay);
  const weekStart = format(start, 'yyyy-MM-dd');
  const weekEnd = format(end, 'yyyy-MM-dd');

  // 오늘이 startDate~endDate 범위에 포함된 목표
  const thisWeekGoals = weeklyGoals.filter(
    g => g.startDate <= today && g.endDate >= today
  );

  const slots = getAvailableSlots(user!, thisWeekGoals.length);
  const { currentRate, shouldUnlock } = checkSlotUnlock(weeklyGoals, user?.weeklyGoalSlots ?? 3);

  const getMonthlyTitle = (monthlyGoalId?: string) =>
    monthlyGoals.find(g => g.id === monthlyGoalId)?.title;

  // 오늘 포함된 월간 목표
  const activeMonthlyGoals = monthlyGoals.filter(g => g.startDate <= today && g.endDate >= today);

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5 flex items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
          onClick={() => navigate(-1)} className="p-1 -ml-1 text-label-alt flex-shrink-0">
          <ChevronLeft size={24} />
        </motion.button>
        <div>
          <h1 className="text-heading2 font-bold text-label-strong font-brand">주간 목표</h1>
          <p className="text-caption1 text-label-alt mt-0.5">{formatDateRange(weekStart, weekEnd)}</p>
        </div>
      </div>

      {/* 목표 현황 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-body2 font-semibold text-label-strong">이번 주 목표 현황</p>
          <SlotBadge total={slots.total} used={slots.used} />
        </div>
        <div className={`rounded-xl p-3 text-caption1 ${shouldUnlock ? 'bg-positive/10 text-[#009632]' : 'bg-fill text-label-alt'}`}>
          <div className="flex items-center gap-1.5">
            <TrendingUp size={13} />
            {shouldUnlock ? (
              <span className="font-medium">지난 주 {currentRate}% 달성! 다음 주 목표 칸이 1개 늘어나요 🎉</span>
            ) : (
              <span>지난 주 달성률 {currentRate}% — 80% 이상 달성하면 목표를 더 세울 수 있어요</span>
            )}
          </div>
        </div>

        {/* 주 시작 요일 설정 */}
        <button
          onClick={() => setShowWeekSetting(v => !v)}
          className="mt-3 flex items-center gap-1 text-caption1 text-label-alt hover:text-label transition-colors"
        >
          <span>주 시작: {WEEKDAY_NAMES[weekStartDay]}요일</span>
          <ChevronDown size={12} className={`transition-transform ${showWeekSetting ? 'rotate-180' : ''}`} />
        </button>
        {showWeekSetting && (
          <div className="mt-2 flex gap-1.5 flex-wrap">
            {WEEKDAY_NAMES.map((name, i) => (
              <button
                key={i}
                onClick={() => { setWeekStartDay(i); setShowWeekSetting(false); }}
                className={`px-2.5 py-1 rounded-lg text-caption1 font-medium transition-all border ${
                  weekStartDay === i
                    ? 'bg-primary text-white border-transparent'
                    : 'border-line text-label-alt'
                }`}
              >
                {name}
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* 월간 목표 */}
      {activeMonthlyGoals.length > 0 && (
        <div className="px-4">
          <p className="text-caption1 font-semibold text-label-alt mb-2">진행 중인 월간 목표</p>
          {activeMonthlyGoals.map(g => <MonthlyGoalCard key={g.id} goal={g} />)}
        </div>
      )}

      {/* 이번 주 목표 목록 */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-caption1 font-semibold text-label-alt">이번 기간 목표</p>
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
          <p className="text-caption1 text-cautionary bg-cautionary/10 rounded-xl px-3 py-2 mb-2">
            목표를 모두 채웠어요. 지난 주 달성률 80% 이상이면 목표 칸이 늘어나요.
          </p>
        )}

        {thisWeekGoals.length === 0 ? (
          <EmptyState
            title="이번 기간 목표가 없어요"
            description="+ 추가 버튼으로 기간을 지정해 목표를 세워 보세요"
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
