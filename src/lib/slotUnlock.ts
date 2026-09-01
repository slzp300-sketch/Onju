import { format } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';
import { getWeekRangeFor } from '../utils/date';
import { avgWeeklyGoalRate } from '../utils/weeklyGoalProgress';

const MAX_SLOTS = 5;
const UNLOCK_THRESHOLD = 80;

/**
 * 주 시작 후 첫 진입에서 지난 주 주간 목표 평균 달성률을 판정해
 * 슬롯을 해금한다 (80% 이상, 최대 5, 주당 1회).
 * hydrate 완료 후 호출 — 서버 로그가 채워진 상태여야 판정이 정확하다.
 */
export function checkWeeklySlotUnlock(): void {
  const { user, updateWeeklySlots } = useAuthStore.getState();
  const { lastSlotUnlockWeek, weekStartDay, setLastSlotUnlockWeek } = useSettingsStore.getState();
  if (!user || user.weeklyGoalSlots >= MAX_SLOTS) return;

  const thisWeekKey = format(getWeekRangeFor(new Date(), weekStartDay).start, 'yyyy-MM-dd');
  if (lastSlotUnlockWeek === thisWeekKey) return; // 이번 주는 이미 처리함

  const lastWeek = getWeekRangeFor(new Date(Date.now() - 7 * 24 * 3600 * 1000), weekStartDay);
  const lastStart = format(lastWeek.start, 'yyyy-MM-dd');
  const lastEnd = format(lastWeek.end, 'yyyy-MM-dd');

  const lastWeekGoals = useGoalStore.getState().weeklyGoals
    .filter(g => g.startDate <= lastEnd && g.endDate >= lastStart);
  if (lastWeekGoals.length === 0) return;

  const avg = avgWeeklyGoalRate(
    lastWeekGoals,
    useHabitStore.getState().habitLogs,
    useRoutineStore.getState().logs,
  );
  if (avg < UNLOCK_THRESHOLD) return; // 유예 체크로 넘을 수 있으니 마크하지 않고 재시도 여지를 둔다

  const newCount = Math.min(MAX_SLOTS, user.weeklyGoalSlots + 1);
  updateWeeklySlots(newCount);
  setLastSlotUnlockWeek(thisWeekKey); // user_settings 동기화 경로로 기기 간 전파
  useUIStore.getState().setPendingUnlock(newCount);
}
