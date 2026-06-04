import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  weekStartDay: number;  // 0=일, 1=월, 2=화 ... 6=토
  graceEndHour: number;  // 전날 체크 마감 시각 (0=자정/유예없음, 3=새벽3시, 6=새벽6시)
  setWeekStartDay: (day: number) => void;
  setGraceEndHour: (hour: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      weekStartDay: 1, // 기본값: 월요일
      graceEndHour: 6, // 기본값: 새벽 6시까지 전날 체크 가능
      setWeekStartDay: (day) => set({ weekStartDay: day }),
      setGraceEndHour: (hour) => set({ graceEndHour: hour }),
    }),
    { name: 'settings-store' }
  )
);
