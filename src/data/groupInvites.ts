import { supabase, supabaseForSession } from '../lib/supabase';

export interface GroupInvite { id: string; code: string; expires_at: string; revoked_at: string | null; redeemed_at: string | null }
export interface InvitePreview {
  state: 'available' | 'joined' | 'full' | 'closed' | 'invalid' | 'expired' | 'revoked' | 'used';
  groupId?: string; title?: string; goal?: string; rules?: string[]; endDate?: string; memberCount?: number; maxMembers?: number; expiresAt?: string;
}
const normalizeInviteCode = (code: string) => code.replace(/[\s-]/g, '').toLowerCase();
export const isInviteCode = (code: string) => /^[a-f0-9]{32}$/.test(normalizeInviteCode(code));
async function invitationClient(owner: string) {
  if (!navigator.onLine) throw new Error('인터넷에 연결한 뒤 다시 확인해주세요.');
  const { data, error } = await supabase.auth.getSession();
  if (error || data.session?.user.id !== owner) throw new Error('로그인한 계정을 확인해주세요.');
  return supabaseForSession(data.session.access_token);
}
export async function listGroupInvites(owner: string, groupId: string): Promise<GroupInvite[]> {
  const client = await invitationClient(owner);
  const { data, error } = await client.from('group_invites').select('id,code,expires_at,revoked_at,redeemed_at')
    .eq('group_id', groupId).order('created_at', { ascending: false }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
  return data ?? [];
}
export async function changeGroupInvite(owner: string, groupId: string, action: 'issue' | 'revoke', id: string) {
  const client = await invitationClient(owner);
  const { error } = await client.rpc(action === 'issue' ? 'issue_group_invite' : 'revoke_group_invite',
    action === 'issue' ? { gid: groupId, request_id: id } : { gid: groupId, invite_id: id }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
}
export async function previewGroupInvite(owner: string, code: string): Promise<InvitePreview> {
  const client = await invitationClient(owner);
  const { data, error } = await client.rpc('preview_group_invite', { p_code: normalizeInviteCode(code) }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
  return data as InvitePreview;
}
export async function acceptGroupInvite(code: string, token: string) {
  const { error } = await supabaseForSession(token).rpc('accept_group_invite', { p_code: normalizeInviteCode(code) }).abortSignal(AbortSignal.timeout(15_000));
  if (error) throw error;
}
