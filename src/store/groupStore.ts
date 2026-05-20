import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SmallGroup } from '../types';

interface GroupState {
  groups: SmallGroup[];
  myGroupIds: string[];
  addGroup: (group: SmallGroup) => void;
  joinGroup: (id: string) => void;
  getById: (id: string) => SmallGroup | undefined;
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set, get) => ({
      groups: [],
      myGroupIds: [],

      addGroup: (group) => {
        set((s) => ({
          groups: [group, ...s.groups],
          myGroupIds: [...s.myGroupIds, group.id],
        }));
      },

      joinGroup: (id) => {
        set((s) => ({
          groups: s.groups.map(g =>
            g.id === id ? { ...g, currentMemberCount: g.currentMemberCount + 1 } : g
          ),
          myGroupIds: s.myGroupIds.includes(id) ? s.myGroupIds : [...s.myGroupIds, id],
        }));
      },

      getById: (id) => get().groups.find(g => g.id === id),
    }),
    { name: 'group-store' }
  )
);
