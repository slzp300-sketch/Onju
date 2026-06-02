import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay } from 'date-fns';
import type { DailyRoutine, RoutineLog } from '../../types';
import { getTodayRates } from '../../utils/completion';

interface MonthlyCalendarProps {
  personalRoutines: DailyRoutine[];
  faithRoutines: DailyRoutine[];
  logs: RoutineLog[];
  month?: Date; // defaults to current month
}

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const TODAY_STR = format(new Date(), 'yyyy-MM-dd');

function rateToAlpha(rate: number): number {
  if (rate === 0) return 0;
  return 0.15 + (rate / 100) * 0.85;
}

export default function MonthlyCalendar({
  personalRoutines,
  faithRoutines,
  logs,
  month = new Date(),
}: MonthlyCalendarProps) {
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  const days = eachDayOfInterval({ start, end });

  // 1일이 무슨 요일인지 (0=일 ~ 6=토)
  const startWeekday = getDay(start);

  // 날짜별 달성률 계산
  const dayData = days.map(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    const dayLogs = logs.filter(l => l.date === dateStr);
    const { personal, faith } = getTodayRates(personalRoutines, faithRoutines, dayLogs, dateStr);
    const isFuture = dateStr > TODAY_STR;
    const isToday = dateStr === TODAY_STR;
    return { dateStr, day, personal, faith, isFuture, isToday };
  });

  // 요약 집계
  const pastDays = dayData.filter(d => !d.isFuture);
  const hasRoutines = personalRoutines.length + faithRoutines.length > 0;
  const perfect = pastDays.filter(d => d.personal === 100 && d.faith === 100).length;
  const partial = pastDays.filter(d => (d.personal > 0 || d.faith > 0) && !(d.personal === 100 && d.faith === 100)).length;
  const missed = pastDays.length - perfect - partial;

  return (
    <div>
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAY_LABELS.map((label, i) => (
          <div
            key={label}
            className={`text-center text-caption1 font-medium py-1 ${
              i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-label-alt'
            }`}
          >
            {label}
          </div>
        ))}
      </div>

      {/* 날짜 그리드 */}
      <div className="grid grid-cols-7 gap-y-1 gap-x-1">
        {/* 빈 셀 (월 시작 전) */}
        {Array.from({ length: startWeekday }).map((_, i) => (
          <div key={`empty-${i}`} />
        ))}

        {dayData.map(({ dateStr, day, personal, faith, isFuture, isToday }) => (
          <div
            key={dateStr}
            className={`flex flex-col rounded-lg overflow-hidden ${
              isToday ? 'ring-2 ring-primary ring-offset-1' : ''
            }`}
          >
            <div className={`text-center text-caption1 py-0.5 ${
              isToday ? 'font-bold text-primary' : isFuture ? 'text-label-assistive' : 'text-label-alt'
            }`}>
              {format(day, 'd')}
            </div>
            {isFuture || !hasRoutines ? (
              <div className="h-4 bg-surface-alt" />
            ) : (
              <div className="flex flex-col">
                <div
                  className="h-2"
                  style={{
                    backgroundColor:
                      personalRoutines.length === 0
                        ? '#f3f4f6'
                        : personal > 0
                        ? `rgba(99,102,241,${rateToAlpha(personal)})`
                        : '#f3f4f6',
                  }}
                />
                <div
                  className="h-2"
                  style={{
                    backgroundColor:
                      faithRoutines.length === 0
                        ? '#f3f4f6'
                        : faith > 0
                        ? `rgba(16,185,129,${rateToAlpha(faith)})`
                        : '#f3f4f6',
                  }}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 범례 */}
      <div className="flex gap-3 mt-3">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-primary" />
          <span className="text-caption1 text-label-alt">개인</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-emerald-400" />
          <span className="text-caption1 text-label-alt">신앙</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-sm bg-fill" />
          <span className="text-caption1 text-label-alt">미완료</span>
        </div>
      </div>

      {/* 요약 */}
      {hasRoutines && pastDays.length > 0 && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-line-soft">
          <SummaryBadge label="완벽한 날" count={perfect} color="text-primary" bg="bg-primary-soft" />
          <SummaryBadge label="부분 달성" count={partial} color="text-orange-500" bg="bg-orange-50" />
          <SummaryBadge label="미체크" count={missed} color="text-label-alt" bg="bg-surface-alt" />
        </div>
      )}
    </div>
  );
}

function SummaryBadge({ label, count, color, bg }: { label: string; count: number; color: string; bg: string }) {
  return (
    <div className={`flex-1 rounded-xl px-2 py-1.5 text-center ${bg}`}>
      <p className={`text-headline1 font-bold ${color}`}>{count}</p>
      <p className="text-caption1 text-label-alt mt-0.5">{label}</p>
    </div>
  );
}
