import { User, Bell, ChevronRight, LogOut, CalendarDays, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Card from '../components/ui/Card';
import SlotBadge from '../components/ui/SlotBadge';
import { useAuthStore } from '../store/authStore';
import { useGoalStore } from '../store/goalStore';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeStore, THEME_TIERS } from '../store/themeStore';
import { useTreeGrowth } from '../hooks/useTreeGrowth';
import { currentWeek, currentYear } from '../utils/date';

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { weeklyGoals } = useGoalStore();
  const { weekStartDay, setWeekStartDay, graceEndHour, setGraceEndHour } = useSettingsStore();

  const thisWeekGoalCount = weeklyGoals.filter(
    g => g.weekNumber === currentWeek() && g.year === currentYear()
  ).length;

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5">
        <h1 className="text-heading2 font-bold text-label-strong font-brand">프로필</h1>
      </div>

      <Card className="mx-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-primary-soft flex items-center justify-center">
            <User size={22} className="text-primary" />
          </div>
          <div>
            <p className="text-body2 font-bold text-label-strong">{user!.name}</p>
            <p className="text-caption1 text-label-alt">{user!.email}</p>
          </div>
        </div>
      </Card>

      <Card className="mx-4">
        <p className="text-caption1 font-semibold text-label-alt mb-2">주간 목표 슬롯</p>
        <SlotBadge total={user!.weeklyGoalSlots} used={thisWeekGoalCount} />
        <p className="text-caption1 text-label-assistive mt-2">지난 주 달성률 80% 이상 시 슬롯이 늘어납니다 (최대 5개)</p>
      </Card>

      <Card className="mx-4" padding="none">
        {/* 주 시작 요일 */}
        <div className="flex items-center justify-between px-4 py-3.5">
          <div className="flex items-center gap-3">
            <CalendarDays size={16} className="text-label-alt" />
            <span className="text-body2 font-semibold text-label-strong">주 시작 요일</span>
          </div>
          <div className="flex bg-fill rounded-xl p-0.5">
            {([{ label: '월', value: 1 }, { label: '일', value: 0 }] as const).map(opt => (
              <motion.button
                key={opt.value}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.1 }}
                onClick={() => setWeekStartDay(opt.value)}
                className={`px-4 py-1.5 rounded-lg text-body2 font-bold transition-all ${
                  weekStartDay === opt.value
                    ? 'bg-surface shadow-sm text-label-strong'
                    : 'text-label-assistive'
                }`}
              >
                {opt.label}
              </motion.button>
            ))}
          </div>
        </div>
        <div className="h-px bg-line-soft mx-4" />
        {/* 전날 체크 마감 시각 */}
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3 mb-2.5">
            <Clock size={16} className="text-label-alt" />
            <div>
              <span className="text-body2 font-semibold text-label-strong">전날 체크 마감 시각</span>
              <p className="text-caption2 text-label-assistive mt-0.5">이 시각까지 어제 루틴·습관을 마저 체크할 수 있어요</p>
            </div>
          </div>
          <div className="flex bg-fill rounded-xl p-0.5">
            {([{ label: '없음', value: 0 }, { label: '새벽 3시', value: 3 }, { label: '새벽 6시', value: 6 }] as const).map(opt => (
              <motion.button
                key={opt.value}
                whileTap={{ scale: 0.95 }}
                transition={{ duration: 0.1 }}
                onClick={() => setGraceEndHour(opt.value)}
                className={`flex-1 py-1.5 rounded-lg text-caption1 font-bold whitespace-nowrap transition-all ${
                  graceEndHour === opt.value
                    ? 'bg-surface shadow-sm text-label-strong'
                    : 'text-label-assistive'
                }`}
              >
                {opt.label}
              </motion.button>
            ))}
          </div>
        </div>
        <div className="h-px bg-line-soft mx-4" />
        <MenuItem icon={<Bell size={16} />} label="알림 설정" onClick={() => navigate('/notification-settings')} />
        <div className="h-px bg-line-soft mx-4" />
        <button
          onClick={() => { logout(); navigate('/login', { replace: true }); }}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-fill transition-colors"
        >
          <LogOut size={16} className="text-negative" />
          <span className="text-body2 text-negative flex-1">로그아웃</span>
        </button>
      </Card>

      {/* 숲 테마 — 보상 트랙으로 이동 */}
      <ThemeEntryCard />
    </div>
  );
}

/** 숲 테마 엔트리 — 현재 테마·해금 현황 요약 후 보상 트랙 페이지로 이동 */
function ThemeEntryCard() {
  const navigate = useNavigate();
  const theme = useThemeStore(s => s.theme);
  const growth = useTreeGrowth();
  const current = THEME_TIERS.find(t => t.id === theme) ?? THEME_TIERS[0];
  const unlockedCount = THEME_TIERS.filter(t => growth.stage >= t.requiredStage).length;
  const nextTier = THEME_TIERS.find(t => t.requiredStage === growth.stage + 1);
  const remaining = growth.nextThreshold !== null ? growth.nextThreshold - growth.points : 0;

  return (
    <Card className="mx-4" padding="none">
      <button
        onClick={() => navigate('/themes')}
        className="w-full flex items-center gap-3 px-4 py-4 text-left hover:bg-fill transition-colors rounded-2xl"
      >
        <div
          className="w-11 h-11 rounded-xl border flex flex-col items-center justify-center gap-1 flex-shrink-0"
          style={{ backgroundColor: current.preview.bg, borderColor: `${current.preview.accent}33` }}
        >
          <div className="w-5 h-1.5 rounded-full" style={{ backgroundColor: current.preview.leaf }} />
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: current.preview.accent }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-body2 font-semibold text-label-strong">숲 테마</p>
            <span className="text-caption2 font-bold text-primary bg-primary-soft px-1.5 py-0.5 rounded-md">
              {unlockedCount}/{THEME_TIERS.length} 해금
            </span>
          </div>
          <p className="text-caption1 text-label-assistive mt-0.5 truncate">
            '{current.name}' 적용 중{nextTier ? ` · 다음 보상 '${nextTier.name}'까지 ${remaining}pt` : ' · 모든 테마 해금 완료'}
          </p>
        </div>
        <ChevronRight size={16} className="text-label-assistive flex-shrink-0" />
      </button>
    </Card>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-fill transition-colors">
      <span className="text-label-alt">{icon}</span>
      <span className="text-body2 text-label flex-1">{label}</span>
      <ChevronRight size={16} className="text-label-assistive" />
    </button>
  );
}
