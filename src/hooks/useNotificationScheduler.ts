import { useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { useRoutineStore } from '../store/routineStore';
import { useHabitStore } from '../store/habitStore';
import { useNotificationStore } from '../store/notificationStore';
import { currentNotifPermission } from '../lib/notifyPermission';
import { buildReminderSpecs } from '../lib/reminderSpecs';
import { isWebPushConfigured } from '../lib/webPush';
import { retryNotificationSync, updateNotificationSchedule, useNotificationSync } from '../lib/notificationSync';
import { scheduleBrowserReminders } from '../lib/browserReminders';

export function useNotificationScheduler() {
  const userId = useAuthStore(s => s.user?.id);
  const hydrated = useUIStore(s => s.dataHydrated);
  const faithRoutines = useRoutineStore(s => s.faithRoutines);
  const habits = useHabitStore(s => s.habits);
  const personalCount = useHabitStore(s => s.personalRoutines.length);
  const { morningEnabled, morningTime, eveningEnabled, eveningTime, reviewEnabled, permission, setPermission } = useNotificationStore();
  const specs = useMemo(() => buildReminderSpecs({ morningEnabled, morningTime, eveningEnabled, eveningTime, reviewEnabled, personalCount, faithRoutines, habits }),
    [morningEnabled, morningTime, eveningEnabled, eveningTime, reviewEnabled, personalCount, faithRoutines, habits]);

  useEffect(() => {
    let active = true;
    const refresh = () => { void currentNotifPermission().then(p => { if (active) { setPermission(p); retryNotificationSync(); } }).catch(() => {
      if (active) useNotificationSync.setState({ status: 'error' });
    }); };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', retryNotificationSync);
    const listener = Capacitor.isNativePlatform() ? App.addListener('appStateChange', state => { if (state.isActive) refresh(); }) : null;
    return () => {
      active = false; window.removeEventListener('focus', refresh); window.removeEventListener('online', retryNotificationSync);
      void listener?.then(handle => handle.remove()).catch(() => {});
    };
  }, [setPermission]);

  useEffect(() => {
    if (userId && hydrated) updateNotificationSchedule(userId, specs, permission === 'granted');
  }, [userId, hydrated, specs, permission]);

  useEffect(() => {
    if (!userId || !hydrated || Capacitor.isNativePlatform() || isWebPushConfigured() || permission !== 'granted') return;
    return scheduleBrowserReminders(userId, specs, spec => {
      if (useAuthStore.getState().user?.id !== userId || Notification.permission !== 'granted') return;
      new Notification(spec.title, { body: spec.body, tag: spec.key, icon: '/pwa-192x192.svg' });
    }, () => useNotificationSync.setState({ status: 'error' }));
  }, [userId, hydrated, specs, permission]);
}
