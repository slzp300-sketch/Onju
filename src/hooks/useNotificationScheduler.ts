import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useRoutineStore } from '../store/routineStore';
import { useNotificationStore } from '../store/notificationStore';
import { isSunday } from '../utils/date';

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
  const settings = useNotificationStore();
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
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

    return () => timers.current.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.permission, settings.morningEnabled, settings.morningTime, settings.eveningEnabled, settings.eveningTime, settings.reviewEnabled, personalRoutines.length, faithRoutines.length]);
}
