import { useRoutineStore } from '../../store/routineStore';
import { useHabitStore } from '../../store/habitStore';
import { useGoalStore } from '../../store/goalStore';
import { useTodoStore } from '../../store/todoStore';
import { useDiaryStore } from '../../store/diaryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useStreakStore } from '../../store/streakStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useGroupStore } from '../../store/groupStore';
import { useCheerStore } from '../../store/cheerStore';
import * as repos from '../../data/repos';
import { listMyGroups, listMyCheers } from '../../data/groupRepos';

/** hydrate로 인한 setState가 설정 동기화 구독을 다시 트리거하지 않도록 막는 플래그 */
let hydrating = false;
/** INITIAL_SESSION/SIGNED_IN 이벤트 레이스로 인한 중복 hydrate 방지 */
let hydratedFor: string | null = null;

/** 로그아웃 시 호출 — 다음 로그인에서 hydrate가 다시 돌도록 리셋 */
export function resetHydration() {
  hydratedFor = null;
}

/**
 * 로그인(세션 복원 포함) 시 서버 데이터를 전체 스토어에 채운다. 서버가 우선.
 * 실패한 항목은 로컬(persist 캐시) 상태를 유지한다.
 */
export async function hydrateUserData(userId: string): Promise<void> {
  if (hydratedFor === userId) return;
  hydratedFor = userId;
  hydrating = true;
  try {
    const results = await Promise.allSettled([
      repos.listRoutines(),       // 0
      repos.listRoutineLogs(),    // 1
      repos.listHabits(),         // 2
      repos.listHabitLogs(),      // 3
      repos.listPersonalRoutines(), // 4
      repos.listMonthlyGoals(),   // 5
      repos.listWeeklyGoals(),    // 6
      repos.listTodos(),          // 7
      repos.listDiaryEntries(),   // 8
      repos.fetchUserSettings(),  // 9
      repos.fetchGoalSlots(userId), // 10
      listMyGroups(),             // 11
      listMyCheers(userId),       // 12
    ]);

    const ok = <T>(i: number): T | null =>
      results[i].status === 'fulfilled' ? (results[i] as PromiseFulfilledResult<T>).value : null;
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[sync] hydrate(${i}) 실패:`, r.reason?.message ?? r.reason);
    });

    const routines = ok<Awaited<ReturnType<typeof repos.listRoutines>>>(0);
    const routineLogs = ok<Awaited<ReturnType<typeof repos.listRoutineLogs>>>(1);
    if (routines && routineLogs) {
      useRoutineStore.setState({
        personalRoutines: routines.filter(r => r.type === 'personal'),
        faithRoutines: routines.filter(r => r.type === 'faith'),
        logs: routineLogs,
      });
    }

    const habits = ok<Awaited<ReturnType<typeof repos.listHabits>>>(2);
    const habitLogs = ok<Awaited<ReturnType<typeof repos.listHabitLogs>>>(3);
    const personalRoutines = ok<Awaited<ReturnType<typeof repos.listPersonalRoutines>>>(4);
    if (habits && habitLogs && personalRoutines) {
      useHabitStore.setState({ habits, habitLogs, personalRoutines });
    }

    const monthlyGoals = ok<Awaited<ReturnType<typeof repos.listMonthlyGoals>>>(5);
    const weeklyGoals = ok<Awaited<ReturnType<typeof repos.listWeeklyGoals>>>(6);
    const goalSlots = ok<number>(10);
    if (monthlyGoals && weeklyGoals) {
      useGoalStore.setState({
        monthlyGoals,
        weeklyGoals,
        ...(goalSlots != null ? { goalSlots } : {}),
      });
    }

    const todos = ok<Awaited<ReturnType<typeof repos.listTodos>>>(7);
    if (todos) useTodoStore.setState({ todos });

    const diary = ok<Awaited<ReturnType<typeof repos.listDiaryEntries>>>(8);
    if (diary) useDiaryStore.setState({ entries: diary });

    const settingsRow = ok<Awaited<ReturnType<typeof repos.fetchUserSettings>>>(9);
    if (settingsRow) {
      const { settings, streak, notifications } = settingsRow;
      if (settings && Object.keys(settings).length > 0) {
        useSettingsStore.setState(settings as Partial<ReturnType<typeof useSettingsStore.getState>>);
      }
      if (streak && Object.keys(streak).length > 0) {
        useStreakStore.setState(streak as Partial<ReturnType<typeof useStreakStore.getState>>);
      }
      if (notifications && Object.keys(notifications).length > 0) {
        // permission은 기기 고유 상태 — 서버 값으로 덮지 않는다
        const rest = { ...(notifications as Record<string, unknown>) };
        delete rest.permission;
        useNotificationStore.setState(rest as Partial<ReturnType<typeof useNotificationStore.getState>>);
      }
    }

    const myGroups = ok<Awaited<ReturnType<typeof listMyGroups>>>(11);
    if (myGroups) {
      useGroupStore.setState({
        groups: myGroups,
        myGroupIds: myGroups.map(g => g.id),
      });
    }

    const cheered = ok<Awaited<ReturnType<typeof listMyCheers>>>(12);
    if (cheered) useCheerStore.setState({ cheered });

    registerSettingsSync(userId);
  } finally {
    hydrating = false;
  }
}

/**
 * 설정류 스토어는 액션별 write-through 대신 구독 + 디바운스로
 * user_settings jsonb 컬럼에 통째 upsert 한다.
 */
let settingsSyncRegistered = false;
function registerSettingsSync(userId: string) {
  if (settingsSyncRegistered) return;
  settingsSyncRegistered = true;

  const debounce = (fn: () => void, ms = 1000) => {
    let t: ReturnType<typeof setTimeout> | undefined;
    return () => {
      clearTimeout(t);
      t = setTimeout(fn, ms);
    };
  };

  const pushSettings = debounce(() => {
    const { weekStartDay, graceEndHour } = useSettingsStore.getState();
    repos.upsertUserSettings(userId, { settings: { weekStartDay, graceEndHour } });
  });
  const pushStreak = debounce(() => {
    const { shields, lastCheckedStreak } = useStreakStore.getState();
    repos.upsertUserSettings(userId, { streak: { shields, lastCheckedStreak } });
  });
  const pushNotifications = debounce(() => {
    const { morningEnabled, morningTime, eveningEnabled, eveningTime, reviewEnabled } =
      useNotificationStore.getState();
    repos.upsertUserSettings(userId, {
      notifications: { morningEnabled, morningTime, eveningEnabled, eveningTime, reviewEnabled },
    });
  });

  useSettingsStore.subscribe(() => { if (!hydrating) pushSettings(); });
  useStreakStore.subscribe(() => { if (!hydrating) pushStreak(); });
  useNotificationStore.subscribe(() => { if (!hydrating) pushNotifications(); });
}
