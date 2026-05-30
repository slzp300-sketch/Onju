import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  weekStartDay: number; // 0=일, 1=월, 2=화 ... 6=토
  setWeekStartDay: (day: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      weekStartDay: 0, // 기본값: 일요일
      setWeekStartDay: (day) => set({ weekStartDay: day }),
    }),
    { name: 'settings-store' }
  )
);
