import { useRoutineStore } from '../store/routineStore';
import { useGoalStore } from '../store/goalStore';
import { useGroupStore } from '../store/groupStore';
import { useDiaryStore } from '../store/diaryStore';
import { useCheerStore } from '../store/cheerStore';
import { useHabitStore } from '../store/habitStore';
import { useStreakStore } from '../store/streakStore';
import { useTodoStore } from '../store/todoStore';
import { useSettingsStore } from '../store/settingsStore';
import { useNotificationStore } from '../store/notificationStore';
import { useTreeStore } from '../store/treeStore';
import { useUIStore } from '../store/uiStore';
import { queryClient } from '../lib/queryClient';

/**
 * 로그아웃 시 전체 사용자 데이터 초기화.
 * 표시용 스토어·조회 캐시를 비운다. 미전송 outbox는 별도로 계정별 보관한다.
 * (테마는 기기 설정으로 보고 유지)
 */
export function clearStores() {
  // 진행 중인 조회도 취소한다. 늦은 응답이 다음 계정의 캐시에 남지 않는다.
  queryClient.clear();
  useRoutineStore.setState({ personalRoutines: [], faithRoutines: [], logs: [] });
  useGoalStore.setState({ monthlyGoals: [], weeklyGoals: [], goalSlots: 3 });
  useGroupStore.setState({ groups: [], myGroupIds: [], membershipStatus: {}, creationStatus: {}, statusChanges: {} });
  useDiaryStore.setState({ entries: [] });
  useCheerStore.setState({ cheered: {} });
  useHabitStore.setState({ habits: [], personalRoutines: [], habitLogs: [] });
  useStreakStore.setState({ shields: 0, lastCheckedStreak: 0 });
  useTodoStore.setState({ todos: [] });
  useSettingsStore.setState({ weekStartDay: 1, graceEndHour: 6, lastSlotUnlockWeek: '' });
  useNotificationStore.setState({
    morningEnabled: false,
    morningTime: '07:00',
    eveningEnabled: false,
    eveningTime: '21:00',
    reviewEnabled: true,
  });
  useTreeStore.setState({ lastCelebratedStage: null });
  useUIStore.setState({ dataHydrated: false, pendingStageUp: null, pendingUnlockCelebration: false, newSlotCount: 0 });

  const keys = [
    'routine-store', 'goal-store', 'group-store', 'diary-store', 'cheer-store',
    'habit-store', 'streak-store', 'todo-store', 'settings-store', 'notification-store',
    'tree-store',
  ];
  for (const key of keys) localStorage.removeItem(key);
  // 구버전(계정별 키) 잔재 제거
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && keys.some(base => k.startsWith(`${base}-`))) localStorage.removeItem(k);
  }
  localStorage.removeItem('jikjang_accounts');
}
