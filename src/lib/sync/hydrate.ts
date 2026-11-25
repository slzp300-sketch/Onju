import { localTimeZone } from '../../utils/timeZone';
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
import { flush, pendingCount, pendingGoalIds, pendingPracticeIds, pendingPlanIds, pendingRecordIds } from './outbox';

/** hydrate로 인한 setState가 설정 동기화 구독을 다시 트리거하지 않도록 막는 플래그 */
let hydrating = false;
/** INITIAL_SESSION/SIGNED_IN 이벤트 레이스로 인한 중복 hydrate 방지 */
let hydratedFor: string | null = null;
let generation = 0;
let activeUserId: string | null = null;
let activeHydration: Promise<void> | null = null;
const settingsTimers = new Map<ReturnType<typeof setTimeout>, () => void>();

/** 계정 전환·앱 종료 전에 아직 디바운스 중인 설정도 기존 소유자의 큐에 넣는다. */
export function flushPendingSettings() {
  for (const [timer, push] of settingsTimers) {
    clearTimeout(timer);
    settingsTimers.delete(timer);
    push();
  }
}

/** 로그아웃 시 호출 — 다음 로그인에서 hydrate가 다시 돌도록 리셋 */
export function resetHydration() {
  generation += 1;
  activeUserId = null;
  activeHydration = null;
  hydrating = false;
  for (const timer of settingsTimers.keys()) clearTimeout(timer);
  settingsTimers.clear();
  hydratedFor = null;
  // 대기 중인 디바운스가 로그아웃/계정 전환 이후에 발화해도 이전 계정으로 쓰지 않도록
  settingsSyncUserId = null;
}

/**
 * 로그인(세션 복원 포함) 시 서버 데이터를 전체 스토어에 채운다. 서버가 우선.
 * 실패한 항목은 로컬(persist 캐시) 상태를 유지한다.
 */
export async function hydrateUserData(userId: string): Promise<void> {
  if (activeUserId && activeUserId !== userId) resetHydration();
  if (hydratedFor === userId) return;
  if (activeUserId === userId && activeHydration) return activeHydration;
  activeUserId = userId;
  const version = generation;
  const task = performHydration(userId, version);
  activeHydration = task;
  try { await task; } finally {
    if (generation === version) activeHydration = null;
  }
}

async function performHydration(userId: string, version: number): Promise<void> {
  const current = () => generation === version && activeUserId === userId;
  try {
    // 서버 조회는 저장 대기 작업이 끝난 뒤 시작한다. 실패 시 로컬 변경을 보존한다.
    await flush();
    if (!current()) return;
    registerSettingsSync(userId);
    if (pendingCount() > 0 || settingsTimers.size > 0) return;
    const stores = [useRoutineStore, useHabitStore, useGoalStore, useTodoStore,
      useDiaryStore, useSettingsStore, useStreakStore, useNotificationStore,
      useThemeStore, useTreeStore, useGroupStore, useCheerStore];
    const before = stores.map(store => store.getState());
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
      listMyGroups(userId),             // 11
      listMyCheers(userId),       // 12
    ]);

    if (!current()) return;
    // 조회 중 사용자가 편집했거나 새 쓰기가 생겼다면 오래된 전체 스냅샷을 적용하지 않는다.
    if (pendingCount() > 0 || settingsTimers.size > 0 || stores.some((store, i) => store.getState() !== before[i])) {
      if (pendingCount() === 0 && settingsTimers.size === 0) {
        setTimeout(() => { if (current()) void hydrateUserData(userId); }, 0);
      }
      return;
    }
    hydrating = true;
    const protectedRecords = new Set(pendingRecordIds(userId));
    const mergeRecords = <T,>(server:T[],local:T[],key:(item:T)=>string) => [
      ...server.filter(i=>!protectedRecords.has(key(i))),...local.filter(i=>protectedRecords.has(key(i))),
    ];
    const protectedPlans = new Set(pendingPlanIds(userId));
    const mergePlans = <T extends { id: string }>(server: T[], local: T[], kind: string) => [
      ...server.filter(i => !protectedPlans.has(`${kind}:${i.id}`)), ...local.filter(i => protectedPlans.has(`${kind}:${i.id}`)),
    ];
    const protectedPractice = new Set(pendingPracticeIds(userId));
    const mergePractice = <T extends { id: string }>(server: T[], local: T[], kind: string) => [
      ...server.filter(item => !protectedPractice.has(`${kind}:${item.id}`)),
      ...local.filter(item => protectedPractice.has(`${kind}:${item.id}`)),
    ];

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
        personalRoutines: mergePractice(routines.filter(r => r.type === 'personal'), useRoutineStore.getState().personalRoutines, 'routine'),
        faithRoutines: mergePractice(routines.filter(r => r.type === 'faith'), useRoutineStore.getState().faithRoutines, 'routine'),
        logs: [ ...routineLogs.map(l=>{
          const local=useRoutineStore.getState().logs.find(i=>i.routineId===l.routineId && i.date===l.date);
          return local && (protectedRecords.has(`memo:${l.routineId}:${l.date}`)||protectedRecords.has(`memo:legacy-id:${l.id}`))?{...l,memo:local.memo,memoRevision:local.memoRevision}:l;
        }),...useRoutineStore.getState().logs.filter(l=>(protectedRecords.has(`memo:${l.routineId}:${l.date}`)||protectedRecords.has(`memo:legacy-id:${l.id}`)) && !routineLogs.some(i=>i.routineId===l.routineId && i.date===l.date)) ],
      });
    }

    const habits = ok<Awaited<ReturnType<typeof repos.listHabits>>>(2);
    const habitLogs = ok<Awaited<ReturnType<typeof repos.listHabitLogs>>>(3);
    const personalRoutines = ok<Awaited<ReturnType<typeof repos.listPersonalRoutines>>>(4);
    if (habits && habitLogs && personalRoutines) {
      useHabitStore.setState({ habits: mergePractice(habits, useHabitStore.getState().habits, 'habit'), habitLogs, personalRoutines: mergePlans(personalRoutines, useHabitStore.getState().personalRoutines, 'bundle') });
    }

    const monthlyGoals = ok<Awaited<ReturnType<typeof repos.listMonthlyGoals>>>(5);
    const weeklyGoals = ok<Awaited<ReturnType<typeof repos.listWeeklyGoals>>>(6);
    const goalSlots = ok<number>(10);
    if (monthlyGoals && weeklyGoals) {
      const protectedIds = new Set(pendingGoalIds(userId));
      useGoalStore.setState({
        monthlyGoals: [...monthlyGoals.filter(g => !protectedIds.has(g.id)),
          ...useGoalStore.getState().monthlyGoals.filter(g => protectedIds.has(g.id))],
        weeklyGoals: mergePlans(weeklyGoals, useGoalStore.getState().weeklyGoals, 'weekly'),
        ...(goalSlots != null ? { goalSlots } : {}),
      });
    }

    const todos = ok<Awaited<ReturnType<typeof repos.listTodos>>>(7);
    if (todos) useTodoStore.setState({ todos:mergeRecords(todos,useTodoStore.getState().todos,t=>`todo:${t.id}`) });

    const diary = ok<Awaited<ReturnType<typeof repos.listDiaryEntries>>>(8);
    if (diary) useDiaryStore.setState({ entries:mergeRecords(diary,useDiaryStore.getState().entries,e=>`diary:${e.date}`) });

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

    if (results.every(result => result.status === 'fulfilled')) hydratedFor = userId;
    if (results[9].status === 'fulfilled' && settingsRow?.settings?.timeZone !== localTimeZone()) {
      const { weekStartDay, graceEndHour, lastSlotUnlockWeek } = useSettingsStore.getState();
      repos.upsertUserSettings(userId, { settings: { ...settingsRow?.settings, weekStartDay, graceEndHour, lastSlotUnlockWeek,
        theme: useThemeStore.getState().theme, lastCelebratedStage: useTreeStore.getState().lastCelebratedStage, timeZone: localTimeZone() } });
    }
  } finally {
    if (current()) {
      hydrating = false;
      useUIStore.getState().setDataHydrated();
    }
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
      if (!settingsSyncUserId) return;
      const version = generation;
      const owner = settingsSyncUserId;
      clearTimeout(t);
      if (t) settingsTimers.delete(t);
      const push = () => {
        if (t) settingsTimers.delete(t);
        if (generation === version && owner === settingsSyncUserId) fn();
      };
      t = setTimeout(push, ms);
      settingsTimers.set(t, push);
    };
  };

  const pushSettings = debounce(() => {
    if (!settingsSyncUserId) return;
    const { weekStartDay, graceEndHour, lastSlotUnlockWeek } = useSettingsStore.getState();
    const { theme } = useThemeStore.getState();
    const { lastCelebratedStage } = useTreeStore.getState();
    repos.upsertUserSettings(settingsSyncUserId, {
      settings: { weekStartDay, graceEndHour, lastSlotUnlockWeek, theme, lastCelebratedStage, timeZone: localTimeZone() },
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

// 실패·오프라인 후에는 현재 계정의 데이터만 다시 가져온다.
if (typeof window !== 'undefined') {
  const retry = () => { if (activeUserId) { hydratedFor = null; void hydrateUserData(activeUserId); } };
  window.addEventListener('online', retry);
  window.addEventListener('pagehide', flushPendingSettings);
  window.addEventListener('onju-outbox-drained', retry);
  window.addEventListener('onju-review-step-saved', () => {
    const owner=activeUserId, version=generation;
    // A review can save another step while the previous snapshot is still loading.
    // Refresh after that snapshot finishes so the last committed step is not missed.
    void Promise.resolve(activeHydration).then(() => {
      if(owner && owner===activeUserId && version===generation) retry();
    });
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retry();
    else flushPendingSettings();
  });
}
