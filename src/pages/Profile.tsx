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
        <h1 className="text-lg font-bold text-gray-900">프로필</h1>
      </div>

      {/* 유저 정보 */}
      <Card className="mx-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
            <User size={22} className="text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900">{user!.name}</p>
            <p className="text-xs text-gray-400">{user!.email}</p>
          </div>
        </div>
      </Card>

      {/* 주간 슬롯 현황 */}
      <Card className="mx-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">주간 목표 슬롯</p>
        <SlotBadge total={user!.weeklyGoalSlots} used={thisWeekGoalCount} />
        <p className="text-xs text-gray-400 mt-2">지난 주 달성률 80% 이상 시 슬롯이 늘어납니다 (최대 5개)</p>
      </Card>

      {/* 설정 메뉴 */}
      <Card className="mx-4" padding="none">
        <MenuItem icon={<Bell size={16} />} label="알림 설정" onClick={() => navigate('/notification-settings')} />
        <div className="h-px bg-gray-100 mx-4" />
        <button
          onClick={() => { logout(); navigate('/login', { replace: true }); }}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors"
        >
          <LogOut size={16} className="text-red-400" />
          <span className="text-sm text-red-400 flex-1">로그아웃</span>
        </button>
      </Card>

      {/* 테마 설정 */}
      <div className="px-4">
        <div className="flex items-center gap-2 mb-3">
          <Palette size={14} className="text-gray-500" />
          <p className="text-sm font-bold text-gray-900">테마</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {THEMES.map(t => {
            const isActive = theme === t.id;
            // 각 테마의 텍스트 색상
            const textColors: Record<string, { title: string; desc: string; border: string; check: string }> = {
              light:  { title: '#1a1d23', desc: '#6e7585', border: '#c8c9f7', check: '#6366f1' },
              dark:   { title: '#e8eaf0', desc: '#8b90a4', border: '#3a3d6a', check: '#7c7ff5' },
              rose:   { title: '#2d1a1e', desc: '#8a5460', border: '#f0a0b0', check: '#d4546a' },
              forest: { title: '#1e2a1a', desc: '#617558', border: '#9dbf97', check: '#5e8f6a' },
            };
            const tc = textColors[t.id];
            return (
              <motion.button
                key={t.id}
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
                onClick={() => setTheme(t.id as ThemeId)}
                className="relative flex flex-col items-start gap-2 p-4 rounded-2xl border-2 transition-all"
                style={{
                  backgroundColor: t.preview.bg,
                  borderColor: isActive ? tc.check : `${tc.border}60`,
                  boxShadow: isActive ? `0 2px 12px ${tc.check}30` : 'none',
                }}
              >
                {/* 미리보기 바 */}
                <div className="flex items-center gap-1.5 w-full">
                  <div className="w-full h-2 rounded-full" style={{ backgroundColor: t.preview.card, border: `1px solid ${tc.border}50` }} />
                  <div className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: t.preview.accent }} />
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-lg">{t.emoji}</span>
                  <span className="text-sm font-bold" style={{ color: tc.title }}>
                    {t.name}
                  </span>
                </div>
                <p className="text-[11px]" style={{ color: tc.desc }}>
                  {t.description}
                </p>
                {/* 활성 체크 */}
                {isActive && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
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
    <button onClick={onClick} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 transition-colors">
      <span className="text-gray-500">{icon}</span>
      <span className="text-sm text-gray-800 flex-1">{label}</span>
      <ChevronRight size={16} className="text-gray-300" />
    </button>
  );
}
