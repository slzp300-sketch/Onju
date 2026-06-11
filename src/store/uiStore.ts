import { create } from 'zustand';

interface UIState {
  pendingUnlockCelebration: boolean;
  newSlotCount: number;
  setPendingUnlock: (count: number) => void;
  clearPendingUnlock: () => void;
  /** 서버 hydrate 완료 여부 — 나무 단계 워처가 hydrate 전 점프를 축하하지 않도록 */
  dataHydrated: boolean;
  setDataHydrated: () => void;
  /** 단계 상승 축하 대기 (null = 없음) */
  pendingStageUp: number | null;
  setPendingStageUp: (stage: number) => void;
  clearPendingStageUp: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  pendingUnlockCelebration: false,
  newSlotCount: 0,
  setPendingUnlock: (count) => set({ pendingUnlockCelebration: true, newSlotCount: count }),
  clearPendingUnlock: () => set({ pendingUnlockCelebration: false, newSlotCount: 0 }),
  dataHydrated: false,
  setDataHydrated: () => set({ dataHydrated: true }),
  pendingStageUp: null,
  setPendingStageUp: (stage) => set({ pendingStageUp: stage }),
  clearPendingStageUp: () => set({ pendingStageUp: null }),
}));
