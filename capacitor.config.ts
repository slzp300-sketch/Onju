import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.onju.app',
  appName: '온주',
  webDir: 'dist',
  // CapacitorHttp 제거: supabase.co는 CORS 정상이고,
  // fetch 패칭이 supabase-js 인증과 충돌하는 사례가 있어 사용하지 않는다
};

export default config;
