import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface StreakState {
  shields: number;        // 보유 방패 수 (최대 2)
  lastCheckedStreak: number; // 마지막으로 체크한 스트릭
  addShield: () => void;
  useShield: () => boolean; // 방패 사용 → 성공 여부 반환
  syncShields: (streak: number) => void; // 스트릭 기반으로 방패 동기화
}

export const useStreakStore = create<StreakState>()(
  persist(
    (set, get) => ({
      shields: 0,
      lastCheckedStreak: 0,

      addShield: () => set(s => ({ shields: Math.min(2, s.shields + 1) })),

      useShield: () => {
        const { shields } = get();
        if (shields <= 0) return false;
        set(s => ({ shields: s.shields - 1 }));
        return true;
      },

      // 5의 배수 스트릭 달성 시 방패 지급 (중복 지급 방지)
      syncShields: (streak: number) => {
        const { lastCheckedStreak } = get();
        const prevMilestone = Math.floor(lastCheckedStreak / 5);
        const currMilestone = Math.floor(streak / 5);
        if (currMilestone > prevMilestone && streak > 0) {
          set(s => ({
            shields: Math.min(2, s.shields + 1),
            lastCheckedStreak: streak,
          }));
        } else {
          set({ lastCheckedStreak: streak });
        }
      },
    }),
    { name: 'streak-store' }
  )
);
