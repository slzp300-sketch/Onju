import { supabase } from '../lib/supabase';
import type { SmallGroup, GroupStatus, CheerType } from '../types';
import { groupFromRow, groupToRow } from './mappers';

function logError(op: string) {
  return ({ error }: { error: { message: string } | null }) => {
    if (error) console.error(`[sync] ${op} 실패:`, error.message);
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 내가 속한 소모임 목록 (멤버십 → 그룹 + 멤버 수 조인) */
export async function listMyGroups(): Promise<SmallGroup[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('small_groups(*, group_members(count))');
  if (error) throw error;
  return (data ?? [])
    .map((row: any) => row.small_groups)
    .filter(Boolean)
    .map((g: any) => groupFromRow(g, g.group_members?.[0]?.count ?? 0));
}

/** 내가 누른 응원 → `${shareId}:${type}` 맵 */
export async function listMyCheers(userId: string): Promise<Record<string, boolean>> {
  const { data, error } = await supabase
    .from('cheers')
    .select('share_id, type')
    .eq('from_user_id', userId);
  if (error) throw error;
  const map: Record<string, boolean> = {};
  for (const row of data ?? []) map[`${row.share_id}:${row.type}`] = true;
  return map;
}

/** 그룹 생성 + 생성자 멤버십 등록 */
export function insertGroup(g: SmallGroup, creatorId: string) {
  void supabase
    .from('small_groups')
    .insert({ ...groupToRow(g), creator_id: creatorId })
    .then(({ error }) => {
      if (error) {
        console.error('[sync] 소모임 생성 실패:', error.message);
        return;
      }
      void supabase
        .from('group_members')
        .insert({ group_id: g.id, user_id: creatorId, role: 'creator' })
        .then(logError('소모임 생성자 멤버십'));
    });
}

/** 그룹 가입 — 정원 체크는 서버 RPC가 원자적으로 수행 */
export function joinGroupRemote(groupId: string) {
  void supabase.rpc('join_group', { gid: groupId }).then(logError('소모임 가입'));
}

export function leaveGroupRemote(groupId: string, userId: string) {
  void supabase
    .from('group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .then(logError('소모임 탈퇴'));
}

export function updateGroupStatus(groupId: string, status: GroupStatus) {
  void supabase.from('small_groups').update({ status }).eq('id', groupId).then(logError('소모임 상태 변경'));
}

export function insertCheer(shareId: string, type: CheerType, groupId: string) {
  void supabase
    .from('cheers')
    .insert({ share_id: shareId, type, group_id: groupId })
    .then(logError('응원 추가'));
}

export function deleteCheer(shareId: string, type: CheerType, userId: string) {
  void supabase
    .from('cheers')
    .delete()
    .eq('share_id', shareId)
    .eq('type', type)
    .eq('from_user_id', userId)
    .then(logError('응원 취소'));
}
