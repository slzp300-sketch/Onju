import { Capacitor } from '@capacitor/core';

/**
 * 알림 권한 추상화 — 네이티브(Capacitor LocalNotifications)와 웹(Notification API)을
 * 하나의 인터페이스로 통일한다. 반환값은 웹 표준 NotificationPermission에 맞춘다.
 */

function toPermission(display: string): NotificationPermission {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'default';
}

export async function requestNotifPermission(): Promise<NotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const res = await LocalNotifications.requestPermissions();
    return toPermission(res.display);
  }
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.requestPermission();
}

export async function currentNotifPermission(): Promise<NotificationPermission> {
  if (Capacitor.isNativePlatform()) {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    const res = await LocalNotifications.checkPermissions();
    return toPermission(res.display);
  }
  if (typeof Notification === 'undefined') return 'default';
  return Notification.permission;
}
