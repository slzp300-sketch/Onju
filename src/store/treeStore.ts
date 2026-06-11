import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 나무 축하 상태 — 마지막으로 축하한 단계만 저장한다.
 * (포인트·단계 자체는 로그에서 파생 — utils/treeGrowth.ts)
 * null = 아직 동기화 전 (기존 유저 첫 실행 시 무음 동기화 대상)
 */
interface TreeState {
  lastCelebratedStage: number | null;
  setLastCelebratedStage: (stage: number) => void;
}

export const useTreeStore = create<TreeState>()(
  persist(
    (set) => ({
      lastCelebratedStage: null,
      setLastCelebratedStage: (stage) => set({ lastCelebratedStage: stage }),
    }),
    { name: 'tree-store' }
  )
);
