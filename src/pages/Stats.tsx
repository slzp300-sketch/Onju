import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Download, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Card from '../components/ui/Card';
import HeatMap from '../components/ui/HeatMap';
import { useRoutineStore } from '../store/routineStore';
import { useAuthStore } from '../store/authStore';
import { calcStreak, getWeekdayStats, getRoutineStats } from '../utils/completion';
import { today } from '../utils/date';
import { fetchReviews } from '../api/reviews';
import { startOfMonth, endOfMonth } from 'date-fns';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

const MOOD_EMOJI: Record<string, string> = { hard: '😓', normal: '😊', easy: '😌' };

export default function Stats() {
  const navigate = useNavigate();
  const { personalRoutines, faithRoutines, logs } = useRoutineStore();
  const { user } = useAuthStore();
  const [heatTrack, setHeatTrack] = useState<'personal' | 'faith'>('personal');
  const reportRef = useRef<HTMLDivElement>(null);

  const { data: reviews = [] } = useQuery({
    queryKey: ['reviews'],
    queryFn: fetchReviews,
  });

  const allRoutines = [...personalRoutines, ...faithRoutines];
  const todayStr = today();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const { current: pStreak, best: pBest } = calcStreak(personalRoutines, logs, todayStr);
  const { current: fStreak, best: fBest } = calcStreak(faithRoutines, logs, todayStr);

  const weekdayStats = getWeekdayStats(allRoutines, logs, now.getMonth() + 1, now.getFullYear());
  const weekdayData = DAY_LABELS.map((label, i) => ({
    day: label,
    개인: weekdayStats[i]?.personal ?? 0,
    신앙: weekdayStats[i]?.faith ?? 0,
  }));

  const routineStats = getRoutineStats(allRoutines, logs, monthStart, monthEnd);
  const monthAvgPersonal = routineStats.filter(s => s.routine.type === 'personal').reduce((acc, s) => acc + s.rate, 0) /
    (personalRoutines.length || 1);
  const monthAvgFaith = routineStats.filter(s => s.routine.type === 'faith').reduce((acc, s) => acc + s.rate, 0) /
    (faithRoutines.length || 1);

  const handleDownload = async () => {
    if (!reportRef.current) return;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(reportRef.current, { scale: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = `직장생활조_${todayStr}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5">
        <h1 className="text-lg font-bold text-gray-900">통계</h1>
        <p className="text-xs text-gray-400 mt-0.5">이번 달 기준</p>
      </div>

      {/* 섹션 1: 요약 카드 3개 */}
      <div className="px-4 grid grid-cols-3 gap-2">
        <SummaryCard label="개인 달성률" value={`${Math.round(monthAvgPersonal)}%`} color="text-indigo-600" />
        <SummaryCard label="신앙 달성률" value={`${Math.round(monthAvgFaith)}%`} color="text-emerald-600" />
        <SummaryCard
          label="연속 달성"
          value={`${Math.max(pStreak, fStreak)}일`}
          sub={`최고 ${Math.max(pBest, fBest)}일`}
          color="text-orange-500"
        />
      </div>

      {/* 섹션 2: 히트맵 (Track 탭 전환) */}
      <Card className="mx-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500">이번 달 히트맵</p>
          <div className="flex rounded-lg overflow-hidden border border-gray-200">
            <button
              onClick={() => setHeatTrack('personal')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                heatTrack === 'personal' ? 'bg-indigo-500 text-white' : 'text-gray-500'
              }`}
            >개인</button>
            <button
              onClick={() => setHeatTrack('faith')}
              className={`px-3 py-1 text-xs font-medium transition-colors ${
                heatTrack === 'faith' ? 'bg-emerald-500 text-white' : 'text-gray-500'
              }`}
            >신앙</button>
          </div>
        </div>
        <HeatMap
          personalRoutines={heatTrack === 'personal' ? personalRoutines : []}
          faithRoutines={heatTrack === 'faith' ? faithRoutines : []}
          logs={logs}
          days={now.getDate()}
        />
      </Card>

      {/* 섹션 3: 요일별 달성률 바 차트 */}
      <Card className="mx-4">
        <p className="text-xs font-semibold text-gray-500 mb-4">요일별 달성률</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={weekdayData} barSize={8} barGap={2}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="day" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} unit="%" width={30} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
              formatter={(v) => `${v}%`}
            />
            <Bar dataKey="개인" fill="#6366f1" radius={[3, 3, 0, 0]} />
            <Bar dataKey="신앙" fill="#10b981" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* 섹션 4: 루틴별 달성률 순위 */}
      <Card className="mx-4">
        <p className="text-xs font-semibold text-gray-500 mb-3">루틴별 달성률</p>
        {routineStats.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">루틴을 추가해 보세요</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {routineStats.map(({ routine, rate }) => (
              <div key={routine.id}>
                <div className="flex justify-between mb-1">
                  <span className="text-xs text-gray-700 truncate flex-1 mr-2">{routine.title}</span>
                  <span className={`text-xs font-semibold ${
                    rate >= 80 ? 'text-emerald-600' : rate >= 50 ? 'text-indigo-600' : 'text-red-400'
                  }`}>{rate}%</span>
                </div>
                <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${rate}%`,
                      backgroundColor: routine.type === 'faith' ? '#10b981' : '#6366f1',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 섹션 5: 월간 리포트 공유 */}
      <div ref={reportRef} className="mx-4">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-6 text-white">
          <p className="text-xs font-semibold opacity-70 mb-1">직장생활조</p>
          <h3 className="text-lg font-bold mb-4">{user.name.slice(-2)}님의 이번 달 기록</h3>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <ReportStat label="개인" value={`${Math.round(monthAvgPersonal)}%`} />
            <ReportStat label="신앙" value={`${Math.round(monthAvgFaith)}%`} />
            <ReportStat label="연속 달성" value={`${Math.max(pStreak, fStreak)}일`} />
          </div>
          <div className="flex gap-2 text-xs opacity-60">
            <span>🔥 최고 {Math.max(pBest, fBest)}일 연속</span>
          </div>
        </div>
      </div>
      <button
        onClick={handleDownload}
        className="mx-4 flex items-center justify-center gap-2 py-3 rounded-2xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <Download size={16} />
        이미지로 저장
      </button>

      {/* 섹션 6: 주간 리뷰 패턴 인사이트 (LineChart) */}
      {reviews.length >= 2 && (
        <Card className="mx-4">
          <p className="text-xs font-semibold text-gray-500 mb-4">달성률 추이</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={[...reviews].reverse().slice(-8).map(r => ({
              week: `${r.weekNumber}주`,
              개인: r.personalRate,
              신앙: r.faithRate,
            }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="week" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} unit="%" width={28} />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
                formatter={(v) => `${v}%`}
              />
              <Legend iconType="circle" iconSize={8} />
              <Line type="monotone" dataKey="개인" stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} />
              <Line type="monotone" dataKey="신앙" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* 섹션 7: 주간 리뷰 히스토리 */}
      {reviews.length > 0 && (
        <div className="px-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">주간 리뷰 히스토리</p>
          <div className="flex flex-col gap-2">
            {reviews.slice(0, 8).map(review => (
              <button
                key={review.id}
                onClick={() => navigate(`/review/result/${review.year}-${review.weekNumber}`)}
                className="w-full bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-left flex items-center gap-3 hover:border-indigo-200 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-semibold text-gray-700">
                      {review.year}년 {review.weekNumber}주차
                    </p>
                    {review.mood && (
                      <span className="text-base">{MOOD_EMOJI[review.mood]}</span>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-gray-400 mb-1">
                    <span className="text-indigo-500">개인 {review.personalRate}%</span>
                    <span className="text-emerald-500">신앙 {review.faithRate}%</span>
                  </div>
                  {review.comment && (
                    <p className="text-xs text-gray-400 truncate">"{review.comment}"</p>
                  )}
                </div>
                <ChevronRight size={16} className="text-gray-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <Card className="!p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color ?? 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </Card>
  );
}

function ReportStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/10 rounded-2xl p-3 text-center">
      <p className="text-xs opacity-70 mb-1">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
