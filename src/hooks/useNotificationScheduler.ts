import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { Capacitor } from '@capacitor/core';
import { useRoutineStore } from '../store/routineStore';
import { useNotificationStore } from '../store/notificationStore';
import { useHabitStore } from '../store/habitStore';
import { isSunday } from '../utils/date';
import { currentNotifPermission } from '../lib/notifyPermission';
import { syncNativeNotifications, cancelAllNativeNotifications } from '../lib/nativeNotifications';
import { buildReminderSpecs, type ReminderInputs } from '../lib/reminderSpecs';
import { isWebPushConfigured, subscribeWebPush } from '../lib/webPush';
import { syncReminderSchedule } from '../lib/reminderSchedule';

const STORAGE_KEY = 'onju_last_notif';

function getLastNotif(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}'); }
  catch { return {}; }
}

function markSent(type: string) {
  const today = format(new Date(), 'yyyy-MM-dd');
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...getLastNotif(), [type]: today }));
}

function alreadySentToday(type: string) {
  const today = format(new Date(), 'yyyy-MM-dd');
  return getLastNotif()[type] === today;
}

function sendNotification(title: string, body: string) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  new Notification(title, { body, icon: '/pwa-192x192.svg', badge: '/pwa-192x192.svg' });
}

function parseTime(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { h, m };
}

function msUntil(h: number, m: number): number {
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target <= now) return -1;
  return target.getTime() - now.getTime();
}

export function useNotificationScheduler() {
  const { personalRoutines, faithRoutines, logs } = useRoutineStore();
  const habits = useHabitStore(s => s.habits);
  const settings = useNotificationStore();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const isNative = Capacitor.isNativePlatform();

  const specInputs: ReminderInputs = {
    morningEnabled: settings.morningEnabled,
    morningTime: settings.morningTime,
    eveningEnabled: settings.eveningEnabled,
    eveningTime: settings.eveningTime,
    reviewEnabled: settings.reviewEnabled,
    personalCount: personalRoutines.length,
    faithRoutines,
    habits,
  };

  // ── 네이티브(안드로이드): OS 예약 알림 — 앱이 꺼져 있어도 발화 ──
  useEffect(() => {
    if (!isNative) return;
    let cancelled = false;
    void (async () => {
      const status = await currentNotifPermission();
      if (cancelled) return;
      if (status !== settings.permission) settings.setPermission(status);
      if (status !== 'granted') { await cancelAllNativeNotifications(); return; }
      if (!cancelled) await syncNativeNotifications(buildReminderSpecs(specInputs));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative, settings.permission, settings.morningEnabled, settings.morningTime, settings.eveningEnabled, settings.eveningTime, settings.reviewEnabled, personalRoutines.length, faithRoutines, habits]);

  // ── 웹 Push: 구독 + reminder_schedule 동기화 — 서버(Edge Function)가 앱 닫혀도 발송 ──
  useEffect(() => {
    if (isNative) return;
    if (!isWebPushConfigured()) return;
    if (settings.permission !== 'granted') return;
    let cancelled = false;
    void (async () => {
      const ok = await subscribeWebPush();
      if (cancelled || !ok) return;
      await syncReminderSchedule(buildReminderSpecs(specInputs));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative, settings.permission, settings.morningEnabled, settings.morningTime, settings.eveningEnabled, settings.eveningTime, settings.reviewEnabled, personalRoutines.length, faithRoutines, habits]);

  // ── 웹 폴백: setTimeout 예약 (앱이 열려 있는 동안만) — Web Push 미구성 시 ──
  useEffect(() => {
    if (isNative) return;
    if (isWebPushConfigured()) return; // 서버 Push가 대신 처리
    if (settings.permission !== 'granted') return;

    timers.current.forEach(clearTimeout);
    timers.current = [];

    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const now = new Date();
    const totalRoutines = personalRoutines.length + faithRoutines.length;

    // 아침 알림
    if (settings.morningEnabled && totalRoutines > 0) {
      const { h, m } = parseTime(settings.morningTime);
      const nowH = now.getHours();
      const nowM = now.getMinutes();

      const passedMorning = nowH > h || (nowH === h && nowM >= m);
      if (passedMorning && !alreadySentToday('morning')) {
        sendNotification('좋은 아침이에요! ☀️', `오늘 할 루틴 ${totalRoutines}개가 기다리고 있어요. 시작해볼까요?`);
        markSent('morning');
      } else if (!passedMorning) {
        const delay = msUntil(h, m);
        if (delay > 0) {
          timers.current.push(setTimeout(() => {
            if (!alreadySentToday('morning')) {
              sendNotification('좋은 아침이에요! ☀️', `오늘 할 루틴 ${totalRoutines}개가 기다리고 있어요. 시작해볼까요?`);
              markSent('morning');
            }
          }, delay));
        }
      }
    }

    // 저녁 알림 (미완료 루틴이 있을 때)
    if (settings.eveningEnabled) {
      const todayLogs = logs.filter(l => l.date === todayStr && l.completed);
      const completedIds = new Set(todayLogs.map(l => l.routineId));
      const incomplete = [...personalRoutines, ...faithRoutines].filter(r => !completedIds.has(r.id));

      if (incomplete.length > 0) {
        const { h, m } = parseTime(settings.eveningTime);
        const nowH = now.getHours();
        const nowM = now.getMinutes();

        const passedEvening = nowH > h || (nowH === h && nowM >= m);
        if (passedEvening && !alreadySentToday('evening')) {
          sendNotification('오늘 루틴 확인해요 🌙', `아직 ${incomplete.length}개의 루틴이 남아 있어요.`);
          markSent('evening');
        } else if (!passedEvening) {
          const delay = msUntil(h, m);
          if (delay > 0) {
            timers.current.push(setTimeout(() => {
              const lateLogs = logs.filter(l => l.date === todayStr && l.completed);
              const lateCompleted = new Set(lateLogs.map(l => l.routineId));
              const lateIncomplete = [...personalRoutines, ...faithRoutines].filter(r => !lateCompleted.has(r.id));
              if (lateIncomplete.length > 0 && !alreadySentToday('evening')) {
                sendNotification('오늘 루틴 확인해요 🌙', `아직 ${lateIncomplete.length}개의 루틴이 남아 있어요.`);
                markSent('evening');
              }
            }, delay));
          }
        }
      }
    }

    // 일요일 주간 리뷰 알림
    if (settings.reviewEnabled && isSunday() && !alreadySentToday('review')) {
      sendNotification('이번 주 어떠셨나요? 📋', '주간 리뷰를 작성하고 다음 주를 계획해 보세요.');
      markSent('review');
    }

    // 신앙루틴 개별 알림
    faithRoutines.forEach(routine => {
      const n = routine.notification;
      if (!n?.enabled || n.type !== 'push') return;
      n.times.forEach((timeStr, tIdx) => {
        const { h, m } = parseTime(timeStr);
        const key = `faith-${routine.id}-${tIdx}`;
        const nowH = now.getHours();
        const nowM = now.getMinutes();
        const passed = nowH > h || (nowH === h && nowM >= m);
        if (passed && !alreadySentToday(key)) {
          sendNotification(`${routine.emoji ?? '🙏'} ${routine.title}`, '신앙 루틴을 실천할 시간이에요!');
          markSent(key);
        } else if (!passed) {
          const delay = msUntil(h, m);
          if (delay > 0) {
            timers.current.push(setTimeout(() => {
              if (!alreadySentToday(key)) {
                sendNotification(`${routine.emoji ?? '🙏'} ${routine.title}`, '신앙 루틴을 실천할 시간이에요!');
                markSent(key);
              }
            }, delay));
          }
        }
      });
    });

    // 습관별 개별 알림 (시간마다 별도 스케줄)
    habits.forEach(habit => {
      const n = habit.notification;
      if (!n?.enabled || n.type !== 'push') return;

      n.times.forEach((timeStr, tIdx) => {
        const { h, m } = parseTime(timeStr);
        const key = `habit-${habit.id}-${tIdx}`;
        const nowH = now.getHours();
        const nowM = now.getMinutes();
        const passed = nowH > h || (nowH === h && nowM >= m);

        if (passed && !alreadySentToday(key)) {
          sendNotification(`${habit.emoji} ${habit.title}`, '습관을 실천할 시간이에요!');
          markSent(key);
        } else if (!passed) {
          const delay = msUntil(h, m);
          if (delay > 0) {
            timers.current.push(setTimeout(() => {
              if (!alreadySentToday(key)) {
                sendNotification(`${habit.emoji} ${habit.title}`, '습관을 실천할 시간이에요!');
                markSent(key);
              }
            }, delay));
          }
        }
      });
    });

    const captured = timers.current;
    return () => captured.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative, settings.permission, settings.morningEnabled, settings.morningTime, settings.eveningEnabled, settings.eveningTime, settings.reviewEnabled, personalRoutines.length, faithRoutines.length, habits]);
}
