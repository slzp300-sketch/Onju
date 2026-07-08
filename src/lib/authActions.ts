import { supabase } from './supabase';
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
    const { error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
    if (error) throw error;
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw error;
}

// 카카오 이메일(account_email)은 비즈니스 앱 전환·검수가 필요해 개인 앱에선 권한이 없다.
// 기본 scope에 account_email이 포함되면 KOE205로 거부되므로 동의항목만 명시 요청한다.
const KAKAO_SCOPES = 'profile_nickname profile_image';

export async function loginWithKakao(): Promise<void> {
  if (isNativePlatform()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'kakao',
      options: { skipBrowserRedirect: true, redirectTo: NATIVE_REDIRECT_URI, scopes: KAKAO_SCOPES },
    });
    if (error) throw error;
    await kakaoNativeLogin(data.url);
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'kakao',
    options: { redirectTo: `${window.location.origin}/auth/callback`, scopes: KAKAO_SCOPES },
  });
  if (error) throw error;
}
