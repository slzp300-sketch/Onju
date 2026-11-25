import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SmallGroup, GroupStatus } from '../types';
import {
  createGroupRemote,
  readGroupCreation,
  changeMembershipRemote,
  readMembership,
  changeGroupStatusRemote,
  readOwnedGroup,
} from '../data/groupRepos';
import { useAuthStore } from './authStore';
import { supabase } from '../lib/supabase';
import { queryClient } from '../lib/queryClient';
import { acceptGroupInvite } from '../data/groupInvites';
import { completeHeldGroupCreation, heldMembershipRequests, heldGroupStatusRequests, holdGroupStatusRequest, resolveGroupStatusRequests } from '../lib/sync/outbox';

type MembershipStatus = { requestId?: number; phase: 'pending' | 'error' | 'unknown'; message: string };
let membershipRequestId = 0;
function membershipMessage(error: unknown): string {
  const message = (error as { message?: string })?.message ?? '';
  if (/정원/.test(message)) return '정원이 가득 차 참여하지 못했어요. 다른 소모임을 찾아보세요.';
  if (/모집|종료/.test(message)) return '모집이 끝났거나 종료된 소모임이에요.';
  if (/방장/.test(message)) return '방장은 소모임을 나갈 수 없어요.';
  if (/초대/.test(message)) return '초대 코드를 사용할 수 없어요. 방장에게 새 코드를 받아주세요.';
  if (/참여할 수|존재하지|차단/.test(message)) return '현재 참여할 수 없는 소모임이에요.';
  return '요청을 완료하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해주세요.';
}


interface GroupState {
  groups: SmallGroup[];   // 내가 만들거나 참여한 소모임 (영속). 탐색 목록은 API에서 가져옴.
  myGroupIds: string[];
  creationStatus: Record<string, { requestId: number; phase: 'pending' | 'error' | 'unknown'; message: string; canEdit?: boolean }>;
  createGroup: (id: string, details?: Record<string, unknown>) => Promise<boolean>;
  membershipStatus: Record<string, MembershipStatus>;
  statusChanges: Record<string, { requestId: number; phase: 'pending' | 'error' | 'unknown' | 'success'; message: string }>;
  joinGroup: (group: SmallGroup) => Promise<boolean>;
  leaveGroup: (id: string) => Promise<boolean>;
  refreshMembership: (id: string) => Promise<boolean>;
  changeMembership: (id: string, join?: boolean, group?: SmallGroup, inviteCode?: string) => Promise<boolean>;
  setGroupStatus: (id: string, status: GroupStatus, expected: GroupStatus) => Promise<boolean>;
  refreshGroupStatus: (id: string) => Promise<boolean>;
  changeGroupStatus: (id: string, status?: GroupStatus, expected?: GroupStatus) => Promise<boolean>;
  getById: (id: string) => SmallGroup | undefined;
}

export const useGroupStore = create<GroupState>()(
  persist(
    (set, get) => ({
      groups: [],
      myGroupIds: [],
      membershipStatus: {},
      statusChanges: {},

      creationStatus: {},
      createGroup: async (id, details) => {
        const owner = useAuthStore.getState().user?.id;
        if (!owner || get().creationStatus[id]?.phase === 'pending') return false;
        const requestId = ++membershipRequestId;
        const setStatus = (phase: 'pending' | 'error' | 'unknown', message: string, canEdit = false) =>
          set(s => ({ creationStatus: { ...s.creationStatus, [id]: { requestId, phase, message, canEdit } } }));
        setStatus('pending', '소모임과 방장 등록을 확인하고 있어요…');
        const current = () => useAuthStore.getState().user?.id === owner && get().creationStatus[id]?.requestId === requestId;
        try {
          if (!navigator.onLine) throw new Error('offline');
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session || data.session.user.id !== owner || !current()) throw new Error('session');
          const token = data.session.access_token;
          let failure: unknown;
          try { await createGroupRemote(id, details, token); } catch (e) { failure = e; }
          if (!current()) return false;
          const confirmed = await readGroupCreation(id, owner, token);
          if (!current()) return false;
          if (!confirmed.group || !confirmed.joined) {
            const code = (failure as { code?: string })?.code;
            const canEdit = !confirmed.group && !!code && code !== '57014';
            setStatus(canEdit ? 'error' : 'unknown', canEdit
              ? '소모임을 만들지 못했어요. 이용 수칙과 입력 내용을 확인한 뒤 다시 시도해주세요.'
              : '생성이 아직 완료되지 않았어요. 같은 요청으로 다시 확인·복구해주세요.', canEdit);
            return false;
          }
          set(s => ({ groups: [confirmed.group!, ...s.groups.filter(g => g.id !== id)], myGroupIds: [...new Set([...s.myGroupIds, id])] }));
          if (!completeHeldGroupCreation(owner, id)) {
            setStatus('error', '소모임은 만들어졌지만 기기의 이전 요청을 정리하지 못했어요. 다시 확인해주세요.'); return false;
          }
          set(s => { const next = { ...s.creationStatus }; delete next[id]; return { creationStatus: next }; });
          void queryClient.invalidateQueries({ queryKey: ['discover-groups'] });
          void queryClient.invalidateQueries({ queryKey: ['group', id] });
          void queryClient.invalidateQueries({ queryKey: ['unfinished-group-creations', owner] });
          return true;
        } catch {
          if (current()) setStatus('unknown', '생성 결과를 확인하지 못했어요. 연결한 뒤 같은 요청으로 다시 확인·복구해주세요.');
          return false;
        }
      },

      joinGroup: group => get().changeMembership(group.id, true, group),
      leaveGroup: id => get().changeMembership(id, false),
      refreshMembership: id => get().changeMembership(id),
      changeMembership: async (id, join, group, inviteCode) => {
        const owner = useAuthStore.getState().user?.id;
        if (!owner || get().membershipStatus[id]?.phase === 'pending') return false;
        const requestId = ++membershipRequestId;
        let started = false;
        const current = () => useAuthStore.getState().user?.id === owner && (!started || get().membershipStatus[id]?.requestId === requestId);
        const status = (phase: MembershipStatus['phase'], message: string) => {
          if (current()) set(s => ({ membershipStatus: { ...s.membershipStatus, [id]: { requestId, phase, message } } }));
        };
        if (join !== undefined && heldMembershipRequests(owner).some(r => r.groupId === id)) {
          status('unknown', '이전에 보류된 요청을 먼저 확인해주세요.'); return false;
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          status('unknown', '인터넷 연결이 필요해요. 연결한 뒤 현재 참여 상태를 확인해주세요.'); return false;
        }
        status('pending', join === undefined ? '참여 상태 확인 중…' : join ? '참여 요청 확인 중…' : '나가기 요청 확인 중…');
        started = true;
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session || data.session.user.id !== owner || !current()) throw new Error('session changed');
          const token = data.session.access_token;
          let failure: unknown;
          if (join !== undefined) {
            try {
              if (join && inviteCode) await acceptGroupInvite(inviteCode, token);
              else await changeMembershipRemote(id, join, token);
            } catch (error) { failure = error; }
          }
          if (!current()) return false;
          const confirmed = await readMembership(id, owner, token);
          if (!current()) return false;
          set(s => {
            const resolved = confirmed.group ?? s.groups.find(g => g.id === id) ?? group;
            return {
              groups: confirmed.joined && resolved ? [resolved, ...s.groups.filter(g => g.id !== id)] : s.groups.filter(g => g.id !== id),
              myGroupIds: confirmed.joined ? [...new Set([...s.myGroupIds, id])] : s.myGroupIds.filter(g => g !== id),
            };
          });
          // 정원·모집 상태 등도 새로 읽는다. 이전 계정의 캐시에는 접근하지 않는다.
          void queryClient.invalidateQueries({ queryKey: ['group', id] });
          void queryClient.invalidateQueries({ queryKey: ['discover-groups'] });
          void queryClient.invalidateQueries({ queryKey: ['group-members', id] });
          if (join !== undefined && confirmed.joined !== join) {
            status(failure && !(failure as { code?: string }).code ? 'unknown' : 'error',
              failure ? membershipMessage(failure) : '변경이 확인되지 않았어요. 현재 참여 상태를 다시 확인해주세요.');
            return false;
          }
          set(s => { const next = { ...s.membershipStatus }; delete next[id]; return { membershipStatus: next }; });
          return true;
        } catch {
          status('unknown', '변경 결과를 확인하지 못했어요. 현재 참여 상태를 확인한 뒤 다시 시도해주세요.');
          return false;
        }
      },

      setGroupStatus: (id, status, expected) => get().changeGroupStatus(id, status, expected),
      refreshGroupStatus: id => get().changeGroupStatus(id),
      changeGroupStatus: async (id, target, expected) => {
        const owner = useAuthStore.getState().user?.id;
        const previous = get().statusChanges[id];
        if (!owner || previous?.phase === 'pending') return false;
        const requestId = ++membershipRequestId;
        const status = (phase: 'pending' | 'error' | 'unknown' | 'success', message: string) =>
          set(s => ({ statusChanges: { ...s.statusChanges, [id]: { requestId, phase, message } } }));
        const held = heldGroupStatusRequests(owner).filter(r => r.groupId === id);
        if (target && (held.length || previous?.phase === 'unknown')) {
          status('unknown', '이전 변경 결과를 먼저 확인해주세요. 요청을 자동 재전송하지 않아요.'); return false;
        }
        if (!navigator.onLine) {
          status('unknown', '인터넷 연결이 필요해요. 연결한 뒤 현재 운영 상태를 확인해주세요.'); return false;
        }
        status('pending', target ? '변경 결과를 확인하고 있어요…' : '현재 운영 상태를 확인하고 있어요…');
        const current = () => useAuthStore.getState().user?.id === owner && get().statusChanges[id]?.requestId === requestId;
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error || !data.session || data.session.user.id !== owner || !current()) throw new Error('session');
          const token = data.session.access_token;
          const requestIds = held.map(r => r.id);
          let failure: unknown;
          if (target) {
            if (!expected || !((expected === 'recruiting' && target === 'active') || (expected === 'active' && target === 'completed'))) {
              status('error', '현재 상태에서 가능한 변경인지 다시 확인해주세요.'); return false;
            }
            const saved = holdGroupStatusRequest(owner, id, target, expected);
            if (!saved) { status('unknown', '변경 요청을 기기에 보관하지 못했어요. 저장 공간을 확인한 뒤 현재 운영 상태를 확인해주세요.'); return false; }
            requestIds.push(saved);
            try { await changeGroupStatusRemote(id, target, expected, token); } catch (e) { failure = e; }
          }
          if (!current()) return false;
          // 진행 중이던 상세 조회가 확인한 결과를 덮어쓰지 않게 한다.
          await queryClient.cancelQueries({ queryKey: ['group', id] });
          if (!current()) return false;
          const confirmed = await readOwnedGroup(id, owner, token);
          if (!current()) return false;
          set(s => ({ groups: confirmed ? [confirmed, ...s.groups.filter(g => g.id !== id)] : s.groups.filter(g => g.id !== id),
            myGroupIds: confirmed ? s.myGroupIds : s.myGroupIds.filter(g => g !== id) }));
          queryClient.setQueryData(['group', id], confirmed ?? null);
          void queryClient.invalidateQueries({ queryKey: ['discover-groups'] });
          // 통신 오류 직후 이전 상태만 읽힌 경우 아직 처리 중일 수 있으므로 확인 요청을 보존한다.
          if (target && confirmed && confirmed.status === expected && failure && !(failure as { code?: string }).code) {
            status('unknown', '변경 결과가 아직 확실하지 않아요. 현재 운영 상태를 확인한 뒤 다시 시도해주세요.'); return false;
          }
          if (!resolveGroupStatusRequests(owner, requestIds)) {
            status('unknown', '서버 상태는 확인했지만 기기의 이전 요청을 정리하지 못했어요. 다시 확인해주세요.'); return false;
          }
          if (!confirmed) {
            status('error', '모임이 없거나 방장 권한을 확인할 수 없어요. 소모임 목록에서 다시 확인해주세요.'); return false;
          }
          if (target && confirmed.status !== target) {
            const message = (failure as { message?: string })?.message ?? '';
            status('error', /수칙/.test(message) ? '소모임 이용 수칙 동의를 확인해주세요. 상태는 변경되지 않았어요.'
              : /기간/.test(message) ? '기간이 지난 소모임은 시작할 수 없어요. 현재 상태를 반영했어요.'
              : confirmed.status !== expected ? '다른 요청으로 상태가 바뀌었어요. 서버의 현재 상태를 반영했어요.'
              : '상태를 변경하지 못했어요. 기존 상태를 유지했으니 다시 시도해주세요.');
            return false;
          }
          status('success', target === 'active' ? '모집 마감을 확인했어요. 이제 진행 중인 소모임이에요.'
            : target === 'completed' ? '소모임 종료를 확인했어요. 기존 기록은 그대로 남아요.' : '서버의 현재 운영 상태를 확인했어요.');
          return true;
        } catch {
          if (current()) status('unknown', '변경 결과를 확인하지 못했어요. 현재 운영 상태를 확인한 뒤 다시 시도해주세요.');
          return false;
        }
      },

      getById: (id) => get().groups.find(g => g.id === id),
    }),
    { name: 'group-store', partialize: state => ({ groups: state.groups, myGroupIds: state.myGroupIds }) }
  )
);
