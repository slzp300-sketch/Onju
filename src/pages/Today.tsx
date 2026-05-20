import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { useQuery } from '@tanstack/react-query';
import Card from '../components/ui/Card';
import HeatMap from '../components/ui/HeatMap';
import DailyProgress from '../components/routines/DailyProgress';
import RoutineTrackA from '../components/routines/RoutineTrackA';
import RoutineTrackB from '../components/routines/RoutineTrackB';
import StreakCounter from '../components/ui/StreakCounter';
import ReviewBanner from '../components/review/ReviewBanner';
import { useRoutineStore } from '../store/routineStore';
import { useAuthStore } from '../store/authStore';
import { formatDisplay, today, isSunday, getWeekRangeText, currentWeek, currentYear, isReviewCompleted } from '../utils/date';
import { getTodayRates, calcStreak } from '../utils/completion';
import { fetchReviews } from '../api/reviews';

export default function Today() {
  const navigate = useNavigate();
  const { personalRoutines, faithRoutines, logs } = useRoutineStore();
  const { user } = useAuthStore();
  const todayStr = today();
  const prevCompleteRef = useRef(false);

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews'],
    queryFn: fetchReviews,
  });

  const todayLogs = logs.filter(l => l.date === todayStr);
  const { personal, faith } = getTodayRates(personalRoutines, faithRoutines, todayLogs, todayStr);
  const allDone = personalRoutines.length > 0 && faithRoutines.length > 0 && personal === 100 && faith === 100;

  const { current: pStreak, best: pBest } = calcStreak(personalRoutines, logs, todayStr);
  const { current: fStreak, best: fBest } = calcStreak(faithRoutines, logs, todayStr);

  // 전체 완료 시 confetti 한 번만
  useEffect(() => {
    if (allDone && !prevCompleteRef.current) {
      confetti({ particleCount: 80, spread: 60, origin: { y: 0.3 }, colors: ['#1D9E75', '#378ADD', '#7F77DD'] });
    }
    prevCompleteRef.current = allDone;
  }, [allDone]);

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* 헤더 */}
      <div className="px-4 pt-5">
        <p className="text-xs text-gray-400 font-medium">{formatDisplay(new Date())}</p>
        <h1 className="text-lg font-bold text-gray-900 mt-0.5">
          안녕하세요, {user?.name.slice(-2)}님
        </h1>
      </div>

      {/* 일요일 리뷰 배너 */}
      {isSunday() && (
        <div className="px-4">
          <ReviewBanner
            completed={isReviewCompleted(reviews, currentWeek(), currentYear())}
            weekRangeText={getWeekRangeText()}
            onStart={() => navigate('/review')}
          />
        </div>
      )}

      {/* 스트릭 카운터 */}
      <div className="px-4">
        <StreakCounter
          personalStreak={pStreak}
          faithStreak={fStreak}
          personalBest={pBest}
          faithBest={fBest}
        />
      </div>

      {/* 오늘 달성률 */}
      <Card className="mx-4">
        <p className="text-xs font-semibold text-gray-500 mb-3">오늘의 달성률</p>
        <DailyProgress />
      </Card>

      {/* 주간 히트맵 */}
      <Card className="mx-4">
        <p className="text-xs font-semibold text-gray-500 mb-3">이번 주 현황</p>
        <HeatMap personalRoutines={personalRoutines} faithRoutines={faithRoutines} logs={logs} />
        <div className="flex gap-3 mt-3">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-indigo-400" />
            <span className="text-xs text-gray-400">개인</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
            <span className="text-xs text-gray-400">신앙</span>
          </div>
        </div>
      </Card>

      {/* 개인 루틴 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-900">개인 루틴</p>
          <span className="text-xs text-gray-400">{personalRoutines.length}개</span>
        </div>
        <RoutineTrackA />
      </Card>

      {/* 신앙 루틴 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-900">신앙 루틴</p>
          <span className="text-xs text-gray-400">{faithRoutines.length}개</span>
        </div>
        <RoutineTrackB />
      </Card>
    </div>
  );
}
