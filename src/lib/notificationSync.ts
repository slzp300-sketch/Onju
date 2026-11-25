import type { Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { create } from 'zustand';
import { createNotificationQueue } from './notificationQueue';
import { syncNativeNotifications } from './nativeNotifications';
import { isWebPushConfigured, reconcileWebPush } from './webPush';
import { syncReminderSchedule } from './reminderSchedule';
import type { ReminderSpec } from './reminderSpecs';

export const useNotificationSync = create<{ status: 'idle' | 'syncing' | 'saved' | 'error' }>(() => ({ status: 'idle' }));
let session: Session | null = null;
let owner: string | null | undefined;
let requested: { ownerId: string; specs: ReminderSpec[]; granted: boolean } | null = null;
type Request = { ownerId: string | null; token: string | null; specs: ReminderSpec[]; enabled: boolean; ready: boolean };
const queue = createNotificationQueue<Request>(async (request, isCurrent) => {
  if (Capacitor.isNativePlatform()) {
    await syncNativeNotifications(request.enabled ? request.specs : [], isCurrent);
  } else {
    const apply = async () => {
      if (!isCurrent()) return;
      await reconcileWebPush(request.ownerId, request.token, request.ready ? request.enabled && isWebPushConfigured() : null, isCurrent);
      // hydrate 전 빈 기본값으로 다른 기기의 서버 예약까지 지우지 않는다.
      if (request.ready && request.token && isWebPushConfigured() && isCurrent()) await syncReminderSchedule(request.specs, request.token);
    };
    if (navigator.locks?.request) await navigator.locks.request('onju-notification-subscription', apply);
    else await apply();
  }
}, status => useNotificationSync.setState({ status }));

function publish() {
  const current = requested?.ownerId === owner ? requested : null;
  queue.update({ ownerId: owner ?? null, token: session?.access_token ?? null, ready: !!current,
    specs: current?.specs ?? [], enabled: !!current?.granted && !!current.specs.length });
}

/** Auth 콜백에서 소유자를 즉시 무효화한다. 큐는 공유 Auth 클라이언트를 호출하지 않는다. */
export function setNotificationSession(next: Session | null) {
  const nextOwner = next?.user.id ?? null;
  const changed = owner !== nextOwner;
  const tokenChanged = session?.access_token !== next?.access_token;
  session = next;
  owner = nextOwner;
  if (changed) { requested = null; publish(); }
  else if ((tokenChanged && requested) || useNotificationSync.getState().status === 'error') publish();
}
export function updateNotificationSchedule(ownerId: string, specs: ReminderSpec[], granted: boolean) {
  if (owner !== ownerId) return;
  requested = { ownerId, specs, granted };
  publish();
}
export function retryNotificationSync() { publish(); }
