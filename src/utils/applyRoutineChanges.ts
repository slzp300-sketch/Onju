import type { RoutineChange, DailyRoutine } from '../types';
import { getNextWeekApplyTime } from './date';

interface RoutineStoreActions {
  deactivateRoutine: (id: string) => void;
  updateRoutine: (id: string, changes: Partial<Pick<DailyRoutine, 'title' | 'frequency'>>) => void;
  addRoutine: (routine: DailyRoutine) => void;
}

export function applyRoutineChanges(
  changes: RoutineChange[],
  store: RoutineStoreActions,
  userId: string
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
            id: `pr-review-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            userId,
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
