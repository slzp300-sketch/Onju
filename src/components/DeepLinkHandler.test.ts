import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  event: null as ((event: { url: string }) => void) | null,
  launch: vi.fn(), complete: vi.fn(), navigate: vi.fn(), remove: vi.fn(), recoveryId: null as string | null,
}));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/app', () => ({ App: {
  addListener: (_: string, callback: typeof mocks.event) => { mocks.event = callback; return Promise.resolve({ remove: mocks.remove }); },
  getLaunchUrl: mocks.launch,
} }));
vi.mock('react-router-dom', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('../lib/nativeAuthLinks', () => ({
  nativeAuthLinkKind: (url: string) => url.startsWith('onju://reset-password?') ? 'recovery' : url.startsWith('onju://oauth?') ? 'oauth' : null,
  completeNativeAuthLink: mocks.complete,
}));
vi.mock('../store/passwordRecoveryStore', () => ({ usePasswordRecoveryStore: { getState: () => ({ userId: mocks.recoveryId }) } }));
vi.mock('../store/toastStore', () => ({ toast: { error: vi.fn() } }));
import DeepLinkHandler from './DeepLinkHandler';
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.resetAllMocks();
  mocks.recoveryId = null; mocks.launch.mockResolvedValue(undefined); mocks.complete.mockResolvedValue(undefined);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
const mount = () => act(async () => { root.render(createElement(DeepLinkHandler)); });

test('앱이 꺼져 있을 때 전달한 OAuth URL도 콜백 화면으로 연결한다', async () => {
  mocks.launch.mockResolvedValue({ url: 'onju://oauth?code=cold' }); await mount();
  expect(mocks.complete).toHaveBeenCalledExactlyOnceWith('onju://oauth?code=cold');
  expect(mocks.navigate).toHaveBeenCalledWith('/auth/callback', { replace: true });
});

test('실행 중 복구 메일을 열면 복구 화면으로 보내고 카카오 처리와 중복하지 않는다', async () => {
  await mount();
  await act(async () => { mocks.event!({ url: 'onju://oauth?code=warm' }); });
  expect(mocks.complete).not.toHaveBeenCalled();
  mocks.recoveryId = 'a';
  await act(async () => { mocks.event!({ url: 'onju://reset-password?code=warm' }); });
  expect(mocks.complete).toHaveBeenCalledExactlyOnceWith('onju://reset-password?code=warm');
  expect(mocks.navigate).toHaveBeenLastCalledWith('/reset-password', { replace: true });
});

test('콜드 스타트에서도 위젯 타이머 링크를 라우팅한다', async () => {
  mocks.launch.mockResolvedValue({ url: 'onju://timer/routine/fixture-id' }); await mount();
  expect(mocks.navigate).toHaveBeenCalledWith('/routine-timer/fixture-id');
});
