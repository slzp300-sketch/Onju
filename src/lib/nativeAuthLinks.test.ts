import { beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ exchange: vi.fn(), close: vi.fn() }));
vi.mock('./supabase', () => ({ supabase: { auth: { exchangeCodeForSession: mocks.exchange } } }));
vi.mock('@capacitor/browser', () => ({ Browser: { close: mocks.close } }));
import { completeNativeAuthLink, nativeAuthLinkKind } from './nativeAuthLinks';
import { usePasswordRecoveryStore } from '../store/passwordRecoveryStore';

beforeEach(() => {
  vi.resetAllMocks(); sessionStorage.clear();
  usePasswordRecoveryStore.getState().finish();
  mocks.exchange.mockImplementation(async () => {
    usePasswordRecoveryStore.getState().begin('a');
    return { data: { session: { user: { id: 'a' } } }, error: null };
  });
  mocks.close.mockResolvedValue(undefined);
});

test('딥링크의 스킴·호스트·경로·자격정보를 정확히 검사한다', () => {
  expect(nativeAuthLinkKind('onju://reset-password?code=fixture')).toBe('recovery');
  expect(nativeAuthLinkKind('onju://oauth?code=fixture')).toBe('oauth');
  for (const url of ['onju://reset-password.evil?code=x', 'onju://user@reset-password?code=x', 'onju://reset-password/path?code=x', 'https://reset-password?code=x']) expect(nativeAuthLinkKind(url)).toBeNull();
});

test('cold/warm 이벤트가 같은 링크를 전달해도 코드 교환은 한 번만 한다', async () => {
  const url = 'onju://reset-password?code=duplicate-fixture';
  await Promise.all([completeNativeAuthLink(url), completeNativeAuthLink(url)]);
  await completeNativeAuthLink(url);
  expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('duplicate-fixture');
  expect(usePasswordRecoveryStore.getState().userId).toBe('a');
});

test('복구 이벤트가 없는 일반 로그인 코드는 재설정 권한으로 인정하지 않는다', async () => {
  mocks.exchange.mockResolvedValueOnce({ data: { session: { user: { id: 'a' } } }, error: null });
  await expect(completeNativeAuthLink('onju://reset-password?code=not-recovery')).rejects.toThrow('복구 링크가 아니에요');
  expect(usePasswordRecoveryStore.getState().userId).toBeNull();
  expect(usePasswordRecoveryStore.getState().error).not.toBeNull();
});

test('만료된 링크와 제공자 오류는 복구 권한을 남기지 않는다', async () => {
  mocks.exchange.mockResolvedValueOnce({ data: { session: null }, error: new Error('expired') });
  await expect(completeNativeAuthLink('onju://reset-password?code=expired-fixture')).rejects.toThrow('expired');
  expect(usePasswordRecoveryStore.getState().processing).toBe(false);
  await expect(completeNativeAuthLink('onju://reset-password?error=access_denied')).rejects.toThrow();
  expect(mocks.exchange).toHaveBeenCalledTimes(1);
});

test('앱이 꺼져 있을 때의 OAuth 복귀도 처리한다', async () => {
  mocks.exchange.mockResolvedValueOnce({ data: { session: { user: { id: 'a' } } }, error: null });
  await completeNativeAuthLink('onju://oauth?code=cold-fixture');
  expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('cold-fixture');
  expect(usePasswordRecoveryStore.getState().userId).toBeNull();
});

test('복구 화면을 새로고침해도 같은 계정에만 복구 상태를 복원한다', () => {
  usePasswordRecoveryStore.getState().begin('a');
  usePasswordRecoveryStore.setState({ userId: null });
  usePasswordRecoveryStore.getState().restore('a');
  expect(usePasswordRecoveryStore.getState().userId).toBe('a');
  usePasswordRecoveryStore.getState().restore('b');
  expect(usePasswordRecoveryStore.getState().userId).toBeNull();
  usePasswordRecoveryStore.getState().restore('a');
  expect(usePasswordRecoveryStore.getState().userId).toBeNull();
});
