import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

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
    // 네이티브는 딥링크(appUrlOpen)에서 직접 exchangeCodeForSession을 호출한다
    detectSessionInUrl: !Capacitor.isNativePlatform(),
  },
});
