import { beforeEach, afterEach, expect, test, vi } from 'vitest';
const fake = vi.hoisted(() => ({ write: vi.fn(), client: vi.fn() }));
vi.mock('./supabase', () => ({ supabaseForSession: fake.client }));
import { reconcileWebPush } from './webPush';
const unsubscribe = vi.fn(), subscribe = vi.fn(), getSubscription = vi.fn();
const subscription = { endpoint: 'https://push.example.test/device', unsubscribe, toJSON: () => ({ keys: { p256dh: 'public', auth: 'auth' } }) };
beforeEach(() => {
  vi.clearAllMocks(); localStorage.clear();
  vi.stubGlobal('PushManager', class {});
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: async () => ({ active: {}, pushManager: { getSubscription, subscribe } }) } });
  unsubscribe.mockResolvedValue(true); subscribe.mockResolvedValue(subscription); getSubscription.mockResolvedValue(subscription);
  fake.client.mockReturnValue({ from: () => ({ upsert: (...args: unknown[]) => { fake.write(...args); return { abortSignal: async () => ({ error: null }) }; } }) });
});
afterEach(() => { vi.unstubAllGlobals(); Reflect.deleteProperty(navigator, 'serviceWorker'); });
test('로그아웃은 네트워크 호출 없이 이 기기 구독부터 해제한다', async () => {
  localStorage.setItem('onju-push-owner', 'A');
  await reconcileWebPush(null, null, null, () => true);
  expect(unsubscribe).toHaveBeenCalledOnce(); expect(fake.write).not.toHaveBeenCalled();
  expect(localStorage.getItem('onju-push-owner')).toBeNull();
});
test('복원 중 같은 계정 구독은 보존하고 서버 쓰기를 하지 않는다', async () => {
  localStorage.setItem('onju-push-owner', 'A');
  await reconcileWebPush('A', 'token-A', null, () => true);
  expect(unsubscribe).not.toHaveBeenCalled(); expect(fake.write).not.toHaveBeenCalled();
});
test('소유자가 바뀐 구독은 해제하고 중단된 이전 요청은 새 구독을 만들지 않는다', async () => {
  localStorage.setItem('onju-push-owner', 'A');
  await reconcileWebPush('B', 'token-B', true, () => false);
  expect(unsubscribe).toHaveBeenCalledOnce(); expect(subscribe).not.toHaveBeenCalled();
});
test('서버 쓰기는 전달받은 계정 토큰에 고정된다', async () => {
  localStorage.setItem('onju-push-owner', 'A');
  await reconcileWebPush('A', 'token-A', true, () => true);
  expect(fake.client).toHaveBeenCalledWith('token-A');
  expect(fake.write).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'A' }), { onConflict: 'endpoint' });
});
