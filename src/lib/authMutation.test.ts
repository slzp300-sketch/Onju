import { createClient } from '@supabase/supabase-js';
import { afterEach, expect, test, vi } from 'vitest';
import { runAuthMutation } from './authMutation';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

test('실제 Auth SDK의 A 로그아웃 정리 이후에 B 로그인을 시작해 새 세션을 보존한다', async () => {
  const key = 'onju-auth-race-fixture';
  const session = (id: string) => ({
    access_token: `fixture-${id}`, refresh_token: `refresh-${id}`, token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id, aud: 'authenticated', role: 'authenticated', email: `${id}@example.test`, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
  });
  const stored = new Map([[key, JSON.stringify(session('a'))]]);
  let finishLogout!: () => void;
  const network = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/logout?scope=local')) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer fixture-a');
      await new Promise<void>(resolve => { finishLogout = resolve; });
      return new Response(null, { status: 204 });
    }
    expect(url).toContain('/token?grant_type=password');
    return Response.json(session('b'));
  });
  const client = createClient('https://local-auth.example.test', 'fixture-anon', {
    auth: {
      storageKey: key, autoRefreshToken: false, detectSessionInUrl: false, skipAutoInitialize: true,
      storage: { getItem: name => stored.get(name) ?? null, setItem: (name, value) => { stored.set(name, value); }, removeItem: name => { stored.delete(name); } },
    },
    global: { fetch: network },
  });
  try {
    await runAuthMutation(() => client.auth.initialize());
    const logout = runAuthMutation(() => client.auth.signOut({ scope: 'local' }));
    await vi.waitFor(() => expect(finishLogout).toBeTypeOf('function'));
    const login = runAuthMutation(() => client.auth.signInWithPassword({ email: 'b@example.test', password: 'fixture-only-password' }));
    await Promise.resolve();
    expect(network).toHaveBeenCalledTimes(1);
    finishLogout();
    expect((await logout).error).toBeNull();
    expect((await login).error).toBeNull();
    expect((await client.auth.getSession()).data.session?.user.id).toBe('b');
    expect(JSON.parse(stored.get(key)!).user.id).toBe('b');
  } finally { await client.auth.dispose(); }
});

test('앞선 인증 요청이 실패해도 다음 요청이 잠금에 갇히지 않는다', async () => {
  await expect(runAuthMutation(async () => { throw new Error('offline'); })).rejects.toThrow('offline');
  await expect(runAuthMutation(async () => 'retry')).resolves.toBe('retry');
});

test('잠금 안에서 지연 초기화한 웹 PKCE 복구가 실제 SDK의 복구 이벤트를 전달한다', async () => {
  const previousUrl = window.location.href;
  const key = 'onju-auth-pkce-fixture';
  const stored = new Map([[`${key}-code-verifier`, JSON.stringify('fixture-verifier/recovery')]]);
  window.history.replaceState({}, '', '/reset-password?code=fixture-code');
  const network = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(String(input)).toContain('/token?grant_type=pkce');
    expect(JSON.parse(String(init?.body))).toMatchObject({ auth_code: 'fixture-code', code_verifier: 'fixture-verifier' });
    return Response.json({
      access_token: 'fixture-access', refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600,
      user: { id: 'recovered-user', aud: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    });
  });
  const client = createClient('https://local-auth.example.test', 'fixture-anon', {
    auth: {
      storageKey: key, flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: true, skipAutoInitialize: true,
      storage: { getItem: name => stored.get(name) ?? null, setItem: (name, value) => { stored.set(name, value); }, removeItem: name => { stored.delete(name); } },
    }, global: { fetch: network },
  });
  const events = vi.fn();
  client.auth.onAuthStateChange(events);
  try {
    expect((await runAuthMutation(() => client.auth.initialize())).error).toBeNull();
    await vi.waitFor(() => expect(events).toHaveBeenCalledWith('PASSWORD_RECOVERY', expect.objectContaining({ user: expect.objectContaining({ id: 'recovered-user' }) })));
    expect(network).toHaveBeenCalledOnce();
    expect(window.location.search).toBe('');
  } finally { await client.auth.dispose(); window.history.replaceState({}, '', previousUrl); }
});

test('다른 탭의 Web Lock 대기가 만료되면 세션을 변경하지 않고 재시도할 수 있다', async () => {
  vi.useFakeTimers();
  const action = vi.fn(async () => 'changed');
  const request = vi.fn((_name: string, options: LockOptions) => new Promise<never>((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  }));
  vi.stubGlobal('navigator', { locks: { request } });
  const pending = expect(runAuthMutation(action)).rejects.toMatchObject({ name: 'AbortError' });
  await vi.advanceTimersByTimeAsync(15_000); await pending;
  expect(action).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
