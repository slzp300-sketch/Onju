import { format } from 'date-fns';
import type { DiaryMood } from '../types';

// 일기 기분 메타 (Diary 페이지 · 통계 공용)
export const DIARY_MOODS: { key: DiaryMood; emoji: string; label: string }[] = [
  { key: 'great', emoji: '😊', label: '최고' },
  { key: 'good', emoji: '🙂', label: '좋음' },
  { key: 'neutral', emoji: '😐', label: '보통' },
  { key: 'down', emoji: '😟', label: '별로' },
  { key: 'bad', emoji: '😢', label: '힘듦' },
];

export const DIARY_MOOD_EMOJI: Record<DiaryMood, string> =
  Object.fromEntries(DIARY_MOODS.map(m => [m.key, m.emoji])) as Record<DiaryMood, string>;

/**
 * 일기 연속 작성 일수.
 * - 오늘 작성했으면 오늘부터, 안 했으면 어제부터(유예) 거슬러 연속 일수를 셈
 */
export function calcDiaryStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const set = new Set(dates);
  const iso = (d: Date) => format(d, 'yyyy-MM-dd');
  const cursor = new Date();

  if (!set.has(iso(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(iso(cursor))) return 0;
  }

  let streak = 0;
  while (set.has(iso(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
