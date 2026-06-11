import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SmallGroup, GroupStatus } from '../types';
import {
  insertGroup,
  joinGroupRemote,
  leaveGroupRemote,
  updateGroupStatus,
} from '../data/groupRepos';
import { useAuthStore } from './authStore';

interface GroupState {
  groups: SmallGroup[];   // 내가 만들거나 참여한 소모임 (영속). 탐색 목록은 API에서 가져옴.
  myGroupIds: string[];
  addGroup: (group: SmallGroup) => void;
  joinGroup: (group: SmallGroup) => void;   // 탐색/시드 그룹을 스냅샷으로 가입
  leaveGroup: (id: string) => void;
  setGroupStatus: (id: string, status: GroupStatus) => void;
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
        const userId = useAuthStore.getState().user?.id;
        if (userId) insertGroup(group, userId);
      },

      joinGroup: (group) => {
        set((s) => {
          const exists = s.groups.some(g => g.id === group.id);
          return {
            groups: exists
              ? s.groups.map(g => g.id === group.id ? { ...g, currentMemberCount: g.currentMemberCount + 1 } : g)
              : [{ ...group, currentMemberCount: group.currentMemberCount + 1 }, ...s.groups],
            myGroupIds: s.myGroupIds.includes(group.id) ? s.myGroupIds : [...s.myGroupIds, group.id],
          };
        });
        joinGroupRemote(group.id);
      },

      leaveGroup: (id) => {
        set((s) => ({
          groups: s.groups.filter(g => g.id !== id),
          myGroupIds: s.myGroupIds.filter(x => x !== id),
        }));
        const userId = useAuthStore.getState().user?.id;
        if (userId) leaveGroupRemote(id, userId);
      },

      setGroupStatus: (id, status) => {
        set((s) => ({ groups: s.groups.map(g => g.id === id ? { ...g, status } : g) }));
        updateGroupStatus(id, status);
      },

      getById: (id) => get().groups.find(g => g.id === id),
    }),
    { name: 'group-store' }
  )
);
