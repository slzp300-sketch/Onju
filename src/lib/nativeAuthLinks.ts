import { Browser } from '@capacitor/browser';
import { supabase } from './supabase';
import { runAuthMutation } from './authMutation';
import { usePasswordRecoveryStore } from '../store/passwordRecoveryStore';

export const NATIVE_PASSWORD_RESET_URI = 'onju://reset-password';
export function nativeAuthLinkKind(url: string): 'oauth' | 'recovery' | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'onju:' || parsed.username || parsed.password || parsed.port
      || (parsed.pathname !== '' && parsed.pathname !== '/')) return null;
    if (parsed.hostname === 'oauth') return 'oauth';
    if (parsed.hostname === 'reset-password') return 'recovery';
  } catch { /* 인증 주소가 아닌 딥링크 */ }
  return null;
}

let lastUrl = '';
let lastTask: Promise<void> | null = null;
/** getLaunchUrl/appUrlOpen과 StrictMode의 중복 전달로 코드를 다시 소비하지 않는다. */
export function completeNativeAuthLink(url: string): Promise<void> {
  if (lastUrl === url && lastTask) return lastTask;
  lastUrl = url;
  lastTask = exchange(url);
  return lastTask;
}

async function exchange(url: string): Promise<void> {
  const kind = nativeAuthLinkKind(url);
  if (!kind) throw new Error('올바른 인증 주소가 아니에요.');
  const recovery = usePasswordRecoveryStore.getState();
  if (kind === 'recovery') recovery.verify();
  try {
    const parsed = new URL(url);
    const code = parsed.searchParams.get('code');
    if (!code || parsed.searchParams.has('error')) throw new Error('인증 링크가 만료됐거나 취소됐어요.');
    const { data, error } = await runAuthMutation(() => supabase.auth.exchangeCodeForSession(code));
    if (error) throw error;
    // SDK가 복구 코드 교환 시 PASSWORD_RECOVERY 이벤트를 먼저 전달한다.
    if (kind === 'recovery' && (!data.session || usePasswordRecoveryStore.getState().userId !== data.session.user.id)) {
      throw new Error('비밀번호 복구 링크가 아니에요.');
    }
    try { await Browser.close(); } catch { /* 일부 플랫폼 미지원 */ }
  } catch (error) {
    if (kind === 'recovery') recovery.fail();
    throw error;
  }
}
