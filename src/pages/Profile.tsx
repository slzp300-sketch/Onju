import { User, Bell, ChevronRight } from 'lucide-react';
import Card from '../components/ui/Card';
import SlotBadge from '../components/ui/SlotBadge';
import { useAuthStore } from '../store/authStore';
import { useGoalStore } from '../store/goalStore';
import { currentWeek, currentYear } from '../utils/date';

export default function Profile() {
  const { user } = useAuthStore();
  const { weeklyGoals } = useGoalStore();

  const thisWeekGoalCount = weeklyGoals.filter(
    g => g.weekNumber === currentWeek() && g.year === currentYear()
  ).length;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5">
        <h1 className="text-lg font-bold text-gray-900">프로필</h1>
      </div>

      {/* 유저 정보 */}
      <Card className="mx-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
            <User size={22} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{user.name}</p>
            <p className="text-xs text-gray-400">{user.email}</p>
          </div>
        </div>
      </Card>

      {/* 주간 슬롯 현황 */}
      <Card className="mx-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">주간 목표 슬롯</p>
        <SlotBadge total={user.weeklyGoalSlots} used={thisWeekGoalCount} />
        <p className="text-xs text-gray-400 mt-2">지난 주 달성률 80% 이상 시 슬롯이 늘어납니다 (최대 5개)</p>
      </Card>

      {/* 설정 메뉴 */}
      <Card className="mx-4" padding="none">
        <MenuItem icon={<Bell size={16} />} label="알림 설정" />
      </Card>
    </div>
  );
}

function MenuItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
      <span className="text-gray-500">{icon}</span>
      <span className="text-sm text-gray-800 flex-1">{label}</span>
      <ChevronRight size={16} className="text-gray-300" />
    </button>
  );
}
