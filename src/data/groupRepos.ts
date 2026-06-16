import { supabase } from '../lib/supabase';
import type { SmallGroup, GroupStatus, CheerType } from '../types';
import { groupFromRow, groupToRow } from './mappers';
import { enqueue } from '../lib/sync/outbox';

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

/** 그룹 생성 + 생성자 멤버십 등록. 아웃박스 FIFO가 그룹 → 멤버십 순서를 보장한다. */
export function insertGroup(g: SmallGroup, creatorId: string) {
  enqueue({ type: 'insert', table: 'small_groups', values: { ...groupToRow(g), creator_id: creatorId } });
  enqueue({ type: 'insert', table: 'group_members', values: { group_id: g.id, user_id: creatorId, role: 'creator' } });
}

/** 그룹 가입 — 정원 체크는 서버 RPC가 원자적으로 수행 */
export function joinGroupRemote(groupId: string) {
  enqueue({ type: 'rpc', fn: 'join_group', args: { gid: groupId } });
}

export function leaveGroupRemote(groupId: string, userId: string) {
  enqueue({ type: 'delete', table: 'group_members', match: { group_id: groupId, user_id: userId } });
}

export function updateGroupStatus(groupId: string, status: GroupStatus) {
  enqueue({ type: 'update', table: 'small_groups', values: { status }, match: { id: groupId } });
}

export function insertCheer(shareId: string, type: CheerType, groupId: string) {
  enqueue({ type: 'insert', table: 'cheers', values: { share_id: shareId, type, group_id: groupId } });
}

export function deleteCheer(shareId: string, type: CheerType, userId: string) {
  enqueue({ type: 'delete', table: 'cheers', match: { share_id: shareId, type, from_user_id: userId } });
}
