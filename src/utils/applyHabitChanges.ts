import type { HabitChange, Habit } from '../types';

interface HabitStoreActions {
  removeHabit: (id: string) => void;
  updateHabit: (id: string, patch: Partial<Habit>) => void;
}

export function applyHabitChanges(
  changes: HabitChange[],
  store: HabitStoreActions,
): void {
  for (const change of changes) {
    switch (change.action) {
      case 'delete':
        store.removeHabit(change.habitId);
        break;
      case 'edit':
        if (change.changes) {
          store.updateHabit(change.habitId, change.changes);
        }
        break;
      case 'keep':
      default:
        break;
    }
  }
}
