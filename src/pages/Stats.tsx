import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ChevronRight, Flame, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { format, startOfWeek, addDays, startOfMonth, endOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import Card from '../components/ui/Card';
import MonthlyCalendar from '../components/ui/MonthlyCalendar';
import { useRoutineStore } from '../store/routineStore';
import { useTodoStore } from '../store/todoStore';
import { useAuthStore } from '../store/authStore';
import { calcStreak, getRoutineStats, getTodayRates } from '../utils/completion';
import { today } from '../utils/date';
import { fetchReviews } from '../api/reviews';

type TabType = 'daily' | 'weekly' | 'monthly';

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];
const MOOD_EMOJI: Record<string, string> = { hard: '😓', normal: '😊', easy: '😌' };

function getDayRate(
  routines: import('../types').DailyRoutine[],
  logs: import('../types').RoutineLog[],
  dateStr: string
): number {
  if (routines.length === 0) return 0;
  const done = new Set(logs.filter(l => l.date === dateStr && l.completed).map(l => l.routineId));
  return Math.round((routines.filter(r => done.has(r.id)).length / routines.length) * 100);
}

export default function Stats() {
  const [activeTab, setActiveTab] = useState<TabType>('daily');

  return (
    <div className="flex flex-col min-h-full">
      {/* 헤더 */}
      <div className="px-4 pt-5 pb-3">
        <h1 className="text-lg font-bold text-gray-900">통계</h1>
      </div>

      {/* 탭 바 */}
      <div className="px-4 mb-1">
        <div className="flex bg-gray-100 rounded-2xl p-1">
          {([
            { key: 'daily' as TabType, label: '일간' },
            { key: 'weekly' as TabType, label: '주간' },
            { key: 'monthly' as TabType, label: '월간' },
          ]).map(tab => (
            <motion.button
              key={tab.key}
              whileTap={{ scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              onClick={() => setActiveTab(tab.key)}
              className={`relative flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
                activeTab === tab.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-400'
              }`}
            >
              {tab.label}
            </motion.button>
          ))}
        </div>
      </div>

      {/* 탭 콘텐츠 */}
      <AnimatePresence mode="wait">
        {activeTab === 'daily' && (
          <motion.div key="daily" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18 }}>
            <DailyTab />
          </motion.div>
        )}
        {activeTab === 'weekly' && (
          <motion.div key="weekly" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18 }}>
            <WeeklyTab />
          </motion.div>
        )}
        {activeTab === 'monthly' && (
          <motion.div key="monthly" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.18 }}>
            <MonthlyTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ════════════════════════════════════════
   일간 탭
════════════════════════════════════════ */
function DailyTab() {
  const { faithRoutines, logs, isCompleted } = useRoutineStore();
  const { todos } = useTodoStore();
  const todayStr = today();
  const now = new Date();

  const { faith } = getTodayRates([], faithRoutines, logs, todayStr);
  const { current: streak, best } = calcStreak(faithRoutines, logs, todayStr);

  const todayTodos = todos.filter(t => t.date === todayStr);
  const todoRate = todayTodos.length > 0
    ? Math.round((todayTodos.filter(t => t.completed).length / todayTodos.length) * 100)
    : 0;

  const completedRoutines = faithRoutines.filter(r => isCompleted(r.id));
  const pendingRoutines = faithRoutines.filter(r => !isCompleted(r.id));

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      {/* 날짜 */}
      <div>
        <p className="text-base font-bold text-gray-900">{format(now, 'M월 d일 (EEEE)', { locale: ko })}</p>
        <p className="text-xs text-gray-400 mt-0.5">오늘의 달성 현황</p>
      </div>

      {/* 달성률 3칸 */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="신앙 루틴" value={`${faith}%`} color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard label="투두 완료" value={todayTodos.length > 0 ? `${todoRate}%` : '-'} color="text-indigo-600" bg="bg-indigo-50" />
        <StatCard
          label="연속 달성"
          value={`${streak}일`}
          sub={`최고 ${best}일`}
          color="text-orange-500"
          bg="bg-orange-50"
          icon={<Flame size={13} className="text-orange-400" />}
        />
      </div>

      {/* 루틴 체크 현황 */}
      <Card>
        <p className="text-xs font-bold text-gray-500 mb-3">오늘 루틴 현황</p>
        {faithRoutines.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">등록된 루틴이 없어요</p>
        ) : (
          <div className="flex flex-col gap-1">
            {completedRoutines.length > 0 && completedRoutines.map(r => (
              <div key={r.id} className="flex items-center gap-2.5 py-2">
                <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                <span className="text-sm text-gray-400 line-through">{r.title}</span>
              </div>
            ))}
            {pendingRoutines.map(r => (
              <div key={r.id} className="flex items-center gap-2.5 py-2">
                <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                <span className="text-sm text-gray-700">{r.title}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 투두 현황 */}
      <Card>
        <p className="text-xs font-bold text-gray-500 mb-3">오늘 투두 현황</p>
        {todayTodos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">등록된 투두가 없어요</p>
        ) : (
          <div className="flex flex-col gap-1">
            {todayTodos.map(t => (
              <div key={t.id} className="flex items-center gap-2.5 py-2">
                {t.completed
                  ? <CheckCircle2 size={16} className="text-indigo-400 flex-shrink-0" />
                  : <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />
                }
                <span className={`text-sm ${t.completed ? 'line-through text-gray-400' : 'text-gray-700'}`}>{t.title}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ════════════════════════════════════════
   주간 탭
════════════════════════════════════════ */
function WeeklyTab() {
  const navigate = useNavigate();
  const { faithRoutines, logs } = useRoutineStore();
  const { data: reviews = [] } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = today();

  const weekRates = weekDays.map(d => {
    const ds = format(d, 'yyyy-MM-dd');
    const isFuture = d > new Date(new Date().setHours(23, 59, 59, 999));
    return { date: ds, label: DAY_LABELS[weekDays.indexOf(d)], rate: isFuture ? null : getDayRate(faithRoutines, logs, ds), isFuture, isToday: ds === todayStr };
  });

  const validRates = weekRates.filter(r => r.rate !== null && r.rate! > 0).map(r => r.rate!);
  const weekAvg = validRates.length > 0 ? Math.round(validRates.reduce((a, b) => a + b, 0) / 7) : 0;

  const { current: streak, best } = calcStreak(faithRoutines, logs, todayStr);
  const recentReviews = reviews.slice(0, 4);

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      {/* 주간 요약 */}
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: '이번 주 평균', value: `${weekAvg}%`, color: 'text-indigo-600', bg: 'bg-indigo-50', icon: <TrendingUp size={13} className="text-indigo-400" /> },
          { label: '연속 달성', value: `${streak}일`, sub: `최고 ${best}일`, color: 'text-orange-500', bg: 'bg-orange-50', icon: <Flame size={13} className="text-orange-400" /> },
        ].map((c, i) => (
          <motion.div key={c.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 400, damping: 28 }}>
            <StatCard {...c} />
          </motion.div>
        ))}
      </div>

      {/* 요일별 바 차트 */}
      <Card>
        <p className="text-xs font-bold text-gray-500 mb-4">요일별 달성률</p>
        <div className="flex items-end gap-2 h-32">
          {weekRates.map(d => {
            const rate = d.rate ?? 0;
            const barH = d.isFuture ? 0 : Math.max(rate, 4);
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5">
                <span className={`text-[10px] font-bold ${rate === 100 ? 'text-indigo-600' : 'text-gray-400'}`}>
                  {d.isFuture ? '' : rate > 0 ? `${rate}%` : ''}
                </span>
                <div className="w-full flex flex-col justify-end" style={{ height: 80 }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: d.isFuture ? 0 : `${barH}%` }}
                    transition={{ duration: 0.5, delay: weekRates.indexOf(d) * 0.05 }}
                    className={`w-full rounded-t-lg ${
                      d.isFuture ? 'bg-transparent'
                      : rate === 100 ? 'bg-indigo-500'
                      : rate > 0 ? 'bg-indigo-300'
                      : 'bg-gray-100'
                    }`}
                  />
                </div>
                <span className={`text-xs font-semibold ${d.isToday ? 'text-indigo-500' : 'text-gray-400'}`}>{d.label}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 주간 리뷰 히스토리 */}
      <div>
        <p className="text-xs font-bold text-gray-500 mb-3">주간 리뷰 히스토리</p>
        {recentReviews.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 px-4 py-8 text-center">
            <p className="text-sm text-gray-400">아직 완료된 주간 리뷰가 없어요</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {recentReviews.map((review, i) => (
              <motion.button key={review.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 28 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate(`/review/result/${review.year}-${review.weekNumber}`)}
                className="w-full bg-white rounded-2xl p-4 border border-gray-100 text-left flex items-center gap-3 hover:border-indigo-200 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-gray-700">{review.year}년 {review.weekNumber}주차</p>
                    {review.mood && <span className="text-base">{MOOD_EMOJI[review.mood]}</span>}
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400">
                    <span className="text-indigo-500">개인 {review.personalRate}%</span>
                    <span className="text-emerald-500">신앙 {review.faithRate}%</span>
                  </div>
                  {review.comment && <p className="text-xs text-gray-400 truncate mt-1">"{review.comment}"</p>}
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   월간 탭
════════════════════════════════════════ */
function MonthlyTab() {
  const { personalRoutines, faithRoutines, logs } = useRoutineStore();
  const { user } = useAuthStore();
  const reportRef = useRef<HTMLDivElement>(null);
  const todayStr = today();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const { current: pStreak, best: pBest } = calcStreak(personalRoutines, logs, todayStr);
  const { current: fStreak, best: fBest } = calcStreak(faithRoutines, logs, todayStr);

  const routineStats = getRoutineStats([...personalRoutines, ...faithRoutines], logs, monthStart, monthEnd);
  const monthAvgFaith = routineStats.filter(s => s.routine.type === 'faith').reduce((a, s) => a + s.rate, 0) / (faithRoutines.length || 1);

  const handleDownload = async () => {
    if (!reportRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = `온주_${todayStr}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-8">
      {/* 월 제목 */}
      <div>
        <p className="text-base font-bold text-gray-900">{format(now, 'yyyy년 M월', { locale: ko })}</p>
        <p className="text-xs text-gray-400 mt-0.5">이번 달 루틴 기록</p>
      </div>

      {/* 월간 요약 */}
      <div className="grid grid-cols-3 gap-2">
        <StatCard label="신앙 달성률" value={`${Math.round(monthAvgFaith)}%`} color="text-emerald-600" bg="bg-emerald-50" />
        <StatCard label="연속 달성" value={`${Math.max(pStreak, fStreak)}일`} sub={`최고 ${Math.max(pBest, fBest)}일`} color="text-orange-500" bg="bg-orange-50" icon={<Flame size={13} className="text-orange-400" />} />
        <StatCard label="완료 루틴" value={`${routineStats.filter(s => s.rate >= 80).length}개`} sub="달성률 80%↑" color="text-indigo-600" bg="bg-indigo-50" />
      </div>

      {/* 달력 히트맵 */}
      <Card>
        <p className="text-xs font-bold text-gray-500 mb-3">월간 히트맵</p>
        <MonthlyCalendar personalRoutines={personalRoutines} faithRoutines={faithRoutines} logs={logs} month={now} />
        <div className="flex items-center gap-3 mt-3">
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-indigo-400" /><span className="text-xs text-gray-400">개인</span></div>
          <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /><span className="text-xs text-gray-400">신앙</span></div>
        </div>
      </Card>

      {/* 루틴별 달성률 */}
      {routineStats.length > 0 && (
        <Card>
          <p className="text-xs font-bold text-gray-500 mb-3">루틴별 달성률</p>
          <div className="flex flex-col divide-y divide-gray-50">
            {routineStats.map(({ routine, rate }) => (
              <div key={routine.id} className="py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm text-gray-700 truncate flex-1 mr-3">{routine.title}</span>
                  <span className={`text-sm font-bold tabular-nums ${rate >= 80 ? 'text-emerald-500' : rate >= 50 ? 'text-indigo-500' : 'text-red-400'}`}>{rate}%</span>
                </div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${rate}%` }}
                    transition={{ duration: 0.6 }}
                    className={`h-full rounded-full ${rate >= 80 ? 'bg-emerald-400' : rate >= 50 ? 'bg-indigo-400' : 'bg-red-300'}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* 월간 리포트 카드 */}
      <div ref={reportRef}>
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-6 text-white">
          <p className="text-xs font-semibold opacity-70 mb-1">온주</p>
          <h3 className="text-lg font-bold mb-4">{user?.name}님의 {format(now, 'M월')} 기록</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white/10 rounded-2xl p-3 text-center">
              <p className="text-xs opacity-70 mb-1">신앙 달성</p>
              <p className="text-lg font-bold">{Math.round(monthAvgFaith)}%</p>
            </div>
            <div className="bg-white/10 rounded-2xl p-3 text-center">
              <p className="text-xs opacity-70 mb-1">연속 달성</p>
              <p className="text-lg font-bold">{Math.max(pStreak, fStreak)}일</p>
            </div>
            <div className="bg-white/10 rounded-2xl p-3 text-center">
              <p className="text-xs opacity-70 mb-1">완료 루틴</p>
              <p className="text-lg font-bold">{routineStats.filter(s => s.rate >= 80).length}개</p>
            </div>
          </div>
          <p className="text-xs opacity-60">🔥 최고 {Math.max(pBest, fBest)}일 연속 달성</p>
        </div>
      </div>
      <button onClick={handleDownload}
        className="flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
        <Download size={16} /> 이미지로 저장
      </button>
    </div>
  );
}

/* ── 공통 통계 카드 ── */
function StatCard({ label, value, sub, color, bg, icon }: {
  label: string; value: string; sub?: string;
  color?: string; bg?: string; icon?: React.ReactNode;
}) {
  return (
    <div className={`rounded-2xl border border-gray-100 p-3.5 ${bg ?? 'bg-white'}`}>
      <div className="flex items-center gap-1 mb-1.5">
        {icon}
        <p className="text-[11px] text-gray-500 font-medium">{label}</p>
      </div>
      <p className={`text-xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
