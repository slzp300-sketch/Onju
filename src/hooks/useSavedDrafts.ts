import { useCallback, useSyncExternalStore } from 'react';
import { listDrafts, type LocalDraft } from '../lib/localDrafts';
import { useAuthStore } from '../store/authStore';
function subscribe(change:()=>void) {
  window.addEventListener('onju-drafts-changed',change); window.addEventListener('storage',change);
  return ()=>{window.removeEventListener('onju-drafts-changed',change);window.removeEventListener('storage',change);};
}
export function useSavedDrafts<T>(prefix:string,validate:(value:unknown)=>value is T) {
  const owner = useAuthStore(s=>s.user?.id);
  const snapshot = useCallback(()=>{try{return JSON.stringify({drafts:owner?listDrafts(owner,prefix,validate):[],error:false});}catch{return JSON.stringify({drafts:[],error:true});}},[owner,prefix,validate]);
  return JSON.parse(useSyncExternalStore(subscribe,snapshot)) as {drafts:LocalDraft<T>[];error:boolean};
}
