import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  weekStartDay: number;  // 0=일, 1=월, 2=화 ... 6=토
  graceEndHour: number;  // 전날 체크 마감 시각 (0=자정/유예없음, 3=새벽3시, 6=새벽6시)
  /** 슬롯 해금을 이미 처리한 주 키 ("2026-W36") — 주당 1회 해금 가드 */
  lastSlotUnlockWeek: string;
  setWeekStartDay: (day: number) => void;
  setGraceEndHour: (hour: number) => void;
  setLastSlotUnlockWeek: (week: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      weekStartDay: 1, // 기본값: 월요일
      graceEndHour: 6, // 기본값: 새벽 6시까지 전날 체크 가능
      lastSlotUnlockWeek: '',
      setWeekStartDay: (day) => set({ weekStartDay: day }),
      setGraceEndHour: (hour) => set({ graceEndHour: hour }),
      setLastSlotUnlockWeek: (week) => set({ lastSlotUnlockWeek: week }),
    }),
    { name: 'settings-store' }
  )
);
