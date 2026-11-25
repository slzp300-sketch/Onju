import { supabase, supabaseForSession } from '../lib/supabase';
import type { SmallGroup, GroupStatus, CheerType } from '../types';
import { groupFromRow } from './mappers';
import { enqueue } from '../lib/sync/outbox';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** 내가 속한 소모임 목록 (멤버십 → 그룹 + 멤버 수 조인) */
export async function listMyGroups(userId: string): Promise<SmallGroup[]> {
  const { data, error } = await supabase
    .from('group_members')
    .select('small_groups(*, group_members(count))')
    .eq('user_id', userId);
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

/** 같은 ID로 재시도해도 모임 내용을 덮어쓰지 않고 누락된 방장 등록을 복구한다. */
export async function createGroupRemote(id: string, details: Record<string, unknown> | undefined, token: string) {
  const { error } = await supabaseForSession(token).rpc('create_group_with_owner', { gid: id, details: details ?? null })
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
}

export async function readGroupCreation(id: string, owner: string, token: string) {
  const { data, error } = await supabaseForSession(token).from('small_groups').select('*, group_members(count)')
    .eq('id', id).eq('creator_id', owner).abortSignal(AbortSignal.timeout(15_000)).maybeSingle();
  if (error) throw error;
  const membership = await readMembership(id, owner, token);
  return { group: data ? groupFromRow(data, data.group_members?.[0]?.count ?? 0) : undefined, joined: membership.joined && membership.role === 'creator' };
}

/** 구버전에서 모임만 남고 로컬 요청이 사라졌어도 본인 소유의 불완전 생성을 찾는다. */
export async function listUnfinishedGroupCreations(owner: string) {
  const { data, error } = await supabase.from('small_groups').select('id, title, group_members(user_id, role)')
    .eq('creator_id', owner).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
  return (data ?? []).filter((g: any) => !(g.group_members ?? []).some((m: any) => m.user_id === owner && m.role === 'creator'))
    .map((g: any) => ({ groupId: g.id as string, title: g.title as string }));
}

/** 가입·탈퇴는 온라인에서 서버 응답을 확인한다. 일반 기록 outbox에 넣지 않는다. */
export async function changeMembershipRemote(groupId: string, join: boolean, accessToken: string) {
  const { error } = await supabaseForSession(accessToken).rpc(join ? 'join_group' : 'leave_group', { gid: groupId })
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
}

export async function readMembership(groupId: string, userId: string, accessToken: string) {
  const { data, error } = await supabaseForSession(accessToken).from('group_members')
    .select('group_id, role, small_groups(*, group_members(count))').eq('user_id', userId).eq('group_id', groupId)
    .abortSignal(AbortSignal.timeout(15_000)).maybeSingle();
  if (error) throw error;
  const row = data?.small_groups as any;
  return { joined: !!data, role: data?.role as string | undefined, group: row ? groupFromRow(row, row.group_members?.[0]?.count ?? 0) : undefined };
}

export async function changeGroupStatusRemote(groupId: string, status: GroupStatus, expected: GroupStatus, token: string) {
  const { error } = await supabaseForSession(token).rpc('change_group_status', { gid: groupId, next_status: status, expected_status: expected })
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
}

export async function readOwnedGroup(groupId: string, owner: string, token: string) {
  const { data, error } = await supabaseForSession(token).from('small_groups').select('*, group_members(count)')
    .eq('id', groupId).eq('creator_id', owner).abortSignal(AbortSignal.timeout(15_000)).maybeSingle();
  if (error) throw error;
  return data ? groupFromRow(data, data.group_members?.[0]?.count ?? 0) : undefined;
}

export function insertCheer(shareId: string, type: CheerType, groupId: string) {
  enqueue({ type: 'insert', table: 'cheers', values: { share_id: shareId, type, group_id: groupId } });
}

export function deleteCheer(shareId: string, type: CheerType, userId: string) {
  enqueue({ type: 'delete', table: 'cheers', match: { share_id: shareId, type, from_user_id: userId } });
}
