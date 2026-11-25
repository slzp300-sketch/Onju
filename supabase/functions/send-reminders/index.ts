// Supabase Edge Function: send-reminders
// pg_cron이 매분 호출 → 저장된 시간대의 현재 시각에 해당하는 reminder_schedule을 조회해 Web Push 발송.
// 배포: supabase functions deploy send-reminders --no-verify-jwt
// 필요한 시크릿: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT(선택)
//   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@onju.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
);

interface Reminder { user_id: string; title: string; body: string }
interface Sub { endpoint: string; p256dh: string; auth: string; user_id: string }

Deno.serve(async () => {
  const { data: reminders, error } = await supabase.rpc('claim_due_reminders');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  if (!reminders || reminders.length === 0) {
    return new Response(JSON.stringify({ sent: 0 }), { headers: { 'content-type': 'application/json' } });
  }

  const byUser = new Map<string, Reminder[]>();
  for (const r of reminders as Reminder[]) {
    const arr = byUser.get(r.user_id) ?? [];
    arr.push(r);
    byUser.set(r.user_id, arr);
  }

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', [...byUser.keys()]);

  let sent = 0;
  let removed = 0;

  for (const sub of (subs ?? []) as Sub[]) {
    for (const r of byUser.get(sub.user_id) ?? []) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: r.title, body: r.body, url: '/' }),
          { TTL: 60 },
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // 만료/무효 구독 정리
        if (status === 404 || status === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
          removed++;
        }
      }
    }
  }

  return new Response(JSON.stringify({ sent, removed }), { headers: { 'content-type': 'application/json' } });
});
