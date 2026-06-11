import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { supabase } from './supabase';

/** Capacitor 네이티브(안드로이드/iOS) 실행 여부. 웹이면 false. */
export const isNativePlatform = () => Capacitor.isNativePlatform();

/**
 * 네이티브 OAuth 리다이렉트 URI (카카오 전용).
 * - AndroidManifest.xml의 intent-filter(android:scheme="onju")와 반드시 일치해야 함.
 * - Supabase Auth 설정의 Redirect URLs 허용목록에도 등록 필요. (docs/NATIVE_OAUTH.md 참고)
 */
export const NATIVE_REDIRECT_URI = 'onju://oauth';

// 웹 로그인과 동일한 구글 Web 클라이언트 ID. 같은 프로젝트에 Android 클라이언트
// (패키지명 + SHA-1)가 등록되어 있어야 네이티브에서 동작한다.
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/**
 * 구글 네이티브 로그인: capgo 플러그인(Credential Manager)으로 idToken을 받아 반환.
 * 시스템 계정 선택 UI가 떠서 브라우저/딥링크 없이 처리된다.
 */
let googleInitialized = false;
export async function googleNativeIdToken(): Promise<string> {
  if (!googleInitialized) {
    await SocialLogin.initialize({ google: { webClientId: GOOGLE_WEB_CLIENT_ID } });
    googleInitialized = true;
  }
  // scopes 옵션은 MainActivity 수정을 요구함 — 기본 로그인의 idToken으로 충분
  const { result } = await SocialLogin.login({ provider: 'google', options: {} });
  if (result.responseType !== 'online' || !result.idToken) {
    throw new Error('구글 인증 토큰을 받지 못했어요.');
  }
  return result.idToken;
}

/**
 * 카카오 네이티브 로그인 마무리: Supabase가 만든 인가 URL을 시스템 브라우저로 열고,
 * onju:// 딥링크로 돌아온 인가코드를 Supabase 세션으로 교환한다.
 */
export function kakaoNativeLogin(authorizeUrl: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const handlePromise = App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(NATIVE_REDIRECT_URI)) return;
      settled = true;
      try { await Browser.close(); } catch { /* 일부 플랫폼은 close 미지원 */ }
      (await handlePromise).remove();
      try {
        const code = new URL(url).searchParams.get('code');
        if (!code) throw new Error('인가코드를 받지 못했어요.');
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        resolve();
      } catch (e) {
        reject(e);
      }
    });
    Browser.open({ url: authorizeUrl }).catch((e) => {
      if (!settled) reject(e);
    });
  });
}
