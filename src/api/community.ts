import { supabase, supabaseForSession } from '../lib/supabase';

const COMMUNITY_VERSION = '2026-10-27';
export const REPORT_REASONS = {
  harassment: '욕설·괴롭힘·혐오', sexual: '음란·폭력·불법 콘텐츠',
  spam: '광고·스팸·사기', privacy: '개인정보 노출', other: '기타 이용수칙 위반',
} as const;
export type CommunityTarget = {
  type: 'group' | 'member' | 'weekly_share' | 'routine_share' | 'proof';
  id: string; groupId: string; userId: string;
};

async function clientForUser(userId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== userId) throw new Error('로그인한 계정이 바뀌었어요.');
  return supabaseForSession(data.session.access_token);
}

export async function fetchCommunityConsent(userId: string): Promise<boolean> {
  const client = await clientForUser(userId);
  const { data, error } = await client.from('community_consents').select('version')
    .eq('user_id', userId).eq('version', COMMUNITY_VERSION).maybeSingle();
  if (error) throw error;
  return !!data;
}

export async function acceptCommunityRules(userId: string): Promise<void> {
  const client = await clientForUser(userId);
  const { error } = await client.from('community_consents')
    .upsert({ version: COMMUNITY_VERSION }, { onConflict: 'user_id,version', ignoreDuplicates: true });
  if (error) throw error;
}

export async function fetchBlockedUsers(userId: string): Promise<{ userId: string; name: string }[]> {
  const client = await clientForUser(userId);
  const { data, error } = await client.from('user_blocks')
    .select('blocked_user_id, profiles!user_blocks_blocked_user_id_fkey(name)').eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map(row => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { userId: row.blocked_user_id as string, name: profile?.name ?? '탈퇴한 사용자' };
  });
}

export async function setUserBlocked(userId: string, targetUserId: string, blocked: boolean): Promise<void> {
  const client = await clientForUser(userId);
  const query = client.from('user_blocks');
  const { error } = blocked
    ? await query.upsert({ blocked_user_id: targetUserId }, { onConflict: 'user_id,blocked_user_id', ignoreDuplicates: true })
    : await query.delete().eq('user_id', userId).eq('blocked_user_id', targetUserId);
  if (error) throw error;
}

export async function reportContent(userId: string, target: CommunityTarget, reason: keyof typeof REPORT_REASONS): Promise<void> {
  const client = await clientForUser(userId);
  const { error } = await client.rpc('report_community_content', {
    p_type: target.type, p_target: target.id, p_group: target.groupId, p_reason: reason,
  });
  if (error) throw error;
}
