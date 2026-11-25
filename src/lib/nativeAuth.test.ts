import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  url: null as ((event: { url: string }) => Promise<void>) | null,
  finished: null as (() => void) | null,
  removeUrl: vi.fn(), removeFinished: vi.fn(), open: vi.fn(), close: vi.fn(), exchange: vi.fn(),
}));
vi.mock('@capacitor/app', () => ({ App: { addListener: (_: string, callback: typeof mocks.url) => {
  mocks.url = callback; return Promise.resolve({ remove: mocks.removeUrl });
} } }));
vi.mock('@capacitor/browser', () => ({ Browser: {
  open: mocks.open, close: mocks.close,
  addListener: (_: string, callback: typeof mocks.finished) => { mocks.finished = callback; return Promise.resolve({ remove: mocks.removeFinished }); },
} }));
vi.mock('@capgo/capacitor-social-login', () => ({ SocialLogin: {} }));
vi.mock('./supabase', () => ({ supabase: { auth: { exchangeCodeForSession: mocks.exchange } } }));
import { kakaoNativeLogin } from './nativeAuth';

beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  mocks.open.mockResolvedValue(undefined); mocks.close.mockResolvedValue(undefined);
  mocks.exchange.mockResolvedValue({ error: null });
});
afterEach(() => { vi.useRealTimers(); });

test('정확한 콜백 주소만 허용하고 중복 이벤트로 세션을 두 번 교환하지 않는다', async () => {
  const pending = kakaoNativeLogin('https://example.test/authorize');
  await vi.advanceTimersByTimeAsync(0);
  for (const url of ['onju://oauth.evil?code=wrong', 'onju://oauth/other?code=wrong', 'onju://user@oauth?code=wrong', 'invalid']) await mocks.url!({ url });
  expect(mocks.exchange).not.toHaveBeenCalled();
  await Promise.all([mocks.url!({ url: 'onju://oauth?code=valid' }), mocks.url!({ url: 'onju://oauth?code=duplicate' })]);
  await pending;
  expect(mocks.exchange).toHaveBeenCalledExactlyOnceWith('valid');
  expect(mocks.removeUrl).toHaveBeenCalledOnce();
  expect(mocks.removeFinished).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test('로그인 창을 닫으면 취소로 끝나고 리스너와 타이머를 정리한다', async () => {
  const pending = kakaoNativeLogin('https://example.test/authorize');
  const result = expect(pending).rejects.toThrow('취소');
  await vi.advanceTimersByTimeAsync(0);
  mocks.finished!();
  await vi.advanceTimersByTimeAsync(1000); await result;
  await vi.advanceTimersByTimeAsync(0);
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.removeUrl).toHaveBeenCalledOnce();
  expect(mocks.removeFinished).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
});

test('콜백 처리 중 프로그램이 브라우저를 닫은 이벤트는 취소로 간주하지 않는다', async () => {
  mocks.close.mockImplementation(async () => { mocks.finished!(); });
  const pending = kakaoNativeLogin('https://example.test/authorize');
  await vi.advanceTimersByTimeAsync(0);
  await mocks.url!({ url: 'onju://oauth?code=valid' });
  await expect(pending).resolves.toBeUndefined();
});

test('브라우저 종료 이벤트가 딥링크보다 먼저 도착해도 정상 로그인을 취소하지 않는다', async () => {
  const pending = kakaoNativeLogin('https://example.test/authorize');
  await vi.advanceTimersByTimeAsync(0);
  mocks.finished!();
  await vi.advanceTimersByTimeAsync(500);
  await mocks.url!({ url: 'onju://oauth?code=valid' });
  await expect(pending).resolves.toBeUndefined();
  expect(vi.getTimerCount()).toBe(0);
});

test('브라우저 실행 실패와 인증 거절은 실패로 끝난다', async () => {
  mocks.open.mockRejectedValueOnce(new Error('cannot open'));
  await expect(kakaoNativeLogin('https://example.test/authorize')).rejects.toThrow('cannot open');
  const pending = kakaoNativeLogin('https://example.test/authorize');
  const result = expect(pending).rejects.toThrow('거절');
  await vi.advanceTimersByTimeAsync(0);
  await mocks.url!({ url: 'onju://oauth?error=access_denied' }); await result;
  expect(mocks.exchange).not.toHaveBeenCalled();
});

test('콜백이 오지 않으면 시간 초과로 끝나고 뒤늦은 콜백을 무시한다', async () => {
  const pending = kakaoNativeLogin('https://example.test/authorize');
  const result = expect(pending).rejects.toThrow('시간이 초과');
  await vi.advanceTimersByTimeAsync(120_000); await result;
  await mocks.url!({ url: 'onju://oauth?code=late' });
  expect(mocks.exchange).not.toHaveBeenCalled();
  expect(mocks.removeUrl).toHaveBeenCalledOnce();
});
