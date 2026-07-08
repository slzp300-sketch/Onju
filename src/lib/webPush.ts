import { supabase } from './supabase';

/**
 * 웹 Push 구독 관리 — 브라우저 pushManager 구독을 Supabase push_subscriptions에 저장한다.
 * 실제 발송은 서버(Edge Function send-reminders)가 담당한다.
 */

const VAPID_PUBLIC = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export function isWebPushConfigured(): boolean {
  return (
    !!VAPID_PUBLIC &&
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

/** 구독 생성(또는 재사용) 후 Supabase에 저장. 성공 시 true. */
export async function subscribeWebPush(): Promise<boolean> {
  if (!isWebPushConfigured()) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC!) as BufferSource,
      });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const json = sub.toJSON();
    if (!json.keys?.p256dh || !json.keys?.auth) return false;
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: user.id, endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'endpoint' },
    );
    if (error) { console.error('[webPush] 구독 저장 실패', error); return false; }
    return true;
  } catch (e) {
    console.error('[webPush] 구독 실패', e);
    return false;
  }
}

/** 구독 해제 + Supabase에서 제거 */
export async function unsubscribeWebPush(): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch (e) {
    console.error('[webPush] 구독 해제 실패', e);
  }
}
