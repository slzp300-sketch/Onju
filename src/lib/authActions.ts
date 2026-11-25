import { supabase, isolatedAuthClient } from './supabase';
import { NATIVE_PASSWORD_RESET_URI } from './nativeAuthLinks';
import { usePasswordRecoveryStore } from '../store/passwordRecoveryStore';
import { runAuthMutation } from './authMutation';
import {
  isNativePlatform,
  googleNativeIdToken,
  kakaoNativeLogin,
  NATIVE_REDIRECT_URI,
} from './nativeAuth';

/**
 * 소셜 로그인 진입점 (플랫폼 분기).
 * 성공 시 supabase 세션이 생기고 authStore의 onAuthStateChange가 상태를 채운다 —
 * 호출부는 navigate를 직접 하지 말고 isAuthenticated 변화를 따라간다.
 * 웹 OAuth는 페이지 리다이렉트가 일어나므로 resolve를 기다리지 않을 수 있다.
 */
export async function loginWithGoogle(): Promise<void> {
  if (isNativePlatform()) {
    const idToken = await googleNativeIdToken();
    const { error } = await runAuthMutation(() => supabase.auth.signInWithIdToken({ provider: 'google', token: idToken }));
    if (error) throw error;
    return;
  }
  const { error } = await runAuthMutation(() => supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  }));
  if (error) throw error;
}

/** 비밀번호 재설정 메일 발송 — 링크를 열면 /reset-password로 복귀한다 */
export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await runAuthMutation(() => supabase.auth.resetPasswordForEmail(email, {
    redirectTo: isNativePlatform() ? NATIVE_PASSWORD_RESET_URI : `${window.location.origin}/reset-password`,
  }));
  if (error) throw error;
}

/** 재설정 링크로 생긴 세션에서 새 비밀번호 저장 */
export async function updatePassword(password: string, userId: string): Promise<void> {
  const { data, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  if (data.session?.user.id !== userId || usePasswordRecoveryStore.getState().userId !== userId) {
    throw new Error('복구할 계정이 바뀌었어요. 새 재설정 링크를 요청해주세요.');
  }
  const client = isolatedAuthClient();
  const { error: restoreError } = await client.auth.setSession({
    access_token: data.session.access_token, refresh_token: data.session.refresh_token,
  });
  if (restoreError) throw restoreError;
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
  if (usePasswordRecoveryStore.getState().userId === userId) usePasswordRecoveryStore.getState().finish();
}

export async function loginWithKakao(): Promise<void> {
  if (isNativePlatform()) {
    const { data, error } = await runAuthMutation(() => supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { skipBrowserRedirect: true, redirectTo: NATIVE_REDIRECT_URI },
    }));
    if (error) throw error;
    await kakaoNativeLogin(data.url);
    return;
  }
  const { error } = await runAuthMutation(() => supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  }));
  if (error) throw error;
}
