import { supabaseForSession } from './supabase';

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const OWNER_KEY = 'onju-push-owner';

export function isWebPushConfigured(): boolean {
  return !!VAPID_PUBLIC && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
function applicationKey(): Uint8Array {
  const base64 = VAPID_PUBLIC!;
  return Uint8Array.from(atob((base64 + '='.repeat((4 - base64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
}

/** 알림 작업 큐에서만 실행해 이전 계정의 해제가 새 구독을 지우지 않도록 한다. */
export async function reconcileWebPush(ownerId: string | null, accessToken: string | null, enabled: boolean | null, isCurrent: () => boolean): Promise<void> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  // ready는 SW가 없는 환경에서 영원히 기다릴 수 있다.
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration?.active) {
    if (enabled) throw new Error('알림 서비스를 준비하지 못했어요.');
    return;
  }
  let sub = await registration.pushManager.getSubscription();
  const previousOwner = localStorage.getItem(OWNER_KEY);
  if (sub && (enabled === false || !ownerId || previousOwner !== ownerId)) {
    if (!(await sub.unsubscribe())) throw new Error('이전 알림 구독을 해제하지 못했어요.');
    sub = null;
    localStorage.removeItem(OWNER_KEY);
  }
  if (!enabled || !ownerId || !accessToken || !isCurrent()) return;
  sub ??= await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey() as BufferSource });
  if (!isCurrent()) {
    if (!(await sub.unsubscribe())) throw new Error('이전 알림 구독을 해제하지 못했어요.');
    return;
  }
  localStorage.setItem(OWNER_KEY, ownerId);
  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) throw new Error('알림 구독 정보를 읽지 못했어요.');
  const { error } = await supabaseForSession(accessToken).from('push_subscriptions').upsert({
    user_id: ownerId, endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth,
  }, { onConflict: 'endpoint' }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
}
