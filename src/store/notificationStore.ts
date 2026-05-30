import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface NotificationSettings {
  morningEnabled: boolean;
  morningTime: string; // "HH:mm"
  eveningEnabled: boolean;
  eveningTime: string; // "HH:mm"
  reviewEnabled: boolean;
}

interface NotificationState extends NotificationSettings {
  permission: NotificationPermission;
  setPermission: (p: NotificationPermission) => void;
  update: (patch: Partial<NotificationSettings>) => void;
}

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set) => ({
      morningEnabled: false,
      morningTime: '07:00',
      eveningEnabled: false,
      eveningTime: '21:00',
      reviewEnabled: true,
      permission: (typeof Notification !== 'undefined' ? Notification.permission : 'default') as NotificationPermission,
      setPermission: (permission) => set({ permission }),
      update: (patch) => set(patch),
    }),
    { name: 'notification-store' }
  )
);
