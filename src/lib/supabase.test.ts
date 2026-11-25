import { expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => ({ auth: { initialize: async () => ({ error: null }) } })) }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
import { supabaseForSession } from './supabase';

test('세션 전용 클라이언트는 다음 계정의 토큰을 읽지 않고 시작 세션 토큰을 유지한다', async () => {
  supabaseForSession('token-a');
  const first = mocks.createClient.mock.lastCall as unknown as [string, string, { accessToken: () => Promise<string> }];
  supabaseForSession('token-b');
  const second = mocks.createClient.mock.lastCall as unknown as [string, string, { accessToken: () => Promise<string> }];
  expect(await first[2].accessToken()).toBe('token-a');
  expect(await second[2].accessToken()).toBe('token-b');
  expect(await first[2].accessToken()).toBe('token-a');
});
