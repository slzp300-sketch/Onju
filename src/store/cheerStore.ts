import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CheerType } from '../types';

// 내가 누른 응원을 `${shareId}:${type}` 키로 저장
interface CheerState {
  cheered: Record<string, boolean>;
  toggleCheer: (shareId: string, type: CheerType) => void;
  isCheered: (shareId: string, type: CheerType) => boolean;
}

const key = (shareId: string, type: CheerType) => `${shareId}:${type}`;

export const useCheerStore = create<CheerState>()(
  persist(
    (set, get) => ({
      cheered: {},

      toggleCheer: (shareId, type) => {
        const k = key(shareId, type);
        set(s => {
          const next = { ...s.cheered };
          if (next[k]) delete next[k];
          else next[k] = true;
          return { cheered: next };
        });
      },

      isCheered: (shareId, type) => !!get().cheered[key(shareId, type)],
    }),
    { name: 'cheer-store' }
  )
);
