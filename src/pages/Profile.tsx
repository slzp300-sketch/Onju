import { User, Bell, ChevronRight, LogOut, Palette } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Card from '../components/ui/Card';
import SlotBadge from '../components/ui/SlotBadge';
import { useAuthStore } from '../store/authStore';
import { useGoalStore } from '../store/goalStore';
import { useThemeStore, THEMES, type ThemeId } from '../store/themeStore';
import { currentWeek, currentYear } from '../utils/date';

export default function Profile() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { weeklyGoals } = useGoalStore();
  const { theme, setTheme } = useThemeStore();

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

      {/* 테마 설정 */}
      <div className="px-4">
        <div className="flex items-center gap-2 mb-3">
          <Palette size={14} className="text-label-alt" />
          <p className="text-body2 font-bold text-label-strong">테마</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {THEMES.map(t => {
            const isActive = theme === t.id;
            const textColors: Record<string, { title: string; desc: string; border: string; check: string }> = {
              light:  { title: '#171719', desc: 'rgba(55,56,60,0.61)', border: '#0066ff', check: '#0066ff' },
              dark:   { title: '#e8eaf0', desc: '#8b90a4', border: '#7c7ff5', check: '#7c7ff5' },
              rose:   { title: '#2d1a1e', desc: '#8a5460', border: '#d4546a', check: '#d4546a' },
              forest: { title: '#1e2a1a', desc: '#617558', border: '#5e8f6a', check: '#5e8f6a' },
            };
            const tc = textColors[t.id];
            return (
              <motion.button
                key={t.id}
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.12 }}
                onClick={() => setTheme(t.id as ThemeId)}
                className="relative flex flex-col items-start gap-2 p-4 rounded-xl border-2 transition-all"
                style={{
                  backgroundColor: t.preview.bg,
                  borderColor: isActive ? tc.check : `${tc.border}30`,
                  boxShadow: isActive ? `0 2px 12px ${tc.check}25` : 'none',
                }}
              >
                <div className="flex items-center gap-1.5 w-full">
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: t.preview.card, border: `1px solid ${tc.border}30` }} />
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.preview.accent }} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-body2 font-bold" style={{ color: tc.title }}>
                    {t.name}
                  </span>
                </div>
                <p className="text-caption2" style={{ color: tc.desc }}>
                  {t.description}
                </p>
                {isActive && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: tc.check }}
                  >
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </motion.div>
                )}
              </motion.button>
            );
          })}
        </div>
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
