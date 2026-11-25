import { useEffect, useLayoutEffect, lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';
import { House as NavTree, ChartNoAxesColumn as NavBars, Users as NavPeople, UserRound as NavProfile } from './icons';
import { motion } from 'framer-motion';
import { useAuthStore } from './store/authStore';
import { useThemeStore, applyTheme } from './store/themeStore';
import { useRoutineStore } from './store/routineStore';
import { useNotificationScheduler } from './hooks/useNotificationScheduler';
import LoadingSpinner from './components/ui/LoadingSpinner';
import PageTransition from './components/ui/PageTransition';
import StageUpModal from './components/tree/StageUpModal';
import SlotUnlockModal from './components/ui/SlotUnlockModal';
import SlotUnlockWatcher from './components/SlotUnlockWatcher';
import GlobalAmbience from './components/tree/ThemeAmbience';
import { useTreeStageWatcher } from './hooks/useTreeStageWatcher';
import ErrorBoundary from './components/ui/ErrorBoundary';
import WidgetSync from './components/WidgetSync';
import DeepLinkHandler from './components/DeepLinkHandler';
import ToastHost from './components/ui/Toast';
import CommunityGate from './components/groups/CommunityGate';
import { usePasswordRecoveryStore } from './store/passwordRecoveryStore';
import SyncStatus from './components/SyncStatus';
import NotificationSyncStatus from './components/NotificationSyncStatus';
import NativeBackHandler from './components/NativeBackHandler';
import { useKeyboardInset } from './hooks/useKeyboardInset';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Stats = lazy(() => import('./pages/Stats'));
const Groups = lazy(() => import('./pages/Groups'));
const GroupNew = lazy(() => import('./pages/GroupNew'));
const GroupDetail = lazy(() => import('./pages/GroupDetail'));
const GroupInviteJoin = lazy(() => import('./pages/GroupInviteJoin'));
const RoutineShare = lazy(() => import('./pages/RoutineShare'));
const HabitNew = lazy(() => import('./pages/HabitNew'));
const TodoNew = lazy(() => import('./pages/TodoNew'));
const PersonalRoutineNew = lazy(() => import('./pages/PersonalRoutineNew'));
const FaithRoutineNew = lazy(() => import('./pages/FaithRoutineNew'));
const RoutineTimer = lazy(() => import('./pages/RoutineTimer'));
const HabitTimer = lazy(() => import('./pages/HabitTimer'));
const StreakDetail = lazy(() => import('./pages/StreakDetail'));
const ThemeRewards = lazy(() => import('./pages/ThemeRewards'));
const Archive = lazy(() => import('./pages/Archive'));
const Profile = lazy(() => import('./pages/Profile'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const WeeklyReviewPage = lazy(() => import('./pages/WeeklyReviewPage'));
const GoalConnect = lazy(() => import('./pages/GoalConnect'));
const MonthlyGoalNew = lazy(() => import('./pages/MonthlyGoalNew'));
const Goals = lazy(() => import('./pages/Goals'));
const GoalConflicts = lazy(() => import('./pages/GoalConflicts'));
const RecordConflicts = lazy(() => import('./pages/RecordConflicts'));
const PlanConflicts = lazy(() => import('./pages/PlanConflicts'));
const PracticeConflicts = lazy(() => import('./pages/PracticeConflicts'));
const ReviewResultPage = lazy(() => import('./pages/ReviewResultPage'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));
const Diary = lazy(() => import('./pages/Diary'));
const FaithNotes = lazy(() => import('./pages/FaithNotes'));

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
    { to: '/', icon: NavTree, label: '홈', matchPaths: ['/goals', '/review', '/faith-notes'] },
    { to: '/stats', icon: NavBars, label: '통계' },
  ],
  // 그룹 2: 소모임 (루틴공유는 백엔드 연결 전까지 네비에서 숨김 — 경로는 유지)
  [
    { to: '/groups', icon: NavPeople, label: '소모임' },
  ],
  // 그룹 3: 마이페이지
  [
    { to: '/profile', icon: NavProfile, label: '마이페이지' },
  ],
];

/** 하단 네비를 숨기는 경로 — 루트 하단 패딩(네비 자리)도 이 경로들에선 제거 */
function isNavHidden(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/auth/callback' ||
    pathname === '/reset-password' ||
    pathname === '/onboarding' ||
    pathname === '/goals/monthly/new' ||
    pathname.startsWith('/goals/monthly/edit/') ||
    pathname === '/groups/new' ||
    pathname === '/review' ||
    pathname === '/notification-settings' ||
    pathname === '/diary' ||
    pathname === '/faith-notes' ||
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

  const flatItems = NAV_GROUPS.flat();

  return (
    <nav aria-label="주요 메뉴" className="bottom-paper-nav fixed bottom-0 left-0 right-0 z-30 max-w-md mx-auto safe-bottom">
      <div className="flex items-stretch px-2">
        {flatItems.map(item => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <div key={item.to} className="flex flex-1">
              <NavLink
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[68px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${active ? 'text-primary' : 'text-label-alt'}`}
              >
                {active && (
                  <motion.span
                    layoutId="bottomNavPaper"
                    className="absolute top-2 left-1/2 -translate-x-1/2 h-8 w-12 rounded-full bg-accent"
                    transition={{ duration: 0.2, ease: 'easeOut' }}
                  />
                )}
                <motion.div className="relative flex h-8 items-center" whileTap={{ scale: 1.14, rotate: -3 }} transition={{ duration: 0.08 }}>
                  <Icon size={23} strokeWidth={active ? 2.4 : 1.8} />
                </motion.div>
                <span className={`relative ${active ? 'font-bold' : ''}`}>{item.label}</span>
              </NavLink>
            </div>
          );
        })}
      </div>
    </nav>
  );
}

function AppRoutes() {
  const { user, isAuthenticated, onboardingDone, authReady } = useAuthStore();
  const { userId: recoveryUserId, processing: checkingRecovery } = usePasswordRecoveryStore();
  const deduplicateFaithRoutines = useRoutineStore(s => s.deduplicateFaithRoutines);
  useNotificationScheduler();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) deduplicateFaithRoutines();
  }, [isAuthenticated, deduplicateFaithRoutines]);

  // 초기 세션 복원 전에는 라우팅 판단을 보류 (새로고침 시 로그인 화면 플래시 방지)
  if ((recoveryUserId || checkingRecovery) && location.pathname !== '/reset-password') return <Navigate to="/reset-password" replace />;
  if (!authReady && !(location.pathname === '/reset-password' && (recoveryUserId || checkingRecovery))) return <LoadingSpinner />;

  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes location={location} key={`${user?.id}:${location.pathname}`}>
          <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/signup" element={<PageTransition><Signup /></PageTransition>} />
          <Route path="/auth/callback" element={<PageTransition><AuthCallback /></PageTransition>} />
          <Route path="/reset-password" element={<PageTransition><ResetPassword /></PageTransition>} />
          <Route path="/onboarding" element={<PageTransition><Onboarding /></PageTransition>} />

          {!isAuthenticated ? (
            <Route path="*" element={<Navigate to="/login" replace />} />
          ) : !onboardingDone ? (
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          ) : (
            <>
              <Route path="/" element={<PageTransition><Dashboard /></PageTransition>} />
              <Route path="/stats" element={<PageTransition><Stats /></PageTransition>} />
          <Route path="/goals" element={<PageTransition><Goals /></PageTransition>} />
          <Route path="/goals/conflicts" element={<PageTransition><GoalConflicts /></PageTransition>} />
          <Route path="/records/conflicts" element={<RecordConflicts />} />
          <Route path="/plans/conflicts" element={<PlanConflicts />} />
              <Route path="/practices/conflicts" element={<PageTransition><PracticeConflicts /></PageTransition>} />
              <Route path="/goals/monthly" element={<Navigate to="/goals" replace />} />
              <Route path="/goals/:id/connect" element={<PageTransition><GoalConnect /></PageTransition>} />
              <Route path="/goals/monthly/new" element={<PageTransition><MonthlyGoalNew /></PageTransition>} />
              <Route path="/goals/monthly/edit/:id" element={<PageTransition><MonthlyGoalNew /></PageTransition>} />
              <Route path="/groups" element={<PageTransition><CommunityGate><Groups /></CommunityGate></PageTransition>} />
              <Route path="/groups/new" element={<PageTransition><CommunityGate><GroupNew /></CommunityGate></PageTransition>} />
              <Route path="/groups/invite" element={<PageTransition><CommunityGate><GroupInviteJoin /></CommunityGate></PageTransition>} />
              <Route path="/groups/:id" element={<PageTransition><CommunityGate><GroupDetail /></CommunityGate></PageTransition>} />
              <Route path="/share" element={<PageTransition><CommunityGate><RoutineShare /></CommunityGate></PageTransition>} />
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
              <Route path="/archive" element={<Archive />} />
              <Route path="/profile" element={<PageTransition><Profile /></PageTransition>} />
              <Route path="/review" element={<PageTransition><WeeklyReviewPage /></PageTransition>} />
              <Route path="/review/result/:week" element={<PageTransition><ReviewResultPage /></PageTransition>} />
              <Route path="/notification-settings" element={<PageTransition><NotificationSettings /></PageTransition>} />
              <Route path="/diary" element={<PageTransition><Diary /></PageTransition>} />
              <Route path="/faith-notes" element={<PageTransition><FaithNotes /></PageTransition>} />
            </>
          )}
        </Routes>
      </Suspense>
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
  useKeyboardInset();
  const { pathname } = useLocation();
  useLayoutEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return (
    <div
      className="app-shell max-w-md mx-auto min-h-dvh bg-surface-alt relative"
      style={isNavHidden(pathname) ? undefined : { paddingBottom: 'calc(5.5rem + var(--app-safe-bottom))' }}
    >
      {children}
    </div>
  );
}

function AppContent() {
  const { theme } = useThemeStore();
  // 앱 마운트 시 저장된 테마 즉시 적용
  applyTheme(theme);

  return (
    <QueryClientProvider client={queryClient}>
        <AppShell>
          <SyncStatus />
          <NotificationSyncStatus />
          <AppRoutes />
          <GlobalAmbience />
          <BottomNav />
          <StageUpModal />
          <SlotUnlockModal />
          <SlotUnlockWatcher />
          <TreeStageWatcher />
          <WidgetSync />
          <DeepLinkHandler />
          <NativeBackHandler />
          <ToastHost />
        </AppShell>
    </QueryClientProvider>
  );
}

const router = createBrowserRouter([{ path: '*', element: <AppContent /> }]);
export default function App() { return <RouterProvider router={router} />; }
