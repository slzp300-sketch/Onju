import { User, Bell, ChevronRight, LogOut, Palette, CalendarDays, Clock, Lock, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Card from '../components/ui/Card';
import SlotBadge from '../components/ui/SlotBadge';
import { useAuthStore } from '../store/authStore';
import { useGoalStore } from '../store/goalStore';
import { useSettingsStore } from '../store/settingsStore';
import { useThemeStore, THEME_TIERS } from '../store/themeStore';
import { useTreeGrowth } from '../hooks/useTreeGrowth';
import { STAGE_NAMES } from '../utils/treeGrowth';
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

      {/* 숲 테마 — 나무 성장으로 해금 */}
      <ThemeTierPicker />
    </div>
  );
}

function ThemeTierPicker() {
  const { theme, setTheme } = useThemeStore();
  const growth = useTreeGrowth();

  return (
    <div className="px-4">
      <div className="flex items-center gap-2 mb-1">
        <Palette size={14} className="text-label-alt" />
        <p className="text-body2 font-bold text-label-strong">숲 테마</p>
      </div>
      <p className="text-caption1 text-label-assistive mb-3">
        나무가 자랄 때마다 새로운 테마가 열려요 (현재 {growth.stageName} · {growth.points}pt)
      </p>
      <div className="grid grid-cols-2 gap-3">
        {THEME_TIERS.map(t => {
          const unlocked = growth.stage >= t.requiredStage;
          const isActive = theme === t.id;
          return (
            <motion.button
              key={t.id}
              whileTap={unlocked ? { scale: 0.98 } : undefined}
              transition={{ duration: 0.12 }}
              onClick={() => unlocked && setTheme(t.id)}
              disabled={!unlocked}
              className={`relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 text-left transition-all ${
                unlocked ? '' : 'opacity-60'
              }`}
              style={{
                backgroundColor: t.preview.bg,
                borderColor: isActive ? t.preview.accent : `${t.preview.accent}30`,
                boxShadow: isActive ? `0 2px 12px ${t.preview.accent}25` : 'none',
              }}
            >
              <div className="flex items-center gap-1.5 w-full">
                <div className="w-full h-2 rounded-full" style={{ backgroundColor: t.preview.leaf, opacity: 0.45 }} />
                <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.preview.accent }} />
              </div>
              <span className="text-body2 font-bold text-label-strong">{t.name}</span>
              <p className="text-caption2 text-label-alt">
                {unlocked ? t.description : `${STAGE_NAMES[t.requiredStage]}이 되면 열려요`}
              </p>
              {!unlocked && (
                <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-surface/80 flex items-center justify-center">
                  <Lock size={11} className="text-label-assistive" />
                </div>
              )}
              {isActive && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: t.preview.accent }}
                >
                  <Check size={11} className="text-white" strokeWidth={2.5} />
                </motion.div>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
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
