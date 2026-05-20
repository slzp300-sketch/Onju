import { useNavigate } from 'react-router-dom';
import { CheckSquare, Target, Calendar, ListChecks, BarChart2, ChevronRight, Flame } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { useRoutineStore } from '../store/routineStore';
import { useGoalStore } from '../store/goalStore';
import { useAuthStore } from '../store/authStore';
import { getTodayRates, calcStreak } from '../utils/completion';
import { formatDisplay, today, isSunday, currentWeek, currentYear, isReviewCompleted, getWeekRangeText } from '../utils/date';
import ReviewBanner from '../components/review/ReviewBanner';
import { fetchReviews } from '../api/reviews';

const HOME_SUB_PATHS = ['/today', '/goals', '/routines', '/stats', '/review'];

export { HOME_SUB_PATHS };

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { personalRoutines, faithRoutines, logs, isCompleted } = useRoutineStore();
  const { weeklyGoals, monthlyGoals } = useGoalStore();

  const todayStr = today();
  const { personal: personalRate, faith: faithRate } = getTodayRates(
    personalRoutines, faithRoutines, logs, todayStr
  );
  const { current: streak } = calcStreak([...personalRoutines, ...faithRoutines], logs, todayStr);
  const completedPersonal = personalRoutines.filter(r => isCompleted(r.id)).length;
  const completedFaith = faithRoutines.filter(r => isCompleted(r.id)).length;

  const thisWeekGoals = weeklyGoals.filter(
    g => g.weekNumber === currentWeek() && g.year === currentYear()
  );
  const thisMonthGoals = monthlyGoals.filter(
    g => g.month === new Date().getMonth() + 1 && g.year === new Date().getFullYear()
  );

  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });

  const menuItems = [
    {
      icon: CheckSquare,
      label: '오늘 루틴 체크',
      sub: personalRoutines.length + faithRoutines.length === 0
        ? '루틴을 추가해 보세요'
        : `개인 ${completedPersonal}/${personalRoutines.length} · 신앙 ${completedFaith}/${faithRoutines.length}`,
      to: '/today',
      color: 'indigo' as const,
    },
    {
      icon: Target,
      label: '주간 목표',
      sub: `${thisWeekGoals.length}/${user?.weeklyGoalSlots ?? 3} 슬롯 사용 중`,
      to: '/goals/weekly',
      color: 'indigo' as const,
    },
    {
      icon: Calendar,
      label: '월간 목표',
      sub: thisMonthGoals.length === 0 ? '이번 달 목표를 세워보세요' : `이번 달 ${thisMonthGoals.length}개`,
      to: '/goals/monthly',
      color: 'indigo' as const,
    },
    {
      icon: ListChecks,
      label: '루틴 설정',
      sub: `개인 ${personalRoutines.length}개 · 신앙 ${faithRoutines.length}개`,
      to: '/routines',
      color: 'emerald' as const,
    },
    {
      icon: BarChart2,
      label: '통계',
      sub: streak > 0 ? `${streak}일 연속 달성 중` : '달성 기록을 쌓아가세요',
      to: '/stats',
      color: 'violet' as const,
    },
  ];

  const iconClass = {
    indigo: { bg: 'bg-indigo-50', text: 'text-indigo-500' },
    emerald: { bg: 'bg-emerald-50', text: 'text-emerald-500' },
    violet: { bg: 'bg-violet-50', text: 'text-violet-500' },
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08,
        delayChildren: 0.05,
      },
    },
  } as const;

  const itemVariants = {
    hidden: { opacity: 0, y: 16 },
    show: {
      opacity: 1,
      y: 0,
      transition: {
        type: 'spring',
        stiffness: 260,
        damping: 24,
      },
    },
  } as const;

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="flex flex-col gap-4 pb-4"
    >
      {/* 헤더 */}
      <motion.div variants={itemVariants} className="px-4 pt-5 flex items-start justify-between">
        <div>
          <p className="text-xs text-gray-400">{formatDisplay(new Date())}</p>
          <h1 className="text-lg font-bold text-gray-900 mt-0.5">
            안녕하세요, {user?.name}님
          </h1>
        </div>
        {streak > 0 && (
          <div className="flex items-center gap-1 bg-orange-50 px-2.5 py-1.5 rounded-xl mt-1">
            <Flame size={14} className="text-orange-400" />
            <span className="text-xs font-semibold text-orange-500">{streak}일</span>
          </div>
        )}
      </motion.div>

      {/* 오늘 현황 카드 */}
      <motion.div variants={itemVariants} className="mx-4 bg-indigo-500 rounded-2xl p-4 text-white">
        <p className="text-xs opacity-70 mb-3">오늘의 달성률</p>
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-bold">{personalRate}%</p>
            <p className="text-xs opacity-70 mt-0.5">개인 루틴</p>
          </div>
          <div className="w-px bg-white/20" />
          <div>
            <p className="text-2xl font-bold">{faithRate}%</p>
            <p className="text-xs opacity-70 mt-0.5">신앙 루틴</p>
          </div>
        </div>
      </motion.div>

      {/* 일요일 리뷰 배너 */}
      {isSunday() && (
        <motion.div variants={itemVariants} className="px-4">
          <ReviewBanner
            completed={isReviewCompleted(reviews, currentWeek(), currentYear())}
            weekRangeText={getWeekRangeText()}
            onStart={() => navigate('/review')}
          />
        </motion.div>
      )}

      {/* 목차 */}
      <motion.div variants={itemVariants} className="px-4 flex flex-col gap-2">
        <p className="text-xs font-semibold text-gray-400 px-1 mb-1">관리 메뉴</p>
        <div className="flex flex-col gap-2">
          {menuItems.map(item => {
            const cls = iconClass[item.color];
            return (
              <motion.button
                key={item.to}
                onClick={() => navigate(item.to)}
                whileTap={{ scale: 0.98 }}
                whileHover={{ scale: 1.01 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="flex items-center gap-3 bg-white rounded-2xl px-4 py-3.5 border border-gray-100 text-left w-full active:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cls.bg}`}>
                  <item.icon size={18} className={cls.text} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{item.sub}</p>
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}
