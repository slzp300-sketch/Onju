import type { RoutineChange, DailyRoutine } from '../types';
import { getNextWeekApplyTime } from './date';
import { newId } from './id';

interface RoutineStoreActions {
  deactivateRoutine: (id: string) => void;
  updateRoutine: (id: string, changes: Partial<Pick<DailyRoutine, 'title' | 'frequency' | 'when' | 'twoMinuteHabit' | 'emoji'>>) => void;
  addRoutine: (routine: DailyRoutine) => void;
}

export function applyRoutineChanges(
  changes: RoutineChange[],
  store: RoutineStoreActions
) {
  const appliedAt = getNextWeekApplyTime();

  for (const change of changes) {
    switch (change.action) {
      case 'delete':
        store.deactivateRoutine(change.routineId);
        break;
      case 'edit':
        if (change.changes) {
          store.updateRoutine(change.routineId, change.changes);
        }
        break;
      case 'add':
        if (change.newRoutine) {
          store.addRoutine({
            ...change.newRoutine,
            id: newId(),
            // 서버가 auth.uid()로 채운다 — 로컬 상태의 userId는 쓰이지 않는다
            userId: '',
            createdAt: appliedAt,
          });
        }
        break;
      case 'keep':
      default:
        break;
    }
  }
}
