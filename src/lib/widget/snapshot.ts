import { Capacitor } from '@capacitor/core';
import type { WeeklyReview } from '../../types';
import { useRoutineStore } from '../../store/routineStore';
import { useHabitStore } from '../../store/habitStore';
import { useDiaryStore } from '../../store/diaryStore';
import { calcTreeGrowth } from '../../utils/treeGrowth';
import { calcStreak } from '../../utils/completion';
import { getDayCompletion } from '../../utils/dayCompletion';
import { isScheduled } from '../../utils/goalProgress';
import { today } from '../../utils/date';
import { queryClient } from '../queryClient';
import { WidgetBridge } from '../../plugins/widget-bridge';

/** 홈 위젯에 그릴 한입 요약. 네이티브가 이 JSON을 읽어 렌더한다. */
export interface WidgetSnapshot {
  v: 1;
  updatedAt: string;
  tree: {
    stage: number;
    stageName: string;
    health: 'healthy' | 'dry' | 'wilted';
    progressToNext: number;
  };
  today: {
    /** -1 = 오늘 예정 없음(휴식) */
    personalRate: number;
    faithRate: number;
    /** 신앙 루틴 연속일 — 홈 헤더 🔥와 동일 */
    streak: number;
  };
  /**
   * 오늘 예정된 미완료/세션 항목 상위 3개.
   * - personal/faith: 위젯에서 바로 체크. timer 있으면 우측 ▶로 타이머 진입.
   * - routine: 타이머 켠 개인 루틴(체크 없음, ▶로 루틴 타이머 진입).
   */
  pending: {
    id: string;
    kind: 'personal' | 'faith' | 'routine';
    title: string;
    emoji: string;
    timer?: 'routine' | 'focus' | 'twomin';
  }[];
}

/**
 * 스토어 + 캐시에서 위젯 스냅샷을 만든다(순수).
 * 홈 Dashboard와 동일 소스: 개인=habitStore.habits, 신앙=routineStore.faithRoutines.
 */
export function buildSnapshot(): WidgetSnapshot {
  const todayStr = today();
  const { faithRoutines, logs } = useRoutineStore.getState();
  const { habits, habitLogs, personalRoutines } = useHabitStore.getState();
  const diaryEntries = useDiaryStore.getState().entries;
  const reviews = queryClient.getQueryData<WeeklyReview[]>(['reviews']) ?? [];

  const tree = calcTreeGrowth(habits, habitLogs, faithRoutines, logs, diaryEntries, reviews);
  const { personalRate, faithRate } = getDayCompletion(todayStr, habits, habitLogs, faithRoutines, logs);
  const { current: streak } = calcStreak(faithRoutines, logs, todayStr);

  // 오늘 예정 & 미완료 (완료·대체·쉬어가기는 달성으로 인정 → 제외)
  const openHabit = (h: (typeof habits)[number]) =>
    isScheduled(todayStr, h.frequency, h.customDays) &&
    !habitLogs.some(
      (l) => l.habitId === h.id && l.date === todayStr && (l.completed || l.skipped || l.substitute),
    );
  const openFaith = (r: (typeof faithRoutines)[number]) =>
    isScheduled(todayStr, r.frequency) &&
    !logs.some((l) => l.routineId === r.id && l.date === todayStr && (l.completed || l.skipped));

  // 타이머 켠 개인 루틴 — 오늘 예정 멤버 중 미완료가 있으면 ▶ 세션으로 노출
  const timerRoutines = personalRoutines.filter(
    (r) => r.timerEnabled && r.habitIds.some((hid) => {
      const h = habits.find((x) => x.id === hid);
      return !!h && openHabit(h);
    }),
  );
  const shownInRoutine = new Set(timerRoutines.flatMap((r) => r.habitIds));

  const pending = [
    ...timerRoutines.map((r) => ({
      id: r.id, kind: 'routine' as const, title: r.title, emoji: r.emoji || '⏱️', timer: 'routine' as const,
    })),
    ...habits.filter((h) => openHabit(h) && !shownInRoutine.has(h.id)).map((h) => ({
      id: h.id, kind: 'personal' as const, title: h.title, emoji: h.emoji ?? '',
      timer: h.durationSeconds ? ('focus' as const) : h.twoMinuteHabit ? ('twomin' as const) : undefined,
    })),
    ...faithRoutines.filter(openFaith).map((r) => ({
      id: r.id, kind: 'faith' as const, title: r.title, emoji: r.emoji ?? '',
    })),
  ].slice(0, 3);

  return {
    v: 1,
    updatedAt: new Date().toISOString(),
    tree: {
      stage: tree.stage,
      stageName: tree.stageName,
      health: tree.health,
      progressToNext: tree.progressToNext,
    },
    today: { personalRate, faithRate, streak },
    pending,
  };
}

/** 최신 스냅샷을 네이티브 위젯으로 밀어준다. 웹/비네이티브면 no-op. */
export async function pushWidgetSnapshot(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await WidgetBridge.sync({ json: JSON.stringify(buildSnapshot()) });
  } catch (e) {
    console.error('[widget] sync 실패:', e);
  }
}
