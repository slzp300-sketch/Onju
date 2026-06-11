import { format, subDays } from 'date-fns';
import type { Habit, DailyRoutine, RoutineLog, WeeklyReview, DiaryEntry } from '../types';
import { isScheduled } from './goalProgress';
import { today } from './date';

/**
 * 나무 성장 엔진 — 전부 로그에서 파생 계산 (서버 저장 없음).
 * - 성장 포인트: 누적, 절대 감소하지 않음 (크기/단계 축)
 * - 건강도: 최근 7일 수행률 (생기 축 — 시들었다가 회복 가능)
 */

interface HabitLogLite {
  habitId: string;
  date: string;
  completed: boolean;
  skipped?: boolean;
  substitute?: boolean;
}

export type TreeHealth = 'healthy' | 'dry' | 'wilted';
export type TreeStage = 0 | 1 | 2 | 3 | 4;

export const STAGE_THRESHOLDS = [0, 30, 150, 400, 900] as const;
export const STAGE_NAMES = ['씨앗', '새싹', '묘목', '어린나무', '큰나무'] as const;

/** 계산 범위 상한 (일) */
const MAX_DAYS = 730;

export interface TreeGrowth {
  points: number;
  stage: TreeStage;
  stageName: (typeof STAGE_NAMES)[number];
  /** 다음 단계 포인트 (최고 단계면 null) */
  nextThreshold: number | null;
  /** 다음 단계까지 진행도 0~1 (최고 단계면 1) */
  progressToNext: number;
  health: TreeHealth;
}

interface DayScore {
  total: number;
  done: number;
}

/** 일별 예정/완료 집계 — getDayCompletion과 동일 정의(완료·대체·쉬어가기 인정) */
function buildDayScores(
  habits: Habit[],
  habitLogs: HabitLogLite[],
  faithRoutines: DailyRoutine[],
  routineLogs: RoutineLog[],
  fromIso: string,
  toIso: string,
): Map<string, DayScore> {
  // 1-pass 인덱스: 날짜 → 달성한 아이템 id 집합
  const doneHabits = new Map<string, Set<string>>();
  for (const l of habitLogs) {
    if (l.completed || l.skipped || l.substitute) {
      if (!doneHabits.has(l.date)) doneHabits.set(l.date, new Set());
      doneHabits.get(l.date)!.add(l.habitId);
    }
  }
  const doneFaith = new Map<string, Set<string>>();
  for (const l of routineLogs) {
    if (l.completed || l.skipped) {
      if (!doneFaith.has(l.date)) doneFaith.set(l.date, new Set());
      doneFaith.get(l.date)!.add(l.routineId);
    }
  }

  // 아이템별 생성일(그 전 날짜는 예정에서 제외 — 새 습관 추가가 과거 점수를 깎지 않도록)
  const habitItems = habits.map(h => ({
    id: h.id,
    frequency: h.frequency,
    customDays: h.customDays,
    createdDate: h.createdAt.slice(0, 10),
  }));
  const faithItems = faithRoutines
    .filter(r => r.isActive)
    .map(r => ({
      id: r.id,
      frequency: r.frequency,
      customDays: undefined as number[] | undefined,
      createdDate: r.createdAt.slice(0, 10),
    }));

  const scores = new Map<string, DayScore>();
  const d = new Date(fromIso + 'T12:00:00');
  const end = new Date(toIso + 'T12:00:00');
  while (d <= end) {
    const iso = format(d, 'yyyy-MM-dd');
    let total = 0;
    let done = 0;
    const dh = doneHabits.get(iso);
    for (const h of habitItems) {
      if (h.createdDate <= iso && isScheduled(iso, h.frequency, h.customDays)) {
        total++;
        if (dh?.has(h.id)) done++;
      }
    }
    const df = doneFaith.get(iso);
    for (const f of faithItems) {
      if (f.createdDate <= iso && isScheduled(iso, f.frequency)) {
        total++;
        if (df?.has(f.id)) done++;
      }
    }
    scores.set(iso, { total, done });
    d.setDate(d.getDate() + 1);
  }
  return scores;
}

function dayPoints(score: DayScore): number {
  if (score.total === 0) return 0;
  const rate = (score.done / score.total) * 100;
  if (rate >= 100) return 10;
  if (rate >= 50) return 6;
  if (rate > 0) return 3;
  return 0;
}

export function calcTreeGrowth(
  habits: Habit[],
  habitLogs: HabitLogLite[],
  faithRoutines: DailyRoutine[],
  routineLogs: RoutineLog[],
  diaryEntries: DiaryEntry[],
  reviews: WeeklyReview[],
): TreeGrowth {
  const todayIso = today();

  // 계산 시작일: 가장 이른 기록 (없으면 오늘), 최대 730일 전까지
  const allDates: string[] = [
    ...habitLogs.map(l => l.date),
    ...routineLogs.map(l => l.date),
    ...diaryEntries.map(e => e.date),
  ];
  const minCap = format(subDays(new Date(todayIso + 'T12:00:00'), MAX_DAYS - 1), 'yyyy-MM-dd');
  let fromIso = todayIso;
  for (const date of allDates) if (date < fromIso) fromIso = date;
  if (fromIso < minCap) fromIso = minCap;

  const scores = buildDayScores(habits, habitLogs, faithRoutines, routineLogs, fromIso, todayIso);

  // ── 성장 포인트 ──
  const diaryDates = new Set(diaryEntries.map(e => e.date));
  let points = 0;
  for (const [iso, score] of scores) {
    if (iso > todayIso) continue;
    points += dayPoints(score);
    if (diaryDates.has(iso)) points += 2;
  }
  points += reviews.filter(r => r.completedAt).length * 15;

  let stage: TreeStage = 0;
  for (let i = STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= STAGE_THRESHOLDS[i]) { stage = i as TreeStage; break; }
  }
  const nextThreshold = stage < 4 ? STAGE_THRESHOLDS[stage + 1] : null;
  const progressToNext = nextThreshold === null
    ? 1
    : Math.min(1, (points - STAGE_THRESHOLDS[stage]) / (nextThreshold - STAGE_THRESHOLDS[stage]));

  // ── 건강도: 어제까지 7일 (rest일 제외) ──
  let validDays = 0;
  let rateSum = 0;
  for (let i = 1; i <= 7; i++) {
    const iso = format(subDays(new Date(todayIso + 'T12:00:00'), i), 'yyyy-MM-dd');
    const score = scores.get(iso);
    if (!score || score.total === 0) continue; // rest 또는 기록 시작 전
    validDays++;
    rateSum += (score.done / score.total) * 100;
  }
  let health: TreeHealth;
  if (validDays === 0) {
    health = 'healthy'; // 신규 가입·전부 rest
  } else {
    const avg = rateSum / validDays;
    health = avg >= 70 ? 'healthy' : avg >= 40 ? 'dry' : 'wilted';
  }
  // 오늘 보정: 오늘 50% 이상이면 한 단계 회복 (즉시 체감)
  const todayScore = scores.get(todayIso);
  if (todayScore && todayScore.total > 0 && (todayScore.done / todayScore.total) * 100 >= 50) {
    if (health === 'wilted') health = 'dry';
    else if (health === 'dry') health = 'healthy';
  }

  return {
    points,
    stage,
    stageName: STAGE_NAMES[stage],
    nextThreshold,
    progressToNext,
    health,
  };
}
