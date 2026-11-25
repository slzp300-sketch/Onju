import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { runAuthMutation } from './authMutation';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!url || !anonKey) {
  console.error('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 설정되지 않았어요. (.env 확인)');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    flowType: 'pkce',
    persistSession: true,
    autoRefreshToken: true,
    skipAutoInitialize: true,
    // 네이티브는 딥링크(appUrlOpen)에서 직접 exchangeCodeForSession을 호출한다
    detectSessionInUrl: !Capacitor.isNativePlatform(),
  },
});

// 웹 URL의 PKCE 교환도 다른 탭의 로그인/로그아웃과 겹쳐 세션을 덮어쓰지 않도록 한다.
void runAuthMutation(() => supabase.auth.initialize()).catch(() => {
  console.error('인증 초기화에 연결하지 못했어요. 로그인 정보 다시 불러오기를 사용해주세요.');
});

/** 전송 중 계정이 바뀌어도 해당 요청의 인증 토큰은 시작한 세션에 고정한다. */
export function supabaseForSession(accessToken: string) {
  return createClient(url, anonKey, { accessToken: async () => accessToken });
}

/** 비밀번호 변경 중 다른 계정으로 바뀌어도 시작 계정만 변경하는 독립 Auth 클라이언트. */
export function isolatedAuthClient() {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'onju-isolated-auth' },
  });
}
