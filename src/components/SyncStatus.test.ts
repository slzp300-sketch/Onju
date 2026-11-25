import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ count: 0, volatile: 0, conflicts: 0, online: true, flush: vi.fn(), pending: vi.fn() }));
vi.mock('../store/authStore', () => ({ useAuthStore: (select: (state: { user: { id: string } }) => unknown) => select({ user: { id: 'a' } }) }));
vi.mock('../lib/sync/outbox', () => ({
  practiceSyncEntries: () => [], planSyncEntries: () => [], recordSyncEntries: () => [],
  goalSyncEntries: () => Array.from({length:mocks.conflicts},(_,i)=>({goalId:String(i)})),
  pendingCount: (id: string) => { mocks.pending(id); return mocks.count; }, unpersistedCount: () => mocks.volatile, flush: mocks.flush,
}));
vi.mock('../store/toastStore', () => ({ toast: { error: vi.fn() } }));
import SyncStatus from './SyncStatus';
let root: Root, host: HTMLDivElement;
let onlineDescriptor: PropertyDescriptor | undefined;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.resetAllMocks();
  mocks.count = 0; mocks.volatile = 0; mocks.conflicts = 0; mocks.online = true; mocks.flush.mockResolvedValue(undefined);
  onlineDescriptor = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => mocks.online });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove();
  if (onlineDescriptor) Object.defineProperty(navigator, 'onLine', onlineDescriptor);
  else Reflect.deleteProperty(navigator, 'onLine');
});
test('오프라인 보관 개수를 현재 계정 기준으로 보여주고 완료 후 숨긴다', async () => {
  mocks.online = false; mocks.count = 2;
  await act(async () => { root.render(createElement(SyncStatus)); });
  expect(host.textContent).toContain('변경 2개를 기기에 보관'); expect(mocks.pending).toHaveBeenCalledWith('a');
  mocks.online = true; mocks.count = 0;
  await act(async () => { window.dispatchEvent(new Event('onju-outbox-changed')); });
  expect(host.textContent).toBe('');
});
test('기기 저장 실패를 저장 완료로 표시하지 않는다', async () => {
  mocks.count = 1; mocks.volatile = 1;
  await act(async () => { root.render(createElement(SyncStatus)); });
  expect(host.textContent).toContain('기기 보관에 실패'); expect(host.textContent).not.toContain('보관했어요');
});
test('온라인 상태의 전송 대기 작업을 수동으로 다시 시도할 수 있다', async () => {
  mocks.count = 1;
  await act(async () => { root.render(createElement(SyncStatus)); });
  await act(async () => { host.querySelector('button')!.click(); });
  expect(mocks.flush).toHaveBeenCalledOnce();
});

test('충돌은 전송 완료로 숨기지 않고 복구 화면으로 안내한다',async()=>{
  mocks.conflicts=1;await act(async()=>root.render(createElement(SyncStatus)));
  expect(host.textContent).toContain('목표 1개 확인 필요');expect(host.querySelector('a')?.getAttribute('href')).toBe('/goals/conflicts');
});
