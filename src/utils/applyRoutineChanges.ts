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
            id: newId(),
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
