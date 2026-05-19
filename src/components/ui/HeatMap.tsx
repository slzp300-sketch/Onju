import { subDays, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DailyRoutine, RoutineLog } from '../../types';
import { getTodayRates } from '../../utils/completion';

interface HeatMapProps {
  personalRoutines: DailyRoutine[];
  faithRoutines: DailyRoutine[];
  logs: RoutineLog[];
  days?: number;
}

export default function HeatMap({ personalRoutines, faithRoutines, logs, days = 7 }: HeatMapProps) {
  const today = new Date();
  const dates = Array.from({ length: days }, (_, i) => subDays(today, days - 1 - i));

  return (
    <div className="flex gap-1.5 justify-between">
      {dates.map((date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayLogs = logs.filter(l => l.date === dateStr);
        const { personal, faith } = getTodayRates(personalRoutines, faithRoutines, dayLogs, dateStr);
        const isToday = dateStr === format(today, 'yyyy-MM-dd');

        return (
          <div key={dateStr} className="flex flex-col items-center gap-1 flex-1">
            <span className={`text-xs ${isToday ? 'text-indigo-600 font-semibold' : 'text-gray-400'}`}>
              {format(date, 'E', { locale: ko })}
            </span>
            <div className="flex flex-col gap-0.5 w-full">
              <div
                className="h-2.5 rounded-sm transition-colors"
                style={{ backgroundColor: personal > 0 ? `rgba(99,102,241,${0.2 + personal / 100 * 0.8})` : '#f3f4f6' }}
                title={`개인 ${personal}%`}
              />
              <div
                className="h-2.5 rounded-sm transition-colors"
                style={{ backgroundColor: faith > 0 ? `rgba(16,185,129,${0.2 + faith / 100 * 0.8})` : '#f3f4f6' }}
                title={`신앙 ${faith}%`}
              />
            </div>
            {isToday && <div className="w-1 h-1 rounded-full bg-indigo-500" />}
          </div>
        );
      })}
    </div>
  );
}
