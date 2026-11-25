import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  login: vi.fn(), google: vi.fn(), kakao: vi.fn(), reset: vi.fn(), update: vi.fn(), navigate: vi.fn(), retry: vi.fn(),
  state: { user: null as { id: string } | null, isAuthenticated: false, sessionError: null as string | null },
}));
vi.mock('../lib/authActions', () => ({ loginWithGoogle: mocks.google, loginWithKakao: mocks.kakao, requestPasswordReset: mocks.reset, updatePassword: mocks.update }));
vi.mock('../store/authStore', () => ({ useAuthStore: Object.assign(
  () => ({ ...mocks.state, login: mocks.login, retrySession: mocks.retry }), { getState: () => mocks.state },
) }));
vi.mock('../store/toastStore', () => ({ toast: { success: vi.fn() } }));
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<typeof import('react-router-dom')>(), useNavigate: () => mocks.navigate }));
import Login from './Login';
import ResetPassword from './ResetPassword';
import AuthCallback from './AuthCallback';
import { usePasswordRecoveryStore } from '../store/passwordRecoveryStore';

let root: Root, host: HTMLDivElement;
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
async function render(component: React.ReactNode) {
  await act(async () => { root.render(createElement(MemoryRouter, null, component)); }); await tick();
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(button => button.textContent === label);
  expect(button).toBeDefined(); await act(async () => { button!.click(); }); await tick();
}
async function fill(label: string, value: string) {
  const input = host.querySelector(`input[aria-label="${label}"]`)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function submitTwice() {
  await act(async () => {
    const form = host.querySelector('form')!;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }); await tick();
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.resetAllMocks();
  mocks.state = { user: null, isAuthenticated: false, sessionError: null };
  mocks.login.mockResolvedValue({ success: true });
  mocks.update.mockResolvedValue(undefined); mocks.reset.mockResolvedValue(undefined);
  usePasswordRecoveryStore.getState().finish();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });

test('이메일 로그인 중복 제출을 막고 네트워크 실패 후 다시 입력할 수 있다', async () => {
  let finish!: (value: { success: boolean; error: string }) => void;
  mocks.login.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await render(createElement(Login)); await click('이메일로 로그인');
  await fill('이메일', 'a@example.test'); await fill('비밀번호', 'fake-password'); await submitTwice();
  expect(mocks.login).toHaveBeenCalledOnce();
  await act(async () => { finish({ success: false, error: '네트워크 오류' }); }); await tick();
  expect(host.querySelector('[role=alert]')?.textContent).toContain('네트워크');
  expect([...host.querySelectorAll('button')].find(button => button.textContent === '로그인')?.disabled).toBe(false);
});

test('소셜 로그인 중 다른 제공자를 누를 수 없고 취소 후 버튼을 복구한다', async () => {
  let cancel!: (error: Error) => void;
  mocks.google.mockImplementationOnce(() => new Promise((_, reject) => { cancel = reject; }));
  await render(createElement(Login)); await click('구글로 계속하기'); await click('카카오로 계속하기');
  expect(mocks.kakao).not.toHaveBeenCalled();
  await act(async () => { cancel(new Error('cancelled')); }); await tick();
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  expect([...host.querySelectorAll('button')].find(button => button.textContent === '카카오로 계속하기')?.disabled).toBe(false);
});

test('재설정 메일 중복 요청을 막고 계정 존재 여부를 단정하지 않는다', async () => {
  let finish!: () => void;
  mocks.reset.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await render(createElement(Login)); await click('이메일로 로그인'); await fill('이메일', 'a@example.test');
  await click('비밀번호를 잊으셨나요?'); await click('비밀번호를 잊으셨나요?');
  expect(mocks.reset).toHaveBeenCalledOnce();
  await act(async () => { finish(); }); await tick();
  expect(host.querySelector('[role=status]')?.textContent).toContain('가입된 이메일이면');
});

test('프로필 조회와 무관하게 확인된 복구 계정에 비밀번호 변경 폼을 제공한다', async () => {
  usePasswordRecoveryStore.getState().begin('a');
  await render(createElement(ResetPassword));
  expect(host.querySelector('form')).not.toBeNull();
  await fill('새 비밀번호', 'fake-password'); await fill('새 비밀번호 확인', 'fake-password');
  await submitTwice();
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith('fake-password', 'a');
});

test('일반 로그인 상태에서 재설정 주소만 열어서는 비밀번호 변경 폼이 열리지 않는다', async () => {
  mocks.state = { user: { id: 'b' }, isAuthenticated: true, sessionError: null };
  await render(createElement(ResetPassword));
  expect(host.querySelector('form')).toBeNull(); expect(mocks.update).not.toHaveBeenCalled();
});

test('비밀번호 변경 실패를 알리고 입력값과 재시도 경로를 유지한다', async () => {
  usePasswordRecoveryStore.getState().begin('a'); mocks.update.mockRejectedValueOnce(new Error('offline'));
  await render(createElement(ResetPassword)); await fill('새 비밀번호', 'fake-password'); await fill('새 비밀번호 확인', 'fake-password');
  await submitTwice();
  expect(host.querySelector('[role=alert]')?.textContent).toContain('변경에 실패');
  expect((host.querySelector('input') as HTMLInputElement).value).toBe('fake-password');
});

test('콜백의 프로필 오류는 재시도 버튼과 함께 바로 표시한다', async () => {
  mocks.state.sessionError = '프로필 연결 오류';
  await render(createElement(AuthCallback));
  expect(host.querySelector('[role=alert]')?.textContent).toContain('프로필 연결 오류');
  await click('로그인 정보 다시 불러오기'); expect(mocks.retry).toHaveBeenCalledOnce();
});
