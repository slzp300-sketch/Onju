import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App } from '@capacitor/app';
import api from '../api';

/** Capacitor 네이티브(안드로이드/iOS) 실행 여부. 웹이면 false. */
export const isNativePlatform = () => Capacitor.isNativePlatform();

type Provider = 'google' | 'kakao';
export interface SocialProfile {
  id: string;
  name: string;
  email?: string;
}

/**
 * 네이티브 OAuth 리다이렉트 URI.
 * - AndroidManifest.xml의 intent-filter(android:scheme="onju")와 반드시 일치해야 함.
 * - 각 콘솔(카카오/구글)에 redirect URI로 등록 필요. (docs/NATIVE_OAUTH.md 참고)
 */
const REDIRECT_URI = 'onju://oauth';

// 콘솔에서 발급받아 .env(VITE_*)로 주입. 자세한 절차는 docs/NATIVE_OAUTH.md.
const KAKAO_REST_KEY = import.meta.env.VITE_KAKAO_REST_KEY as string | undefined;
const GOOGLE_NATIVE_CLIENT_ID = import.meta.env.VITE_GOOGLE_NATIVE_CLIENT_ID as string | undefined;

function authorizeUrl(provider: Provider): string {
  if (provider === 'kakao') {
    const q = new URLSearchParams({
      client_id: KAKAO_REST_KEY ?? '',
      redirect_uri: REDIRECT_URI,
      response_type: 'code',
    });
    return `https://kauth.kakao.com/oauth/authorize?${q.toString()}`;
  }
  const q = new URLSearchParams({
    client_id: GOOGLE_NATIVE_CLIENT_ID ?? '',
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

/**
 * 백엔드에서 인가코드(code)를 프로필로 교환한다.
 * - 카카오: 기존 /api/kakao-token 재사용 (redirectUri만 네이티브 스킴으로 전달).
 * - 구글: /api/google-token 엔드포인트 신규 필요 (docs/NATIVE_OAUTH.md).
 */
async function exchangeCodeForProfile(provider: Provider, code: string): Promise<SocialProfile> {
  const endpoint = provider === 'kakao' ? '/kakao-token' : '/google-token';
  const { data } = await api.post<SocialProfile>(endpoint, { code, redirectUri: REDIRECT_URI });
  return data;
}

/**
 * 시스템 브라우저(Custom Tab)로 OAuth 인가 페이지를 열고,
 * onju:// 딥링크 콜백으로 인가코드를 받아 백엔드 교환 후 프로필을 반환한다.
 *
 * 웹에서는 호출하지 말 것 — Login.tsx에서 isNativePlatform()로 분기한다.
 * 동작하려면: ① 콘솔에 REDIRECT_URI 등록 ② VITE_* 키 주입 ③ (구글) /api/google-token 백엔드.
 */
export function nativeOAuthLogin(provider: Provider): Promise<SocialProfile> {
  return new Promise<SocialProfile>((resolve, reject) => {
    let settled = false;
    const handlePromise = App.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(REDIRECT_URI)) return;
      settled = true;
      try { await Browser.close(); } catch { /* 일부 플랫폼은 close 미지원 */ }
      (await handlePromise).remove();
      try {
        const code = new URL(url).searchParams.get('code');
        if (!code) throw new Error('인가코드를 받지 못했어요.');
        resolve(await exchangeCodeForProfile(provider, code));
      } catch (e) {
        reject(e);
      }
    });
    Browser.open({ url: authorizeUrl(provider) }).catch((e) => {
      if (!settled) reject(e);
    });
  });
}
