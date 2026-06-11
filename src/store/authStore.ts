import { create } from 'zustand';
import type { User } from '../types';
import { supabase } from '../lib/supabase';
import { clearStores } from '../utils/storeManager';
import { hydrateUserData, resetHydration } from '../lib/sync/hydrate';

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
  email: string | null;
  profile_image: string | null;
  weekly_goal_slots: number;
  onboarding_done: boolean;
}

function toUser(p: ProfileRow): User {
  return {
    id: p.id,
    name: p.name,
    email: p.email ?? '',
    profileImage: p.profile_image ?? undefined,
    weeklyGoalSlots: p.weekly_goal_slots,
  };
}

async function fetchProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
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
        const current = useAuthStore.getState().user;
        if (current?.id !== session.user.id) {
          const profile = await fetchProfile(session.user.id);
          if (profile) {
            useAuthStore.setState({
              user: toUser(profile),
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
