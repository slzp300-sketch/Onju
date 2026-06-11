import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CheerType } from '../types';
import { insertCheer, deleteCheer } from '../data/groupRepos';
import { useAuthStore } from './authStore';

// 내가 누른 응원을 `${shareId}:${type}` 키로 저장
interface CheerState {
  cheered: Record<string, boolean>;
  toggleCheer: (shareId: string, type: CheerType, groupId: string) => void;
  isCheered: (shareId: string, type: CheerType) => boolean;
}

const key = (shareId: string, type: CheerType) => `${shareId}:${type}`;

export const useCheerStore = create<CheerState>()(
  persist(
    (set, get) => ({
      cheered: {},

      toggleCheer: (shareId, type, groupId) => {
        const k = key(shareId, type);
        const wasOn = !!get().cheered[k];
        set(s => {
          const next = { ...s.cheered };
          if (next[k]) delete next[k];
          else next[k] = true;
          return { cheered: next };
        });
        if (wasOn) {
          const userId = useAuthStore.getState().user?.id;
          if (userId) deleteCheer(shareId, type, userId);
        } else {
          insertCheer(shareId, type, groupId);
        }
      },

      isCheered: (shareId, type) => !!get().cheered[key(shareId, type)],
    }),
    { name: 'cheer-store' }
  )
);
