import { Capacitor } from '@capacitor/core';
import type { ReminderSpec } from './reminderSpecs';

/**
 * 네이티브(안드로이드) 로컬 알림 예약.
 * 웹의 setTimeout 방식과 달리 OS에 예약을 넘기므로 앱이 꺼져 있어도 발화한다.
 * 매일/요일 반복(schedule.on)으로 등록하고, 설정이 바뀔 때마다 전체 재예약한다.
 */

export async function syncNativeNotifications(specs: ReminderSpec[]): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');

  // 이전에 예약한 알림 전체 취소 (이 앱 컨텍스트의 pending만 반환됨)
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map(n => ({ id: n.id })),
    });
  }

  if (!specs.length) return;

  let id = 1;
  const notifications = specs.flatMap(s => {
    const days = s.weekdays && s.weekdays.length ? s.weekdays : [undefined];
    return days.map(wd => ({
      id: id++,
      title: s.title,
      body: s.body,
      schedule: {
        on: wd == null
          ? { hour: s.hour, minute: s.minute }
          : { weekday: wd, hour: s.hour, minute: s.minute },
        allowWhileIdle: true,
      },
    }));
  });

  await LocalNotifications.schedule({ notifications });
}

export async function cancelAllNativeNotifications(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map(n => ({ id: n.id })),
    });
  }
}
