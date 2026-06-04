import { format } from 'date-fns';
import type { HabitFrequency, DailyRoutine } from '../types';
import { isScheduled } from './goalProgress';

export type DayStatus = 'done' | 'sub' | 'rest' | 'miss' | 'off' | 'future';

export interface HabitStat {
  rate30: number;   // 최근 30일 예정일 중 달성률
  done30: number;   // 최근 30일 달성한 예정일 수
  sched30: number;  // 최근 30일 예정일 수
  streak: number;   // 현재 연속 (예정일 기준, 오늘 미수행이어도 어제까지 유지)
  best: number;     // 최고 연속
  recent: { date: string; status: DayStatus }[]; // 최근 14일
}

interface LogLike {
  date: string;
  completed?: boolean;
  skipped?: boolean;
  substitute?: boolean;
}

function ymd(d: Date) { return format(d, 'yyyy-MM-dd'); }

/**
 * 습관/루틴 하나의 통계.
 * logs: 해당 항목의 로그만 (date별 1개 가정)
 */
export function getHabitStat(
  frequency: HabitFrequency | DailyRoutine['frequency'],
  customDays: number[] | undefined,
  createdAt: string,
  logs: LogLike[],
): HabitStat {
  const todayMid = new Date(new Date().setHours(12, 0, 0, 0));
  const todayIso = ymd(todayMid);
  const createdIso = createdAt.slice(0, 10);

  const logMap = new Map<string, LogLike>();
  logs.forEach(l => logMap.set(l.date, l));

  const doneOn = (iso: string) => {
    const l = logMap.get(iso);
    return !!(l && (l.completed || l.skipped || l.substitute));
  };

  // ── 최근 30일 (생성일 이후 예정일만) ──
  let done30 = 0, sched30 = 0;
  for (let i = 0; i < 30; i++) {
    const d = new Date(todayMid); d.setDate(d.getDate() - i);
    const iso = ymd(d);
    if (iso < createdIso) continue;
    if (!isScheduled(iso, frequency, customDays)) continue;
    sched30++;
    if (doneOn(iso)) done30++;
  }
  const rate30 = sched30 === 0 ? 0 : Math.round((done30 / sched30) * 100);

  // ── 현재 연속 (오늘 또는 어제부터 거꾸로) ──
  // 오늘이 예정일이고 미수행이면, 오늘은 건너뛰고 어제부터 (아직 기회 남음)
  let streak = 0;
  {
    const d = new Date(todayMid);
    // 오늘이 예정일인데 아직 안 했으면 오늘은 제외하고 시작
    if (isScheduled(todayIso, frequency, customDays) && !doneOn(todayIso)) {
      d.setDate(d.getDate() - 1);
    }
    while (true) {
      const iso = ymd(d);
      if (iso < createdIso) break;
      if (isScheduled(iso, frequency, customDays)) {
        if (doneOn(iso)) streak++;
        else break;
      }
      d.setDate(d.getDate() - 1);
    }
  }

  // ── 최고 연속 (생성일~오늘 예정일 스캔) ──
  let best = 0, run = 0;
  {
    const start = new Date(createdIso + 'T12:00:00');
    const d = new Date(start);
    while (ymd(d) <= todayIso) {
      const iso = ymd(d);
      if (isScheduled(iso, frequency, customDays)) {
        if (doneOn(iso)) { run++; best = Math.max(best, run); }
        else run = 0;
      }
      d.setDate(d.getDate() + 1);
    }
  }

  // ── 최근 14일 도트 ──
  const recent: { date: string; status: DayStatus }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(todayMid); d.setDate(d.getDate() - i);
    const iso = ymd(d);
    let status: DayStatus;
    if (iso > todayIso) status = 'future';
    else if (iso < createdIso || !isScheduled(iso, frequency, customDays)) status = 'off';
    else {
      const l = logMap.get(iso);
      if (l?.substitute) status = 'sub';
      else if (l?.skipped) status = 'rest';
      else if (l?.completed) status = 'done';
      else status = 'miss';
    }
    recent.push({ date: iso, status });
  }

  return { rate30, done30, sched30, streak, best, recent };
}
