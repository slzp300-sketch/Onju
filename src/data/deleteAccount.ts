import { supabaseForSession } from '../lib/supabase';

/** 인증 사진은 DB cascade로 지워지지 않으므로 Storage API로 먼저 정리한다. */
export async function deleteAccountData(userId: string, accessToken: string): Promise<void> {
  const client = supabaseForSession(accessToken);
  const photos = client.storage.from('proofs');
  while (true) {
    // 삭제 후 목록이 줄어들므로 offset을 늘리면 남은 사진을 건너뛰게 된다.
    const { data, error } = await photos.list(userId, { limit: 100, offset: 0 });
    if (error) throw error;
    if (!data) throw new Error('인증 사진 목록을 확인하지 못했어요.');
    if (data.length === 0) break;
    if (data.some(file => !file.id)) throw new Error('인증 사진 폴더를 확인해주세요.');
    const paths = data.map(file => `${userId}/${file.name}`);
    const removed = await photos.remove(paths);
    if (removed.error) throw removed.error;
    if (removed.data?.length !== paths.length) throw new Error('인증 사진을 모두 삭제하지 못했어요.');
  }
  const { error } = await client.rpc('delete_account');
  if (error) throw error;
}
