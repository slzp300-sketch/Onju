import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BarChart2, Users, UserCircle, LayoutDashboard, Share2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from './store/authStore';
import { useRoutineStore } from './store/routineStore';
import { useNotificationScheduler } from './hooks/useNotificationScheduler';
import LoadingSpinner from './components/ui/LoadingSpinner';
import PageTransition from './components/ui/PageTransition';
import SlotUnlockModal from './components/ui/SlotUnlockModal';

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
const Profile = lazy(() => import('./pages/Profile'));
const Onboarding = lazy(() => import('./pages/Onboarding'));
const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const WeeklyReviewPage = lazy(() => import('./pages/WeeklyReviewPage'));
const ReviewResultPage = lazy(() => import('./pages/ReviewResultPage'));
const NotificationSettings = lazy(() => import('./pages/NotificationSettings'));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 30 } },
});

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
    { to: '/', icon: LayoutDashboard, label: '홈', matchPaths: ['/today', '/goals', '/routines', '/review'] },
    { to: '/stats', icon: BarChart2, label: '통계' },
  ],
  // 그룹 2: 소모임, 루틴공유
  [
    { to: '/groups', icon: Users, label: '소모임' },
    { to: '/share', icon: Share2, label: '루틴공유' },
  ],
  // 그룹 3: 마이페이지
  [
    { to: '/profile', icon: UserCircle, label: '마이페이지' },
  ],
];

function BottomNav() {
  const location = useLocation();

  const hideNav =
    location.pathname === '/login' ||
    location.pathname === '/signup' ||
    location.pathname === '/onboarding' ||
    location.pathname === '/groups/new' ||
    location.pathname === '/review' ||
    location.pathname === '/notification-settings' ||
    location.pathname.startsWith('/todos/') ||
    location.pathname.startsWith('/habits/') ||
    location.pathname.startsWith('/personal-routines/') ||
    location.pathname.startsWith('/faith-routines/') ||
    location.pathname.startsWith('/review/result') ||
    (location.pathname.startsWith('/groups/') && location.pathname !== '/groups');

  if (hideNav) return null;

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
    <nav className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-100 z-30 max-w-md mx-auto safe-bottom">
      <div className="flex items-stretch" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {flatItems.map(item => {
          const active = isActive(item);
          const Icon = item.icon;
          return (
            <div key={item.to} className="flex flex-1">
              {/* 그룹 사이 구분선 */}
              {item.dividerBefore && (
                <div className="w-px bg-gray-100 my-2 flex-shrink-0" />
              )}
              <NavLink
                to={item.to}
                className={`relative flex-1 flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium transition-colors ${active ? 'text-indigo-600' : 'text-gray-400'}`}
              >
                {active && (
                  <motion.span
                    layoutId="activeTabPill"
                    className="absolute inset-x-2 top-1.5 bottom-1.5 bg-indigo-50/80 rounded-2xl -z-10"
                    transition={{ type: 'spring', stiffness: 650, damping: 28 }}
                  />
                )}
                <motion.div whileTap={{ scale: 1.2 }} transition={{ duration: 0.08 }}>
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
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
  const { isAuthenticated, onboardingDone } = useAuthStore();
  const deduplicateFaithRoutines = useRoutineStore(s => s.deduplicateFaithRoutines);
  useNotificationScheduler();
  const location = useLocation();

  useEffect(() => {
    if (isAuthenticated) deduplicateFaithRoutines();
  }, [isAuthenticated, deduplicateFaithRoutines]);

  return (
    <AnimatePresence mode="wait">
      <Suspense fallback={<LoadingSpinner />}>
        <Routes location={location} key={location.pathname}>
          <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/signup" element={<PageTransition><Signup /></PageTransition>} />
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
              <Route path="/goals/monthly" element={<PageTransition><MonthlyGoals /></PageTransition>} />
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
              <Route path="/profile" element={<PageTransition><Profile /></PageTransition>} />
              <Route path="/review" element={<PageTransition><WeeklyReviewPage /></PageTransition>} />
              <Route path="/review/result/:week" element={<PageTransition><ReviewResultPage /></PageTransition>} />
              <Route path="/notification-settings" element={<PageTransition><NotificationSettings /></PageTransition>} />
            </>
          )}
        </Routes>
      </Suspense>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="max-w-md mx-auto min-h-dvh bg-gray-50 relative" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
          <AppRoutes />
          <BottomNav />
          <SlotUnlockModal />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
