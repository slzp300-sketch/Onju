import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LayoutDashboard, Users, UserCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { useRoutineStore } from './store/routineStore';
import Dashboard from './pages/Dashboard';
import Today from './pages/Today';
import WeeklyGoals from './pages/WeeklyGoals';
import MonthlyGoals from './pages/MonthlyGoals';
import Routines from './pages/Routines';
import Stats from './pages/Stats';
import Groups from './pages/Groups';
import GroupNew from './pages/GroupNew';
import GroupDetail from './pages/GroupDetail';
import Profile from './pages/Profile';
import Onboarding from './pages/Onboarding';
import Login from './pages/Login';
import Signup from './pages/Signup';
import WeeklyReviewPage from './pages/WeeklyReviewPage';
import ReviewResultPage from './pages/ReviewResultPage';
import SlotUnlockModal from './components/ui/SlotUnlockModal';
import { useAuthStore } from './store/authStore';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 30 } },
});

// 홈 탭이 활성화되어야 하는 하위 경로들
const HOME_PATHS = ['/today', '/goals', '/routines', '/stats', '/review'];

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '홈' },
  { to: '/groups', icon: Users, label: '소모임' },
  { to: '/profile', icon: UserCircle, label: '마이' },
];

function BottomNavInner() {
  const location = useLocation();
  const hideNav =
    location.pathname === '/login' ||
    location.pathname === '/signup' ||
    location.pathname === '/onboarding' ||
    location.pathname === '/groups/new' ||
    location.pathname === '/review' ||
    location.pathname.startsWith('/review/result') ||
    (location.pathname.startsWith('/groups/') && location.pathname !== '/groups');

  if (hideNav) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 flex z-30 max-w-md mx-auto safe-bottom">
      {navItems.map(({ to, icon: Icon, label }) => {
        const active = to === '/'
          ? location.pathname === '/' || HOME_PATHS.some(p => location.pathname.startsWith(p))
          : location.pathname.startsWith(to);
        return (
          <NavLink
            key={to}
            to={to}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 text-xs font-medium transition-colors ${
              active ? 'text-indigo-600' : 'text-gray-400'
            }`}
          >
            <motion.div whileTap={{ scale: 1.25 }} transition={{ duration: 0.12 }}>
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
            </motion.div>
            <span>{label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}

function AppRoutes() {
  const { isAuthenticated, onboardingDone } = useAuthStore();
  const deduplicateFaithRoutines = useRoutineStore(s => s.deduplicateFaithRoutines);

  useEffect(() => {
    if (isAuthenticated) deduplicateFaithRoutines();
  }, [isAuthenticated, deduplicateFaithRoutines]);

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/onboarding" element={<Onboarding />} />

      {!isAuthenticated ? (
        <Route path="*" element={<Navigate to="/login" replace />} />
      ) : !onboardingDone ? (
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      ) : (
        <>
          <Route path="/" element={<Dashboard />} />
          <Route path="/today" element={<Today />} />
          <Route path="/goals/monthly" element={<MonthlyGoals />} />
          <Route path="/goals/weekly" element={<WeeklyGoals />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/groups" element={<Groups />} />
          <Route path="/groups/new" element={<GroupNew />} />
          <Route path="/groups/:id" element={<GroupDetail />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/review" element={<WeeklyReviewPage />} />
          <Route path="/review/result/:week" element={<ReviewResultPage />} />
        </>
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="max-w-md mx-auto min-h-dvh bg-gray-50 relative" style={{ paddingBottom: 'calc(5rem + env(safe-area-inset-bottom, 0px))' }}>
          <AppRoutes />
          <BottomNavInner />
          <SlotUnlockModal />
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
