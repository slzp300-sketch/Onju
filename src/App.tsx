import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { BarChart2, Users, UserCircle, TreePine } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from './store/authStore';
import { useThemeStore, applyTheme } from './store/themeStore';
import { useRoutineStore } from './store/routineStore';
import { useNotificationScheduler } from './hooks/useNotificationScheduler';
import LoadingSpinner from './components/ui/LoadingSpinner';
import PageTransition from './components/ui/PageTransition';
import SlotUnlockModal from './components/ui/SlotUnlockModal';
import StageUpModal from './components/tree/StageUpModal';
import GlobalAmbience from './components/tree/ThemeAmbience';
import { useTreeStageWatcher } from './hooks/useTreeStageWatcher';
import ErrorBoundary from './components/ui/ErrorBoundary';
import WidgetSync from './components/WidgetSync';
import DeepLinkHandler from './components/DeepLinkHandler';
import ToastHost from './components/ui/Toast';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Today = lazy(() => import('./pages/Today'));
const Stats = lazy(() => import('./pages/Stats'));
const WeeklyGoals = lazy(() => import('./pages/WeeklyGoals'));
const MonthlyGoals = lazy(() => import('./pages/MonthlyGoals'));
const Routines = lazy(() => import('./pages/Routines'));
const Groups = lazy(() => import('./pages/Groups'));
const GroupNew = lazy(() => import('./pages/GroupNew'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));
const RoutineShare = lazy(() => import('./pages/RoutineShare'));
const HabitNew = lazy(() => import('./pages/HabitNew'));
const TodoNew = lazy(() => import('./pages/TodoNew'));
const PersonalRoutineNew = lazy(() => import('./pages/PersonalRoutineNew'));
const FaithRoutineNew = lazy(() => import('./pages/FaithRoutineNew'));
const RoutineTimer = lazy(() => import('./pages/RoutineTimer'));
const HabitTimer = lazy(() => import('./pages/HabitTimer'));
const StreakDetail = lazy(() => import('./pages/StreakDetail'));
const ThemeRewards = lazy(() => import('./pages/ThemeRewards'));
const Profile = lazy(() => import('./pages/Profile'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const WeeklyReviewPage = lazy(() => import('./pages/WeeklyReviewPage'));
const MonthlyGoalNew = lazy(() => import('./pages/MonthlyGoalNew'));
const Goals = lazy(() => import('./pages/Goals'));
const ReviewResultPage = lazy(() => import('./pages/ReviewResultPage'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const Diary = lazy(() => import('./pages/Diary'));

/* ──────────────────────────────────────────
   하단 네비게이션 아이템 정의
   groups: 시각적 구분선을 넣을 위치
────────────────────────────────────────── */
type NavItem = {
  to: string;
  icon: React.ElementType;
  label: string;
  matchPaths?: string[]; // 추가로 활성화될 경로들
};

const NAV_GROUPS: NavItem[][] = [
  // 그룹 1: 홈, 통계
  [
    { to: '/', icon: TreePine, label: '홈', matchPaths: ['/today', '/goals', '/routines', '/review'] },
    { to: '/stats', icon: BarChart2, label: '통계' },
  ],
  // 그룹 2: 소모임 (루틴공유는 백엔드 연결 전까지 네비에서 숨김 — 경로는 유지)
  [
    { to: '/groups', icon: Users, label: '소모임' },
  ],
  // 그룹 3: 마이페이지
  [
    { to: '/profile', icon: UserCircle, label: '마이페이지' },
  ],
];

/** 하단 네비를 숨기는 경로 — 루트 하단 패딩(네비 자리)도 이 경로들에선 제거 */
function isNavHidden(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/auth/callback' ||
    pathname === '/onboarding' ||
    pathname === '/goals/monthly/new' ||
    pathname.startsWith('/goals/monthly/edit/') ||
    pathname === '/groups/new' ||
    pathname === '/review' ||
    pathname === '/notification-settings' ||
    pathname === '/diary' ||
    pathname === '/streak' ||
    pathname === '/themes' ||
    pathname.startsWith('/routine-timer/') ||
    pathname.startsWith('/todos/') ||
    pathname.startsWith('/habits/') ||
    pathname.startsWith('/personal-routines/') ||
    pathname.startsWith('/faith-routines/') ||
    pathname.startsWith('/review/result') ||
    (pathname.startsWith('/groups/') && pathname !== '/groups')
  );
}

function BottomNav() {
  const location = useLocation();

  if (isNavHidden(location.pathname)) return null;

  const isActive = (item: NavItem) => {
    if (item.to === '/') {
      return location.pathname === '/' || (item.matchPaths ?? []).some(p => location.pathname.startsWith(p));
    }
    return location.pathname.startsWith(item.to);
  };

  // 플랫 리스트로 변환 + 그룹 경계 위치 계산
  const flatItems = NAV_GROUPS.flatMap((group, gIdx) =>
    group.map((item, iIdx) => ({ ...item, dividerBefore: iIdx === 0 && gIdx > 0 }))
  );

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-sm border-t border-line-soft z-30 max-w-md mx-auto safe-bottom">
      <div className="flex items-stretch" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {flatItems.map(item => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <div key={item.to} className="flex flex-1">
              {item.dividerBefore && (
                <div className="w-px bg-line-soft my-2 flex-shrink-0" />
              )}
              <NavLink
                to={item.to}
                className={`relative flex-1 flex flex-col items-center gap-1 py-3.5 text-[12px] font-medium transition-colors ${active ? 'text-primary' : 'text-label-assistive'}`}
              >
                <motion.div whileTap={{ scale: 1.2 }} transition={{ duration: 0.08 }}>
                  <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
                </motion.div>
                <span className={active ? 'font-semibold' : ''}>{item.label}</span>
              </NavLink>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function AppRoutes() {
  const { isAuthenticated, onboardingDone, authReady } = useAuthStore();
  const deduplicateFaithRoutines = useRoutineStore(s => s.deduplicateFaithRoutines);
  useNotificationScheduler();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) deduplicateFaithRoutines();
  }, [isAuthenticated, deduplicateFaithRoutines]);

  // 초기 세션 복원 전에는 라우팅 판단을 보류 (새로고침 시 로그인 화면 플래시 방지)
  if (!authReady) return <LoadingSpinner />;

  return (
    <ErrorBoundary>
    <AnimatePresence mode="wait">
      <Suspense fallback={<LoadingSpinner />}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/signup" element={<PageTransition><Signup /></PageTransition>} />
          <Route path="/auth/callback" element={<PageTransition><AuthCallback /></PageTransition>} />
          <Route path="/onboarding" element={<PageTransition><Onboarding /></PageTransition>} />

          {!isAuthenticated ? (
            <Route path="*" element={<Navigate to="/login" replace />} />
          ) : !onboardingDone ? (
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          ) : (
            <>
              <Route path="/" element={<PageTransition><Dashboard /></PageTransition>} />
              <Route path="/today" element={<PageTransition><Today /></PageTransition>} />
              <Route path="/stats" element={<PageTransition><Stats /></PageTransition>} />
              <Route path="/goals" element={<PageTransition><Goals /></PageTransition>} />
              <Route path="/goals/monthly" element={<PageTransition><MonthlyGoals /></PageTransition>} />
              <Route path="/goals/monthly/new" element={<PageTransition><MonthlyGoalNew /></PageTransition>} />
              <Route path="/goals/monthly/edit/:id" element={<PageTransition><MonthlyGoalNew /></PageTransition>} />
              <Route path="/goals/weekly" element={<PageTransition><WeeklyGoals /></PageTransition>} />
              <Route path="/routines" element={<PageTransition><Routines /></PageTransition>} />
              <Route path="/groups" element={<PageTransition><Groups /></PageTransition>} />
              <Route path="/groups/new" element={<PageTransition><GroupNew /></PageTransition>} />
              <Route path="/groups/:id" element={<PageTransition><GroupDetail /></PageTransition>} />
              <Route path="/share" element={<PageTransition><RoutineShare /></PageTransition>} />
              <Route path="/habits/new" element={<HabitNew />} />
              <Route path="/habits/edit/:id" element={<HabitNew />} />
              <Route path="/personal-routines/new" element={<PersonalRoutineNew />} />
              <Route path="/personal-routines/edit/:id" element={<PersonalRoutineNew />} />
              <Route path="/faith-routines/new" element={<FaithRoutineNew />} />
              <Route path="/faith-routines/edit/:id" element={<FaithRoutineNew />} />
              <Route path="/todos/new" element={<TodoNew />} />
              <Route path="/todos/edit/:id" element={<TodoNew />} />
              <Route path="/routine-timer/:id" element={<RoutineTimer />} />
              <Route path="/habit-timer/:id" element={<HabitTimer />} />
              <Route path="/streak" element={<StreakDetail />} />
              <Route path="/themes" element={<ThemeRewards />} />
              <Route path="/profile" element={<PageTransition><Profile /></PageTransition>} />
              <Route path="/review" element={<PageTransition><WeeklyReviewPage /></PageTransition>} />
              <Route path="/review/result/:week" element={<PageTransition><ReviewResultPage /></PageTransition>} />
              <Route path="/notification-settings" element={<PageTransition><NotificationSettings /></PageTransition>} />
              <Route path="/diary" element={<PageTransition><Diary /></PageTransition>} />
            </>
          )}
        </Routes>
      </Suspense>
    </AnimatePresence>
    </ErrorBoundary>
  );
}

/** 나무 단계 워처 — 훅을 컴포넌트로 감싸 BrowserRouter/QueryClient 안에서 실행 */
function TreeStageWatcher() {
  useTreeStageWatcher();
  return null;
}

/** 루트 셸 — 네비가 보이는 경로에서만 하단 패딩(네비 높이)을 적용 */
function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div
      className="max-w-md mx-auto min-h-dvh bg-surface-alt relative"
      style={isNavHidden(pathname) ? undefined : { paddingBottom: 'calc(5.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {children}
    </div>
  );
}

export default function App() {
  const { theme } = useThemeStore();
  // 앱 마운트 시 저장된 테마 즉시 적용
  applyTheme(theme);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell>
          <AppRoutes />
          <GlobalAmbience />
          <BottomNav />
          <SlotUnlockModal />
          <StageUpModal />
          <TreeStageWatcher />
          <WidgetSync />
          <DeepLinkHandler />
          <ToastHost />
        </AppShell>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
