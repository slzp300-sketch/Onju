import { beforeEach, afterEach, expect, test, vi } from 'vitest';

type Session = { user: { id: string; email: string } } | null;
type Profile = { id: string; name: string; profile_image: null; weekly_goal_slots: number; onboarding_done: boolean };
const mocks = vi.hoisted(() => ({
  event: null as ((event: string, session: Session) => void) | null,
  profile: vi.fn<(id: string) => Promise<{ data: Profile | null; error: null }>>(),
  clearStores: vi.fn(), reset: vi.fn(), clearOutbox: vi.fn(), pause: vi.fn(), hydrate: vi.fn(), flushSettings: vi.fn(), enqueue: vi.fn(), pending: vi.fn(() => 0),
  getSession: vi.fn(), signOut: vi.fn(), deleteAccount: vi.fn(),
  login: vi.fn(), signup: vi.fn(),
}));
vi.mock('../lib/supabase', () => ({ supabase: {
  auth: { initialize: async () => ({ error: null }), onAuthStateChange: (callback: typeof mocks.event) => { mocks.event = callback; }, getSession: mocks.getSession, signOut: mocks.signOut, signInWithPassword: mocks.login, signUp: mocks.signup },
  from: () => ({ select: () => ({ eq: (_key: string, id: string) => ({ abortSignal: () => ({ single: () => mocks.profile(id) }) }) }) }),
} }));
vi.mock('../utils/storeManager', () => ({ clearStores: mocks.clearStores }));
vi.mock('../lib/sync/hydrate', () => ({ hydrateUserData: mocks.hydrate, resetHydration: mocks.reset, flushPendingSettings: mocks.flushSettings }));
vi.mock('../lib/sync/outbox', () => ({ clearOutbox: mocks.clearOutbox, pauseOutbox: mocks.pause, setOutboxOwner: vi.fn(), flush: async () => {}, pendingCount: mocks.pending, pendingGoalIds: () => [], enqueue: mocks.enqueue }));
vi.mock('./toastStore', () => ({ toast: { error: vi.fn() } }));
vi.mock('../data/deleteAccount', () => ({ deleteAccountData: mocks.deleteAccount }));
import { useAuthStore } from './authStore';

const profile = (id: string): Profile => ({ id, name: id, profile_image: null, weekly_goal_slots: 3, onboarding_done: true });
const signIn = (id: string) => mocks.event!('SIGNED_IN', { user: { id, email: `${id}@example.test` } });
beforeEach(async () => {
  vi.useFakeTimers();
  mocks.event!('SIGNED_OUT', null);
  await vi.advanceTimersByTimeAsync(0);
  localStorage.clear();
  vi.clearAllMocks();
  mocks.profile.mockImplementation(async id => ({ data: profile(id), error: null }));
  mocks.deleteAccount.mockResolvedValue(undefined);
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' }, access_token: 'token-a' } }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.pending.mockReturnValue(0);
  mocks.login.mockResolvedValue({ error: null });
});
afterEach(() => { vi.useRealTimers(); });

test('로그아웃 뒤 도착한 프로필이 로그인 상태를 되살리지 않는다', async () => {
  let finish!: (value: { data: Profile; error: null }) => void;
  mocks.profile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  signIn('a');
  await vi.advanceTimersByTimeAsync(0);
  mocks.event!('SIGNED_OUT', null);
  finish({ data: profile('a'), error: null });
  await vi.advanceTimersByTimeAsync(0);
  expect(useAuthStore.getState().user).toBeNull();
  expect(useAuthStore.getState().isAuthenticated).toBe(false);
  expect(mocks.hydrate).not.toHaveBeenCalled();
});

test('B 로그인 후 늦게 끝난 A 프로필은 계정과 hydrate 대상을 바꾸지 않는다', async () => {
  let finish!: (value: { data: Profile; error: null }) => void;
  mocks.profile.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  signIn('a');
  await vi.advanceTimersByTimeAsync(0);
  signIn('b');
  await vi.advanceTimersByTimeAsync(0);
  finish({ data: profile('a'), error: null });
  await vi.advanceTimersByTimeAsync(0);
  expect(useAuthStore.getState().user?.id).toBe('b');
  expect(mocks.hydrate).toHaveBeenCalledExactlyOnceWith('b');
  expect(localStorage.getItem('onju_last_uid')).toBe('b');
});

test('같은 계정의 초기 세션 복원은 오프라인 캐시와 큐를 보존한다', async () => {
  localStorage.setItem('onju_last_uid', 'a');
  mocks.event!('INITIAL_SESSION', { user: { id: 'a', email: 'a@example.test' } });
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.clearStores).not.toHaveBeenCalled();
  expect(mocks.clearOutbox).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.id).toBe('a');
});

test('다른 탭에서 로그아웃하면 표시 데이터를 지우고 미전송 큐는 일시 중지한다', async () => {
  signIn('a');
  await vi.advanceTimersByTimeAsync(0);
  vi.clearAllMocks();
  mocks.event!('SIGNED_OUT', null);
  expect(mocks.reset).toHaveBeenCalled();
  expect(mocks.clearStores).toHaveBeenCalled();
  expect(mocks.pause).toHaveBeenCalled();
  expect(mocks.clearOutbox).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(0);
  expect(useAuthStore.getState().authReady).toBe(true);
});

test('같은 계정의 프로필 조회가 오프라인으로 실패해도 확인된 캐시로 로그인 상태를 복원한다', async () => {
  signIn('a'); await vi.advanceTimersByTimeAsync(0);
  useAuthStore.setState({ user: null, isAuthenticated: false });
  mocks.profile.mockRejectedValueOnce(new Error('offline'));
  mocks.event!('INITIAL_SESSION', { user: { id: 'a', email: 'a@example.test' } });
  await vi.advanceTimersByTimeAsync(0);
  expect(useAuthStore.getState().user?.id).toBe('a');
  expect(useAuthStore.getState().isAuthenticated).toBe(true);
});

test('다른 탭이 마지막 UID를 먼저 바꿔도 이전 계정 캐시를 다음 계정에 사용하지 않는다', async () => {
  signIn('a'); await vi.advanceTimersByTimeAsync(0);
  localStorage.setItem('onju_last_uid', 'b');
  mocks.profile.mockRejectedValueOnce(new Error('offline'));
  vi.clearAllMocks();
  signIn('b'); await vi.advanceTimersByTimeAsync(0);
  expect(mocks.clearStores).toHaveBeenCalled();
  expect(useAuthStore.getState().user).toBeNull();
  expect(useAuthStore.getState().sessionError).not.toBeNull();
});

test('프로필 복원 실패를 다시 시도하면 비밀번호를 다시 입력하지 않고 복원한다', async () => {
  mocks.profile.mockRejectedValueOnce(new Error('offline'));
  signIn('a'); await vi.advanceTimersByTimeAsync(0);
  expect(useAuthStore.getState().sessionError).not.toBeNull();
  await useAuthStore.getState().retrySession();
  await vi.advanceTimersByTimeAsync(0);
  expect(useAuthStore.getState().user?.id).toBe('a');
  expect(useAuthStore.getState().sessionError).toBeNull();
});

test('미전송 온보딩 변경을 오래된 서버 프로필로 되돌리지 않는다', async () => {
  signIn('a'); await vi.advanceTimersByTimeAsync(0);
  useAuthStore.getState().setOnboardingDone();
  useAuthStore.setState({ user: null, isAuthenticated: false });
  mocks.pending.mockReturnValue(1);
  mocks.profile.mockResolvedValueOnce({ data: { ...profile('a'), onboarding_done: false }, error: null });
  mocks.event!('INITIAL_SESSION', { user: { id: 'a', email: 'a@example.test' } });
  await vi.advanceTimersByTimeAsync(0);
  expect(useAuthStore.getState().onboardingDone).toBe(true);
  expect(mocks.enqueue).toHaveBeenCalledWith(expect.objectContaining({ table: 'profiles' }));
});

test('로그인 네트워크 예외를 잡아 재시도 가능한 오류로 돌려준다', async () => {
  mocks.login.mockRejectedValueOnce(new Error('network unreachable'));
  expect((await useAuthStore.getState().login('a@example.test', 'fake-password')).success).toBe(false);
});

test('로그아웃 실패 시 로그인 상태와 표시 데이터를 유지한다', async () => {
  signIn('a'); await vi.advanceTimersByTimeAsync(0);
  vi.clearAllMocks();
  mocks.signOut.mockResolvedValueOnce({ error: new Error('offline') });
  expect((await useAuthStore.getState().logout()).success).toBe(false);
  expect(useAuthStore.getState().user?.id).toBe('a');
  expect(mocks.clearStores).not.toHaveBeenCalled();
  expect(mocks.clearOutbox).not.toHaveBeenCalled();
});

test('A 로그아웃 응답을 기다리는 동안 로그인한 B를 지우지 않는다', async () => {
  signIn('a'); await vi.advanceTimersByTimeAsync(0);
  let finish!: (value: { error: null }) => void;
  mocks.signOut.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = useAuthStore.getState().logout();
  signIn('b'); await vi.advanceTimersByTimeAsync(0);
  vi.clearAllMocks(); finish({ error: null }); await pending;
  expect(useAuthStore.getState().user?.id).toBe('b');
  expect(mocks.clearStores).not.toHaveBeenCalled();
});

test('앞서 진행 중인 B 로그인이 끝난 뒤에는 A의 로그아웃 요청으로 B를 해지하지 않는다', async () => {
  signIn('a'); await vi.advanceTimersByTimeAsync(0);
  let finish!: () => void;
  mocks.login.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { finish = resolve; });
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'b' } } }, error: null });
    signIn('b');
    return { error: null };
  });
  const login = useAuthStore.getState().login('b@example.test', 'fixture-only-password');
  await vi.advanceTimersByTimeAsync(0);
  const logout = useAuthStore.getState().logout();
  finish(); await login; await logout;
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.id).toBe('b');
});

test('사진 정리와 계정 삭제 성공 후 로컬 계정·큐·캐시를 정리한다', async () => {
  signIn('a');
  await vi.advanceTimersByTimeAsync(0);
  expect(await useAuthStore.getState().deleteAccount()).toEqual({ success: true });
  expect(mocks.deleteAccount).toHaveBeenCalledExactlyOnceWith('a', 'token-a');
  expect(useAuthStore.getState().user).toBeNull();
  expect(localStorage.getItem('onju_last_uid')).toBeNull();
  expect(mocks.clearStores).toHaveBeenCalled();
});

test('탈퇴 처리 중 로그인한 B 계정과 캐시를 지우지 않는다', async () => {
  signIn('a');
  await vi.advanceTimersByTimeAsync(0);
  let finish!: () => void;
  mocks.deleteAccount.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  const pending = useAuthStore.getState().deleteAccount();
  await vi.advanceTimersByTimeAsync(0);
  signIn('b');
  await vi.advanceTimersByTimeAsync(0);
  vi.clearAllMocks();
  finish();
  expect(await pending).toEqual({ success: true });
  expect(useAuthStore.getState().user?.id).toBe('b');
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(mocks.clearStores).not.toHaveBeenCalled();
});

test('스토어와 세션 계정이 다르면 서버 삭제를 시작하지 않는다', async () => {
  signIn('b');
  await vi.advanceTimersByTimeAsync(0);
  expect((await useAuthStore.getState().deleteAccount()).success).toBe(false);
  expect(mocks.deleteAccount).not.toHaveBeenCalled();
  expect(useAuthStore.getState().user?.id).toBe('b');
});
