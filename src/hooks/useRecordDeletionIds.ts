import { useCallback, useSyncExternalStore } from 'react';
import { useAuthStore } from '../store/authStore';
import { pendingRecordIds } from '../lib/sync/outbox';
function subscribe(change:()=>void) { window.addEventListener('onju-outbox-changed',change); return ()=>window.removeEventListener('onju-outbox-changed',change); }
export function useRecordDeletionIds() {
  const owner=useAuthStore(s=>s.user?.id??'');
  const snapshot=useCallback(()=>JSON.stringify(pendingRecordIds(owner,true)),[owner]);
  return JSON.parse(useSyncExternalStore(subscribe,snapshot)) as string[];
}
