import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: false, reset: vi.fn(), getSession: vi.fn(), isolated: vi.fn(), setSession: vi.fn(), update: vi.fn(),
}));
vi.mock('./supabase', () => ({
  supabase: { auth: { resetPasswordForEmail: mocks.reset, getSession: mocks.getSession } }, isolatedAuthClient: mocks.isolated,
}));
vi.mock('./nativeAuth', () => ({ isNativePlatform: () => mocks.native, NATIVE_REDIRECT_URI: 'onju://oauth' }));
vi.mock('./nativeAuthLinks', () => ({ NATIVE_PASSWORD_RESET_URI: 'onju://reset-password' }));
import { requestPasswordReset, updatePassword } from './authActions';
import { usePasswordRecoveryStore } from '../store/passwordRecoveryStore';

beforeEach(() => {
  vi.resetAllMocks(); mocks.native = false;
  sessionStorage.clear(); usePasswordRecoveryStore.getState().finish();
  mocks.reset.mockResolvedValue({ error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'a' }, access_token: 'access-a', refresh_token: 'refresh-a' } }, error: null });
  mocks.isolated.mockReturnValue({ auth: { setSession: mocks.setSession, updateUser: mocks.update } });
  mocks.setSession.mockResolvedValue({ error: null }); mocks.update.mockResolvedValue({ error: null });
});

test('웹 메일은 현재 웹 주소로, 네이티브 메일은 앱 딥링크로 복귀한다', async () => {
  await requestPasswordReset('a@example.test');
  expect(mocks.reset).toHaveBeenLastCalledWith('a@example.test', { redirectTo: `${window.location.origin}/reset-password` });
  mocks.native = true;
  await requestPasswordReset('a@example.test');
  expect(mocks.reset).toHaveBeenLastCalledWith('a@example.test', { redirectTo: 'onju://reset-password' });
});

test('메일 전송 오류를 성공으로 처리하지 않는다', async () => {
  mocks.reset.mockResolvedValueOnce({ error: new Error('rate limit') });
  await expect(requestPasswordReset('a@example.test')).rejects.toThrow('rate limit');
});

test('복구 세션 확인 없이 로그인 상태만으로 비밀번호를 변경하지 않는다', async () => {
  await expect(updatePassword('fake-password', 'a')).rejects.toThrow('복구할 계정');
  expect(mocks.update).not.toHaveBeenCalled();
});

test('복구 계정과 현재 세션이 다르면 변경 요청을 보내지 않는다', async () => {
  usePasswordRecoveryStore.getState().begin('b');
  await expect(updatePassword('fake-password', 'b')).rejects.toThrow('계정이 바뀌었어요');
  expect(mocks.isolated).not.toHaveBeenCalled();
});

test('변경 중 B로 전환해도 독립 클라이언트는 A 토큰만 쓰고 B 복구 상태를 지우지 않는다', async () => {
  usePasswordRecoveryStore.getState().begin('a');
  let finish!: (result: { error: null }) => void;
  mocks.setSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const pending = updatePassword('fake-password', 'a');
  await vi.waitFor(() => expect(mocks.setSession).toHaveBeenCalledOnce());
  usePasswordRecoveryStore.getState().begin('b');
  finish({ error: null }); await pending;
  expect(mocks.setSession).toHaveBeenCalledWith({ access_token: 'access-a', refresh_token: 'refresh-a' });
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ password: 'fake-password' });
  expect(usePasswordRecoveryStore.getState().userId).toBe('b');
});

test('변경 실패 시 복구 상태를 보존하고 성공 후에는 해제한다', async () => {
  usePasswordRecoveryStore.getState().begin('a');
  mocks.update.mockResolvedValueOnce({ error: new Error('offline') });
  await expect(updatePassword('fake-password', 'a')).rejects.toThrow('offline');
  expect(usePasswordRecoveryStore.getState().userId).toBe('a');
  await updatePassword('fake-password', 'a');
  expect(usePasswordRecoveryStore.getState().userId).toBeNull();
});

test('독립 세션 복원 실패 시 비밀번호를 변경하지 않는다', async () => {
  usePasswordRecoveryStore.getState().begin('a');
  mocks.setSession.mockResolvedValueOnce({ error: new Error('expired') });
  await expect(updatePassword('fake-password', 'a')).rejects.toThrow('expired');
  expect(mocks.update).not.toHaveBeenCalled();
});
