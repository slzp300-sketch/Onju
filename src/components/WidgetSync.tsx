import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useRoutineStore } from '../store/routineStore';
import { useHabitStore } from '../store/habitStore';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { useTreeGrowth } from '../hooks/useTreeGrowth';
import { pushWidgetSnapshot } from '../lib/widget/snapshot';
import { reconcilePending } from '../lib/widget/reconcile';

/**
 * 홈 위젯 동기화 배선(네이티브 전용, 화면 없음).
 * - 관련 데이터가 바뀌면 디바운스 후 스냅샷을 위젯으로 푸시
 * - hydrate 완료 시 / 앱 재개 시 위젯에서 체크한 보류 액션을 reconcile
 */
export default function WidgetSync() {
  const native = Capacitor.isNativePlatform();
  const dataHydrated = useUIStore((s) => s.dataHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  // 변경 신호 구독 (개인=habit, 신앙=faithRoutine, tree=나무 상태)
  const habitLogs = useHabitStore((s) => s.habitLogs);
  const faithRoutines = useRoutineStore((s) => s.faithRoutines);
  const logs = useRoutineStore((s) => s.logs);
  const tree = useTreeGrowth();

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 데이터 변경 → 디바운스 푸시
  useEffect(() => {
    if (!native || !dataHydrated || !isAuthenticated) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void pushWidgetSnapshot(), 600);
    return () => clearTimeout(timer.current);
  }, [native, dataHydrated, isAuthenticated, habitLogs, faithRoutines, logs, tree]);

  // hydrate 완료 직후 reconcile (서버 우선 덮어쓰기 이후라 안전)
  useEffect(() => {
    if (!native || !dataHydrated) return;
    void reconcilePending();
  }, [native, dataHydrated]);

  // 앱 재개 시 reconcile
  useEffect(() => {
    if (!native) return;
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void reconcilePending();
    });
    return () => void handle.then((h) => h.remove());
  }, [native]);

  return null;
}
