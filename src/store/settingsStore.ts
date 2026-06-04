import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  weekStartDay: number;  // 0=일, 1=월, 2=화 ... 6=토
  dayStartHour: number;  // 하루 경계 시각 (0=자정, 3=새벽3시, 5=새벽5시)
  setWeekStartDay: (day: number) => void;
  setDayStartHour: (hour: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      weekStartDay: 1, // 기본값: 월요일
      dayStartHour: 3, // 기본값: 새벽 3시
      setWeekStartDay: (day) => set({ weekStartDay: day }),
      setDayStartHour: (hour) => set({ dayStartHour: hour }),
    }),
    { name: 'settings-store' }
  )
);
