import { supabase } from '../lib/supabase';
import type { SmallGroup, MemberGroupProgress } from '../types';
import { groupFromRow, groupToRow } from '../data/mappers';
import { newId } from '../utils/id';

/* eslint-disable @typescript-eslint/no-explicit-any */

interface GroupsResponse {
  groups: SmallGroup[];
  total: number;
  hasNextPage: boolean;
  nextPage: number | null;
}

/** 공개 소모임 탐색 목록 (페이지네이션) */
export const fetchGroups = async (
  params: { status?: string; page?: number; limit?: number },
): Promise<GroupsResponse> => {
  const page = params.page ?? 1;
  const limit = params.limit ?? 10;

  let query = supabase
    .from('small_groups')
    .select('*, group_members(count)', { count: 'exact' })
    .eq('is_public', true)
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);
  if (params.status) query = query.eq('status', params.status);

  const { data, error, count } = await query;
  if (error) throw error;

  const total = count ?? 0;
  const hasNextPage = page * limit < total;
  return {
    groups: (data ?? []).map((g: any) => groupFromRow(g, g.group_members?.[0]?.count ?? 0)),
    total,
    hasNextPage,
    nextPage: hasNextPage ? page + 1 : null,
  };
};

export const fetchGroupById = async (id: string): Promise<SmallGroup> => {
  const { data, error } = await supabase
    .from('small_groups')
    .select('*, group_members(count)')
    .eq('id', id)
    .single();
  if (error) throw error;
  return groupFromRow(data, (data as any).group_members?.[0]?.count ?? 0);
};

export const createGroup = async (data: Partial<SmallGroup>): Promise<SmallGroup> => {
  const id = data.id ?? newId();
  const now = new Date().toISOString();
  const group: SmallGroup = {
    id,
    creatorId: '',
    title: '',
    goal: '',
    startDate: now,
    endDate: now,
    maxMembers: 10,
    currentMemberCount: 1,
    status: 'recruiting',
    isPublic: true,
    createdAt: now,
    ...data,
  };
  const { error } = await supabase.from('small_groups').insert(groupToRow(group));
  if (error) throw error;
  const { error: memberError } = await supabase
    .from('group_members')
    .insert({ group_id: id, role: 'creator' });
  if (memberError) throw memberError;
  return group;
};

/** 가입 — 정원 체크는 서버 RPC가 원자적으로 수행 */
export const joinGroup = async (id: string): Promise<void> => {
  const { error } = await supabase.rpc('join_group', { gid: id });
  if (error) throw error;
};

/** 멤버별 진행도 — 서버 RPC가 집계 (타인 로그 비공개 유지) */
export const fetchGroupMembers = async (id: string): Promise<MemberGroupProgress[]> => {
  const { data, error } = await supabase.rpc('get_group_member_progress', { gid: id });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    userId: row.user_id,
    userName: row.user_name,
    profileImage: row.profile_image ?? undefined,
    todayPersonalRate: row.today_personal_rate,
    todayFaithRate: row.today_faith_rate,
    weeklyRate: row.weekly_rate,
    streak: row.streak,
  }));
};
