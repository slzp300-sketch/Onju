import { supabaseForSession } from './supabase';
import type { ReminderSpec } from './reminderSpecs';

/** 하나의 트랜잭션으로 교체하며 시작 계정의 토큰만 사용한다. */
export async function syncReminderSchedule(specs: ReminderSpec[], accessToken: string): Promise<void> {
  const { error } = await supabaseForSession(accessToken).rpc('replace_reminder_schedule', {
    p_specs: specs.map(s => ({ ...s, weekdays: s.weekdays ?? null })),
    p_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
}
