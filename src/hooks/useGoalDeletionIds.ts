import { useCallback, useSyncExternalStore } from 'react';
import { pendingGoalDeletionIds } from '../lib/sync/outbox';
import { useAuthStore } from '../store/authStore';

function subscribe(change: () => void) {
  window.addEventListener('onju-outbox-changed', change);
  return () => window.removeEventListener('onju-outbox-changed', change);
}
export function useGoalDeletionIds(): string[] {
  const owner = useAuthStore(s => s.user?.id ?? '');
  const snapshot = useCallback(() => JSON.stringify(pendingGoalDeletionIds(owner)), [owner]);
  return JSON.parse(useSyncExternalStore(subscribe, snapshot));
}
