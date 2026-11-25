import { getDay } from 'date-fns';
import type { HabitFrequency, DailyRoutine } from '../types';

/**
 * 해당 날짜가 습관/루틴의 "예정일"인지 판정.
 * getDay(): 0=일 ~ 6=토 (customDays/number[]도 동일 인덱스 사용)
 */
export function isScheduled(
  dateIso: string,
  frequency: HabitFrequency | DailyRoutine['frequency'],
  customDays?: number[],
): boolean {
  const dow = getDay(new Date(dateIso + 'T12:00:00')); // 0=일 ~ 6=토
  if (Array.isArray(frequency)) return frequency.includes(dow);
  switch (frequency) {
    case 'daily':    return true;
    case 'weekdays': return dow >= 1 && dow <= 5;
    case 'weekends': return dow === 0 || dow === 6;
    case 'custom':   return (customDays ?? []).includes(dow);
    default:         return true;
  }
}

