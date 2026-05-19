import { create } from 'zustand';

interface UIState {
  pendingUnlockCelebration: boolean;
  newSlotCount: number;
  setPendingUnlock: (count: number) => void;
  clearPendingUnlock: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  pendingUnlockCelebration: false,
  newSlotCount: 0,
  setPendingUnlock: (count) => set({ pendingUnlockCelebration: true, newSlotCount: count }),
  clearPendingUnlock: () => set({ pendingUnlockCelebration: false, newSlotCount: 0 }),
}));
