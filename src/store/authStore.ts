import { create } from 'zustand';
import type { User } from '../types';
import { supabase } from '../lib/supabase';
import { clearStores } from '../utils/storeManager';
import { hydrateUserData, resetHydration } from '../lib/sync/hydrate';
import { flush as flushOutbox, clearOutbox } from '../lib/sync/outbox';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  onboardingDone: boolean;
  /** 초기 세션 복원이 끝났는지 — false 동안은 라우팅 판단 보류 */
  authReady: boolean;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  setOnboardingDone: () => void;
  updateWeeklySlots: (slots: number) => void;
}

interface ProfileRow {
  id: string;
  name: string;
  profile_image: string | null;
  weekly_goal_slots: number;
  onboarding_done: boolean;
}

// email은 profiles에서 읽지 않는다 — 본인 외 노출 차단을 위해 컬럼 권한이 막혀 있고,
// 본인 이메일은 인증 세션(session.user.email)에서 가져온다.
function toUser(p: ProfileRow, email: string | undefined): User {
  return {
    id: p.id,
    name: p.name,
    email: email ?? '',
    profileImage: p.profile_image ?? undefined,
    weeklyGoalSlots: p.weekly_goal_slots,
  };
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, profile_image, weekly_goal_slots, onboarding_done')
    .eq('id', userId)
    .single();
  if (error) {
    console.error('프로필 조회 실패:', error.message);
    return null;
  }
  return data as ProfileRow;
}

/** 인증 에러 → 한국어 메시지 */
function koreanAuthError(message: string): string {
  if (/already registered|already exists/i.test(message)) return '이미 사용 중인 이메일이에요.';
  if (/invalid login credentials/i.test(message)) return '이메일 또는 비밀번호가 올바르지 않아요.';
  if (/password should be at least/i.test(message)) return '비밀번호는 6자 이상이어야 해요.';
  if (/valid email/i.test(message)) return '올바른 이메일 주소를 입력해주세요.';
  if (/rate limit|too many/i.test(message)) return '잠시 후 다시 시도해주세요.';
  return '요청을 처리하지 못했어요. 잠시 후 다시 시도해주세요.';
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  isAuthenticated: false,
  onboardingDone: false,
  authReady: false,

  signup: async (name, email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } }, // handle_new_user 트리거가 profiles.name으로 사용
    });
    if (error) return { success: false, error: koreanAuthError(error.message) };
    // 이메일 확인 OFF 상태에서는 세션이 바로 생긴다 — onAuthStateChange가 상태를 채움
    if (!data.session) {
      return { success: false, error: '가입 확인 메일을 확인해주세요.' };
    }
    return { success: true };
  },

  login: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { success: false, error: koreanAuthError(error.message) };
    return { success: true };
  },

  logout: async () => {
    await supabase.auth.signOut();
    clearStores();
    resetHydration();
    clearOutbox();
    set({ user: null, isAuthenticated: false, onboardingDone: false });
  },

  setOnboardingDone: () => {
    const { user } = get();
    set({ onboardingDone: true });
    if (user) {
      void supabase.from('profiles').update({ onboarding_done: true }).eq('id', user.id)
        .then(({ error }) => { if (error) console.error('온보딩 상태 저장 실패:', error.message); });
    }
  },

  updateWeeklySlots: (slots) => {
    const { user } = get();
    if (!user) return;
    set({ user: { ...user, weeklyGoalSlots: slots } });
    void supabase.from('profiles').update({ weekly_goal_slots: slots }).eq('id', user.id)
      .then(({ error }) => { if (error) console.error('슬롯 저장 실패:', error.message); });
  },
}));

/** 세션 변화 → 스토어 동기화. 로그인(복원 포함) 시 프로필을 읽어 채운다. */
supabase.auth.onAuthStateChange((event, session) => {
  // 콜백 안에서 supabase 호출이 데드락을 만들 수 있어 마이크로태스크로 미룬다 (공식 권고)
  setTimeout(() => {
    void (async () => {
      if (session?.user) {
        // 다른 계정으로 로그인했으면 이전 계정의 로컬 캐시/큐를 먼저 비운다.
        // 같은 사용자 새로고침에서는 비우지 않아 오프라인 데이터 유실을 막는다.
        const lastUid = localStorage.getItem('onju_last_uid');
        if (lastUid !== null && lastUid !== session.user.id) {
          clearStores();
          resetHydration();
          clearOutbox();
        }
        localStorage.setItem('onju_last_uid', session.user.id);

        // 세션이 살아있으면 오프라인 동안 쌓인 쓰기를 먼저 흘려보낸다
        void flushOutbox();
        const current = useAuthStore.getState().user;
        if (current?.id !== session.user.id) {
          const profile = await fetchProfile(session.user.id);
          if (profile) {
            useAuthStore.setState({
              user: toUser(profile, session.user.email),
              isAuthenticated: true,
              onboardingDone: profile.onboarding_done,
              authReady: true,
            });
            // 서버 데이터로 전체 스토어 채우기 (서버 우선)
            void hydrateUserData(profile.id);
            return;
          }
        }
        useAuthStore.setState({ authReady: true });
      } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        localStorage.removeItem('onju_last_uid');
        useAuthStore.setState({
          user: null,
          isAuthenticated: false,
          onboardingDone: false,
          authReady: true,
        });
      }
    })();
  }, 0);
});
