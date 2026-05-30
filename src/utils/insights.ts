import { format, subDays, eachDayOfInterval, startOfMonth } from 'date-fns';
import { ko } from 'date-fns/locale';
import type { DailyRoutine, RoutineLog } from '../types';

export type InsightColor = 'indigo' | 'emerald' | 'orange' | 'red';

export interface Insight {
  id: string;
  emoji: string;
  title: string;
  body: string;
  color: InsightColor;
  actionLabel?: string;
  actionPath?: string;
}

function dateStr(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function isCompleted(routineId: string, date: string, logs: RoutineLog[]) {
  return logs.some(l => l.routineId === routineId && l.date === date && l.completed);
}

function rangeRate(routines: DailyRoutine[], logs: RoutineLog[], startDate: Date, endDate: Date): number {
  if (routines.length === 0) return 0;
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  let total = 0, done = 0;
  days.forEach(d => {
    const ds = dateStr(d);
    routines.forEach(r => {
      total++;
      if (isCompleted(r.id, ds, logs)) done++;
    });
  });
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

function consecutiveMissDays(routine: DailyRoutine, logs: RoutineLog[], today: string): number {
  let count = 0;
  for (let i = 0; i < 30; i++) {
    const d = dateStr(subDays(new Date(today), i));
    if (!isCompleted(routine.id, d, logs)) count++;
    else break;
  }
  return count;
}

// 특정 날짜 범위의 달성률이 낮은 구간 탐지 (7일 슬라이딩 윈도우)
function findLowPeriod(
  routines: DailyRoutine[],
  logs: RoutineLog[],
  allDays: Date[],
  threshold = 40
): { start: Date; end: Date; rate: number } | null {
  if (routines.length === 0 || allDays.length < 7) return null;
  let worst: { start: Date; end: Date; rate: number } | null = null;

  for (let i = 0; i <= allDays.length - 7; i++) {
    const window = allDays.slice(i, i + 7);
    const rate = rangeRate(routines, logs, window[0], window[window.length - 1]);
    if (rate < threshold && (!worst || rate < worst.rate)) {
      worst = { start: window[0], end: window[window.length - 1], rate };
    }
  }
  return worst;
}

function fmtRange(start: Date, end: Date): string {
  return `${format(start, 'M/d', { locale: ko })}~${format(end, 'M/d', { locale: ko })}`;
}

export function generateInsights(
  personalRoutines: DailyRoutine[],
  faithRoutines: DailyRoutine[],
  logs: RoutineLog[],
  today: string
): Insight[] {
  const insights: Insight[] = [];
  const allRoutines = [...personalRoutines, ...faithRoutines];
  if (allRoutines.length === 0) return [];

  const todayDate = new Date(today);
  const last30 = Array.from({ length: 30 }, (_, i) => subDays(todayDate, 29 - i));
  const last14 = last30.slice(16); // 최근 14일
  const last7 = last30.slice(23);  // 최근 7일

  // 1. 특정 루틴 3일+ 연속 미완료 (실제 날짜 명시)
  allRoutines.forEach(r => {
    const miss = consecutiveMissDays(r, logs, today);
    if (miss >= 3) {
      const missStart = subDays(todayDate, miss - 1);
      insights.push({
        id: `miss-${r.id}`,
        emoji: '⚠️',
        title: `'${r.title}' ${fmtRange(missStart, todayDate)} 동안 ${miss}일 연속 미완료`,
        body: r.timeSlot
          ? `시간대(${r.timeSlot === 'morning' ? '아침' : r.timeSlot === 'afternoon' ? '점심' : '저녁'})를 바꿔볼까요?`
          : '루틴 설정에서 시간대를 지정하면 잊지 않을 수 있어요.',
        color: 'red',
        actionLabel: '루틴 설정',
        actionPath: '/routines',
      });
    }
  });

  // 2. 최근 7일 100% 달성 (개인 또는 신앙)
  const check7DayPerfect = (routines: DailyRoutine[], type: '개인' | '신앙') => {
    if (routines.length === 0) return;
    const perfect = last7.every(d => routines.every(r => isCompleted(r.id, dateStr(d), logs)));
    if (perfect) {
      insights.push({
        id: `perfect-7-${type}`,
        emoji: '🔥',
        title: `${type} 루틴 ${fmtRange(last7[0], last7[last7.length - 1])} 7일 연속 100%!`,
        body: '이 흐름이 자리를 잡았어요. 루틴 하나 더 추가해볼 타이밍이에요.',
        color: type === '개인' ? 'indigo' : 'emerald',
        actionLabel: '루틴 추가',
        actionPath: '/routines',
      });
    }
  };
  check7DayPerfect(personalRoutines, '개인');
  check7DayPerfect(faithRoutines, '신앙');

  // 3. 최근 14일 중 저조한 7일 구간 탐지
  const lowPersonal = findLowPeriod(personalRoutines, logs, last14);
  if (lowPersonal) {
    insights.push({
      id: `low-period-personal`,
      emoji: '📉',
      title: `${fmtRange(lowPersonal.start, lowPersonal.end)} 개인 루틴 달성률 ${lowPersonal.rate}%`,
      body: '이 기간에 유독 완료가 어려웠어요. 루틴 난이도나 시간을 조정해볼까요?',
      color: 'orange',
      actionLabel: '루틴 설정',
      actionPath: '/routines',
    });
  }
  const lowFaith = findLowPeriod(faithRoutines, logs, last14);
  if (lowFaith) {
    insights.push({
      id: `low-period-faith`,
      emoji: '📉',
      title: `${fmtRange(lowFaith.start, lowFaith.end)} 신앙 루틴 달성률 ${lowFaith.rate}%`,
      body: '이 기간 신앙 루틴을 놓쳤어요. 특별한 상황이 있었나요?',
      color: 'orange',
    });
  }

  // 4. 이번 달 특정 루틴 30% 미만
  const now = new Date(today);
  const monthStart = startOfMonth(now);
  const monthEnd = now; // 오늘까지만

  allRoutines.forEach(r => {
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
    const total = days.length;
    const done = days.filter(d => isCompleted(r.id, dateStr(d), logs)).length;
    const rate = total === 0 ? 0 : Math.round((done / total) * 100);
    if (rate < 30 && rate > 0 && total >= 7) {
      insights.push({
        id: `low-routine-${r.id}`,
        emoji: '💡',
        title: `'${r.title}' 이번 달(${format(monthStart, 'M/d')}~) 달성률 ${rate}%`,
        body: '기대보다 많이 낮아요. 루틴을 더 가볍게 조정해볼까요?',
        color: 'orange',
        actionLabel: '루틴 설정',
        actionPath: '/routines',
      });
    }
  });

  // 5. 지난주 vs 이번주 개선 (실제 날짜 기준)
  const thisWeek7 = last7;
  const prevWeek7 = last30.slice(16, 23);

  const compareImprovement = (routines: DailyRoutine[], type: '개인' | '신앙') => {
    if (routines.length === 0) return;
    const thisRate = rangeRate(routines, logs, thisWeek7[0], thisWeek7[thisWeek7.length - 1]);
    const prevRate = rangeRate(routines, logs, prevWeek7[0], prevWeek7[prevWeek7.length - 1]);
    const diff = thisRate - prevRate;
    if (diff >= 20 && prevRate > 0) {
      insights.push({
        id: `improve-${type}`,
        emoji: '📈',
        title: `${type} 루틴이 지난 주 대비 +${diff}% 올랐어요`,
        body: `${fmtRange(prevWeek7[0], prevWeek7[prevWeek7.length - 1])} → ${fmtRange(thisWeek7[0], thisWeek7[thisWeek7.length - 1])}. 이 흐름을 이어가 봐요!`,
        color: type === '개인' ? 'indigo' : 'emerald',
      });
    }
  };
  compareImprovement(personalRoutines, '개인');
  compareImprovement(faithRoutines, '신앙');

  // 중복 제거 및 최대 4개
  const seen = new Set<string>();
  return insights.filter(ins => {
    if (seen.has(ins.id)) return false;
    seen.add(ins.id);
    return true;
  }).slice(0, 4);
}
