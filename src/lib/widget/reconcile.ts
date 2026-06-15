import { Capacitor } from '@capacitor/core';
import { useRoutineStore } from '../../store/routineStore';
import { useHabitStore } from '../../store/habitStore';
import { WidgetBridge } from '../../plugins/widget-bridge';
import { pushWidgetSnapshot } from './snapshot';

interface PendingAction {
  kind: 'personal' | 'faith';
  id: string;
  date: string;
  ts: number;
}

/**
 * 위젯에서 체크한 항목들을 앱 스토어에 반영한다.
 * - hydrate(서버 우선) 이후에 호출해야 토글이 덮어써지지 않는다.
 * - 멱등: 이미 완료된 항목은 건너뛴다(중복 토글로 해제되는 것 방지).
 * 마지막에 최신 스냅샷을 다시 밀어 위젯·앱·서버를 일치시킨다.
 */
export async function reconcilePending(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  let queue: PendingAction[] = [];
  try {
    const { json } = await WidgetBridge.consumePending();
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) queue = parsed;
  } catch (e) {
    console.error('[widget] consumePending 실패:', e);
    return;
  }

  if (queue.length > 0) {
    const habitStore = useHabitStore.getState();
    const routineStore = useRoutineStore.getState();
    for (const a of queue) {
      if (!a?.id) continue;
      if (a.kind === 'personal') {
        if (!habitStore.isHabitCompleted(a.id, a.date)) habitStore.toggleHabitLog(a.id, a.date);
      } else {
        if (!routineStore.isCompleted(a.id, a.date)) routineStore.toggleRoutineLog(a.id, a.date);
      }
    }
  }

  // 큐가 비어도 재개 시 위젯을 최신 상태로 한번 맞춘다.
  await pushWidgetSnapshot();
}
