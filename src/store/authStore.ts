import { removeOwnerReviewSubmission } from '../lib/reviewSubmission';
import { removeOwnerDrafts } from '../lib/localDrafts';
import { create } from 'zustand';
import { setNotificationSession } from '../lib/notificationSync';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { User } from '../types';
import { supabase } from '../lib/supabase';
import { clearStores } from '../utils/storeManager';
import { hydrateUserData, resetHydration, flushPendingSettings } from '../lib/sync/hydrate';
import { flush as flushOutbox, clearOutbox, pauseOutbox, setOutboxOwner, enqueue, pendingCount } from '../lib/sync/outbox';
import { toast } from './toastStore';
import { deleteAccountData } from '../data/deleteAccount';
import { usePasswordRecoveryStore } from './passwordRecoveryStore';
import { runAuthMutation } from '../lib/authMutation';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  onboardingDone: boolean;
  /** 초기 세션 복원이 끝났는지 — false 동안은 라우팅 판단 보류 */
  authReady: boolean;
  sessionError: string | null;
  retrySession: () => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
  deleteAccount: () => Promise<{ success: boolean; error?: string }>;
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

const PROFILE_CACHE_KEY = 'onju-profile-cache';
function cacheProfile(profile: ProfileRow) {
  try { localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile)); } catch { /* 캐시 쓰기 실패는 인증을 막지 않음 */ }
}
function cachedProfile(userId: string): ProfileRow | null {
  try {
    const value = JSON.parse(localStorage.getItem(PROFILE_CACHE_KEY) ?? 'null');
    if (value?.id === userId && typeof value.name === 'string' && typeof value.onboarding_done === 'boolean'
      && typeof value.weekly_goal_slots === 'number') return value as ProfileRow;
  } catch { /* 다른 계정·잘못된 캐시를 사용하지 않는다 */ }
  return null;
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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, profile_image, weekly_goal_slots, onboarding_done')
      .eq('id', userId)
      .abortSignal(controller.signal)
      .single();
    if (error) {
      console.error('프로필 조회 실패:', error.message);
      return null;
    }
    return data as ProfileRow;
  } finally { clearTimeout(timer); }
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
  sessionError: null,
  retrySession: async () => {
    const revision = authRevision;
    if (!get().isAuthenticated) set({ authReady: false, sessionError: null });
    try {
      await runAuthMutation(() => supabase.auth.initialize());
      const { data, error } = await supabase.auth.getSession();
      if (revision !== authRevision) return;
      if (error) throw error;
      handleAuthStateChange('INITIAL_SESSION', data.session);
    } catch {
      if (revision === authRevision) set({ authReady: true, sessionError: '로그인 정보를 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.' });
    }
  },

  signup: async (name, email, password) => {
    try {
      const { data, error } = await runAuthMutation(() => supabase.auth.signUp({
        email,
        password,
        options: { data: { name } }, // handle_new_user 트리거가 profiles.name으로 사용
      }));
      if (error) return { success: false, error: koreanAuthError(error.message) };
      // 이메일 확인 OFF 상태에서는 세션이 바로 생긴다 — onAuthStateChange가 상태를 채움
      if (!data.session) {
        return { success: false, error: '가입 확인 메일을 확인해주세요.' };
      }
      return { success: true };
    } catch { return { success: false, error: '회원가입에 연결하지 못했어요. 네트워크를 확인해주세요.' }; }
  },

  login: async (email, password) => {
    try {
      set({ sessionError: null });
      const { error } = await runAuthMutation(() => supabase.auth.signInWithPassword({ email, password }));
      if (error) return { success: false, error: koreanAuthError(error.message) };
      return { success: true };
    } catch { return { success: false, error: '로그인에 연결하지 못했어요. 네트워크를 확인해주세요.' }; }
  },

  logout: async () => {
    flushPendingSettings();
    const userId = sessionUserId;
    try {
      const signedOut = await runAuthMutation(async () => {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;
        if (data.session && data.session.user.id !== userId) {
          handleAuthStateChange('SIGNED_IN', data.session);
          return false;
        }
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
        return true;
      });
      if (signedOut && sessionUserId === userId) handleAuthStateChange('SIGNED_OUT', null);
      return { success: true };
    } catch {
      return { success: false, error: '로그아웃을 완료하지 못했어요. 네트워크를 확인한 뒤 다시 시도해주세요. 저장 대기 중인 변경사항은 보관돼요.' };
    }
  },

  deleteAccount: async () => {
    const userId = get().user?.id;
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!userId || data.session?.user.id !== userId || get().user?.id !== userId) {
        throw new Error('삭제할 계정의 세션을 확인하지 못했어요.');
      }
      await deleteAccountData(userId, data.session.access_token);
    } catch (error) {
      console.error('계정 삭제 실패:', error);
      return { success: false, error: '계정 삭제를 완료하지 못했어요. 일부 인증 사진이 삭제되었을 수 있어요. 네트워크를 확인한 뒤 다시 시도해주세요.' };
    }
    // 처리 중 다른 계정으로 전환했다면 새 계정의 세션과 데이터를 건드리지 않는다.
    clearOutbox(userId);
    try { removeOwnerDrafts(userId!); removeOwnerReviewSubmission(userId!); } catch { toast.error('기기의 초안을 지우지 못했어요. 브라우저의 사이트 데이터도 지워주세요.'); }
    if (get().user?.id !== userId) return { success: true };
    // 서버 계정은 이미 삭제됨 — 세션 정리는 실패해도 로컬 정리를 막지 않는다
    try {
      await runAuthMutation(async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session && data.session.user.id !== userId) {
          handleAuthStateChange('SIGNED_IN', data.session);
          return;
        }
        await supabase.auth.signOut({ scope: 'local' });
      });
    } catch { /* 이미 삭제된 계정의 세션 해지 실패는 무시 */ }
    if (get().user && get().user?.id !== userId) return { success: true };
    resetHydration();
    clearStores();
    localStorage.removeItem(PROFILE_CACHE_KEY);
    usePasswordRecoveryStore.getState().finish();
    localStorage.removeItem('onju_last_uid');
    set({ user: null, isAuthenticated: false, onboardingDone: false });
    return { success: true };
  },

  setOnboardingDone: () => {
    const { user } = get();
    set({ onboardingDone: true });
    if (user) {
      const profile = cachedProfile(user.id);
      if (profile) cacheProfile({ ...profile, onboarding_done: true });
      enqueue({ type: 'update', table: 'profiles', values: { onboarding_done: true }, match: { id: user.id } });
    }
  },

  updateWeeklySlots: (slots) => {
    const { user } = get();
    if (!user) return;
    set({ user: { ...user, weeklyGoalSlots: slots } });
    const profile = cachedProfile(user.id);
    if (profile) cacheProfile({ ...profile, weekly_goal_slots: slots });
    enqueue({ type: 'update', table: 'profiles', values: { weekly_goal_slots: slots }, match: { id: user.id } });
  },
}));

/** 세션 변화 → 스토어 동기화. 로그인(복원 포함) 시 프로필을 읽어 채운다. */
let authRevision = 0;
let sessionUserId: string | null = null;
let profileNeedsRefresh = false;
function handleAuthStateChange(event: AuthChangeEvent, session: Session | null) {
  setNotificationSession(session);
  const revision = ++authRevision;
  const userId = session?.user.id ?? null;
  const lastUid = localStorage.getItem('onju_last_uid');
  if (userId !== sessionUserId) {
    const previousUserId = sessionUserId;
    flushPendingSettings();
    setOutboxOwner(userId);
    sessionUserId = userId;
    resetHydration();
    if (!userId || previousUserId !== null || lastUid !== userId) {
      pauseOutbox();
      clearStores();
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
    profileNeedsRefresh = false;
    useAuthStore.setState({ user: null, isAuthenticated: false, onboardingDone: false, authReady: false, sessionError: null });
  }
  if (userId) localStorage.setItem('onju_last_uid', userId);
  else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
    resetHydration();
    pauseOutbox();
    clearStores();
    localStorage.removeItem(PROFILE_CACHE_KEY);
    localStorage.removeItem('onju_last_uid');
  }
  if (event === 'PASSWORD_RECOVERY' && userId) usePasswordRecoveryStore.getState().begin(userId);
  else if (event === 'SIGNED_OUT') usePasswordRecoveryStore.getState().finish();
  else usePasswordRecoveryStore.getState().restore(userId);
  // 콜백 안에서 supabase 호출이 데드락을 만들 수 있어 마이크로태스크로 미룬다 (공식 권고)
  setTimeout(() => {
    void (async () => {
      if (revision !== authRevision) return;
      if (session?.user) {
        const current = useAuthStore.getState().user;
        if (current?.id !== session.user.id || profileNeedsRefresh) {
          await flushOutbox();
          if (revision !== authRevision) return;
          let profile: ProfileRow | null;
          const cached = cachedProfile(session.user.id);
          try { profile = pendingCount(session.user.id) > 0 && cached ? null : await fetchProfile(session.user.id); } catch { profile = null; }
          if (revision !== authRevision) return;
          profileNeedsRefresh = !profile;
          if (profile) cacheProfile(profile);
          else profile = cached;
          if (profile) {
            useAuthStore.setState({
              user: toUser(profile, session.user.email),
              isAuthenticated: true,
              onboardingDone: profile.onboarding_done,
              authReady: true,
              sessionError: null,
            });
            // 서버 데이터로 전체 스토어 채우기 (서버 우선)
            void hydrateUserData(profile.id);
            return;
          }
          useAuthStore.setState({ authReady: true, sessionError: '로그인은 되었지만 프로필을 불러오지 못했어요. 연결 상태를 확인하고 다시 시도해주세요.' });
          return;
        }
        await flushOutbox();
        if (revision !== authRevision) return;
        void hydrateUserData(session.user.id);
        useAuthStore.setState({ authReady: true });
      } else if (event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        localStorage.removeItem('onju_last_uid');
        useAuthStore.setState({
          user: null,
          isAuthenticated: false,
          onboardingDone: false,
          authReady: true,
          sessionError: null,
        });
      }
    })().catch(error => {
      if (revision !== authRevision) return;
      console.error('세션 복원 실패:', error);
      toast.error('로그인 정보를 불러오지 못했어요. 다시 시도해주세요.');
      useAuthStore.setState({ authReady: true, sessionError: '로그인 정보를 불러오지 못했어요. 다시 시도해주세요.' });
    });
  }, 0);
}
supabase.auth.onAuthStateChange(handleAuthStateChange);

if (typeof window !== 'undefined') {
  const retry = () => {
    if (sessionUserId && (profileNeedsRefresh || useAuthStore.getState().sessionError)) void useAuthStore.getState().retrySession();
  };
  window.addEventListener('online', retry);
  window.addEventListener('onju-outbox-drained', retry);
}
