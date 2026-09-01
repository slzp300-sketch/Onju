import { supabase } from '../lib/supabase';
import type { DailyRoutine, ProofReaction, RoutineProof, SharedRoutine } from '../types';
import { newId } from '../utils/id';

/* eslint-disable @typescript-eslint/no-explicit-any */

const SIGNED_URL_TTL = 60 * 60; // 1시간

/** 내 모임들의 공유 루틴 + 응원/담아가기/주간 인증 지표 */
export async function fetchSharedRoutines(
  groupIds: string[],
  myUserId: string,
): Promise<SharedRoutine[]> {
  if (groupIds.length === 0) return [];
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);

  const [sharesRes, proofsRes] = await Promise.all([
    supabase
      .from('shared_routines')
      .select('*, profiles(name), shared_routine_cheers(user_id)')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false }),
    supabase
      .from('routine_proofs')
      .select('user_id, routine_id')
      .in('group_id', groupIds)
      .gte('proof_date', weekAgo),
  ]);
  if (sharesRes.error) throw sharesRes.error;
  if (proofsRes.error) throw proofsRes.error;

  // (작성자, 원본 루틴) 별 최근 7일 인증 횟수
  const proofCount = new Map<string, number>();
  for (const p of proofsRes.data ?? []) {
    if (!p.routine_id) continue;
    const key = `${p.user_id}:${p.routine_id}`;
    proofCount.set(key, (proofCount.get(key) ?? 0) + 1);
  }

  return (sharesRes.data ?? []).map((row: any): SharedRoutine => {
    const cheers: { user_id: string }[] = row.shared_routine_cheers ?? [];
    return {
      id: row.id,
      groupId: row.group_id,
      userId: row.user_id,
      userName: row.profiles?.name ?? '알 수 없음',
      sourceRoutineId: row.source_routine_id ?? undefined,
      title: row.title,
      emoji: row.emoji ?? undefined,
      when: row.when_text,
      kind: row.kind,
      steps: Array.isArray(row.steps) ? row.steps : [],
      adoptCount: row.adopt_count,
      cheerCount: cheers.length,
      cheeredByMe: cheers.some(c => c.user_id === myUserId),
      weeklyProofCount: row.source_routine_id
        ? proofCount.get(`${row.user_id}:${row.source_routine_id}`) ?? 0
        : 0,
      createdAt: row.created_at,
    };
  });
}

/** 내 루틴을 여러 모임에 스냅샷으로 공유 */
export async function shareRoutineToGroups(
  routine: DailyRoutine,
  steps: string[],
  groupIds: string[],
): Promise<void> {
  const rows = groupIds.map(groupId => ({
    id: newId(),
    group_id: groupId,
    source_routine_id: routine.id,
    title: routine.title,
    emoji: routine.emoji ?? null,
    when_text: routine.when ?? '',
    kind: routine.type,
    steps,
  }));
  const { error } = await supabase
    .from('shared_routines')
    .upsert(rows, { onConflict: 'group_id,user_id,source_routine_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function unshareRoutine(shareId: string): Promise<void> {
  const { error } = await supabase.from('shared_routines').delete().eq('id', shareId);
  if (error) throw error;
}

export async function toggleShareCheer(shareId: string, on: boolean, myUserId: string): Promise<void> {
  if (on) {
    const { error } = await supabase.from('shared_routine_cheers').insert({ share_id: shareId });
    if (error && error.code !== '23505') throw error; // 중복 응원은 멱등 성공
  } else {
    const { error } = await supabase
      .from('shared_routine_cheers')
      .delete()
      .eq('share_id', shareId)
      .eq('user_id', myUserId);
    if (error) throw error;
  }
}

/** 담아가기 — 서버 카운트 증가. 내 루틴으로의 복제는 호출부(스토어)가 수행한다. */
export async function adoptSharedRoutine(shareId: string): Promise<void> {
  const { error } = await supabase.rpc('adopt_shared_routine', { sid: shareId });
  if (error) throw error;
}

/** 오늘의 모임 인증 보드 (사진은 서명 URL로) */
export async function fetchTodayProofs(
  groupIds: string[],
  date: string,
  myUserId: string,
): Promise<RoutineProof[]> {
  if (groupIds.length === 0) return [];
  const { data, error } = await supabase
    .from('routine_proofs')
    .select('*, profiles(name), proof_reactions(user_id, emoji)')
    .in('group_id', groupIds)
    .eq('proof_date', date)
    .order('created_at', { ascending: false });
  if (error) throw error;

  // 한 인증을 여러 모임에 올리면 행이 복수 — 보드에는 한 번만
  const seen = new Set<string>();
  const rows = (data ?? []).filter((r: any) => {
    const key = `${r.user_id}:${r.photo_path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const paths = rows.map((r: any) => r.photo_path);
  const urlByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed, error: signErr } = await supabase.storage
      .from('proofs')
      .createSignedUrls(paths, SIGNED_URL_TTL);
    if (signErr) throw signErr;
    for (const s of signed ?? []) {
      if (s.signedUrl && s.path) urlByPath.set(s.path, s.signedUrl);
    }
  }

  return rows.map((row: any): RoutineProof => {
    const reactions: Record<ProofReaction, number> = { heart: 0, fire: 0, clap: 0 };
    const myReactions: Record<ProofReaction, boolean> = { heart: false, fire: false, clap: false };
    for (const re of row.proof_reactions ?? []) {
      const emoji = re.emoji as ProofReaction;
      if (!(emoji in reactions)) continue;
      reactions[emoji] += 1;
      if (re.user_id === myUserId) myReactions[emoji] = true;
    }
    return {
      id: row.id,
      groupId: row.group_id,
      userId: row.user_id,
      userName: row.profiles?.name ?? '알 수 없음',
      routineId: row.routine_id ?? undefined,
      routineTitle: row.routine_title,
      routineEmoji: row.routine_emoji ?? undefined,
      photoPath: row.photo_path,
      photoUrl: urlByPath.get(row.photo_path),
      note: row.note,
      proofDate: row.proof_date,
      createdAt: row.created_at,
      reactions,
      myReactions,
    };
  });
}

/** 인증 게시 — 사진 1장을 업로드하고 선택한 모임마다 인증 행을 만든다 */
export async function createProof(params: {
  myUserId: string;
  routine: Pick<DailyRoutine, 'id' | 'title' | 'emoji'>;
  photo: Blob;
  note: string;
  groupIds: string[];
}): Promise<void> {
  const { myUserId, routine, photo, note, groupIds } = params;
  const photoPath = `${myUserId}/${newId()}.jpg`;

  const { error: uploadErr } = await supabase.storage
    .from('proofs')
    .upload(photoPath, photo, { contentType: 'image/jpeg' });
  if (uploadErr) throw uploadErr;

  const rows = groupIds.map(groupId => ({
    id: newId(),
    group_id: groupId,
    routine_id: routine.id,
    routine_title: routine.title,
    routine_emoji: routine.emoji ?? null,
    photo_path: photoPath,
    note,
  }));
  const { error } = await supabase.from('routine_proofs').insert(rows);
  if (error) throw error;
}

export async function toggleProofReaction(
  proofId: string,
  emoji: ProofReaction,
  on: boolean,
  myUserId: string,
): Promise<void> {
  if (on) {
    const { error } = await supabase.from('proof_reactions').insert({ proof_id: proofId, emoji });
    if (error && error.code !== '23505') throw error;
  } else {
    const { error } = await supabase
      .from('proof_reactions')
      .delete()
      .eq('proof_id', proofId)
      .eq('emoji', emoji)
      .eq('user_id', myUserId);
    if (error) throw error;
  }
}
