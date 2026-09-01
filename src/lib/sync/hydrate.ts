import { useRoutineStore } from '../../store/routineStore';
import { useHabitStore } from '../../store/habitStore';
import { useGoalStore } from '../../store/goalStore';
import { useTodoStore } from '../../store/todoStore';
import { useDiaryStore } from '../../store/diaryStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useStreakStore } from '../../store/streakStore';
import { useNotificationStore } from '../../store/notificationStore';
import { useThemeStore, applyTheme, type ThemeId } from '../../store/themeStore';
import { useTreeStore } from '../../store/treeStore';
import { useUIStore } from '../../store/uiStore';
import { useGroupStore } from '../../store/groupStore';
import { useCheerStore } from '../../store/cheerStore';
import * as repos from '../../data/repos';
import { listMyGroups, listMyCheers } from '../../data/groupRepos';
import { toast } from '../../store/toastStore';

/** hydrate로 인한 setState가 설정 동기화 구독을 다시 트리거하지 않도록 막는 플래그 */
let hydrating = false;
/** INITIAL_SESSION/SIGNED_IN 이벤트 레이스로 인한 중복 hydrate 방지 */
let hydratedFor: string | null = null;

/** 로그아웃 시 호출 — 다음 로그인에서 hydrate가 다시 돌도록 리셋 */
export function resetHydration() {
  hydratedFor = null;
  // 대기 중인 디바운스가 로그아웃/계정 전환 이후에 발화해도 이전 계정으로 쓰지 않도록
  settingsSyncUserId = null;
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
    if (results.some(r => r.status === 'rejected')) {
      toast.error('일부 데이터를 불러오지 못했어요. 네트워크를 확인해주세요.');
    }

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
        const { theme, lastCelebratedStage, ...rest } =
          settings as { theme?: ThemeId; lastCelebratedStage?: number } & Record<string, unknown>;
        if (theme) {
          useThemeStore.setState({ theme });
          applyTheme(theme);
        }
        if (typeof lastCelebratedStage === 'number') {
          useTreeStore.setState({ lastCelebratedStage });
        }
        if (Object.keys(rest).length > 0) {
          useSettingsStore.setState(rest as Partial<ReturnType<typeof useSettingsStore.getState>>);
        }
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
    useUIStore.getState().setDataHydrated();
  }
}

/**
 * 설정류 스토어는 액션별 write-through 대신 구독 + 디바운스로
 * user_settings jsonb 컬럼에 통째 upsert 한다.
 */
let settingsSyncRegistered = false;
/** 구독 클로저가 아니라 이 변수를 읽는다 — 계정 전환 시에도 항상 현재 사용자로 쓴다 */
let settingsSyncUserId: string | null = null;
function registerSettingsSync(userId: string) {
  settingsSyncUserId = userId;
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
    if (!settingsSyncUserId) return;
    const { weekStartDay, graceEndHour } = useSettingsStore.getState();
    const { theme } = useThemeStore.getState();
    const { lastCelebratedStage } = useTreeStore.getState();
    repos.upsertUserSettings(settingsSyncUserId, {
      settings: { weekStartDay, graceEndHour, theme, lastCelebratedStage },
    });
  });
  const pushStreak = debounce(() => {
    if (!settingsSyncUserId) return;
    const { shields, lastCheckedStreak } = useStreakStore.getState();
    repos.upsertUserSettings(settingsSyncUserId, { streak: { shields, lastCheckedStreak } });
  });
  const pushNotifications = debounce(() => {
    if (!settingsSyncUserId) return;
    const { morningEnabled, morningTime, eveningEnabled, eveningTime, reviewEnabled } =
      useNotificationStore.getState();
    repos.upsertUserSettings(settingsSyncUserId, {
      notifications: { morningEnabled, morningTime, eveningEnabled, eveningTime, reviewEnabled },
    });
  });

  useSettingsStore.subscribe(() => { if (!hydrating) pushSettings(); });
  useThemeStore.subscribe(() => { if (!hydrating) pushSettings(); });
  useTreeStore.subscribe(() => { if (!hydrating) pushSettings(); });
  useStreakStore.subscribe(() => { if (!hydrating) pushStreak(); });
  useNotificationStore.subscribe(() => { if (!hydrating) pushNotifications(); });
}
