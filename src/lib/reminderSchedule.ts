import { supabase } from './supabase';
import type { ReminderSpec } from './reminderSpecs';

/**
 * 클라이언트가 계산한 알림 spec을 Supabase reminder_schedule에 전체 교체 저장한다.
 * Edge Function(send-reminders)이 매분 이 테이블을 조회해 Web Push를 발송한다.
 * 시각은 KST(Asia/Seoul) 기준으로 해석한다 — Edge Function과 규약을 맞춘다.
 */
export async function syncReminderSchedule(specs: ReminderSpec[]): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error: delErr } = await supabase.from('reminder_schedule').delete().eq('user_id', user.id);
  if (delErr) { console.error('[reminderSchedule] 삭제 실패', delErr); return; }

  if (!specs.length) return;

  const rows = specs.map(s => ({
    user_id: user.id,
    key: s.key,
    title: s.title,
    body: s.body,
    hour: s.hour,
    minute: s.minute,
    weekdays: s.weekdays ?? null,
  }));
  const { error } = await supabase.from('reminder_schedule').insert(rows);
  if (error) console.error('[reminderSchedule] 저장 실패', error);
}
