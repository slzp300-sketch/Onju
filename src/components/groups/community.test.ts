import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  userId: 'a', consent: vi.fn(), accept: vi.fn(), report: vi.fn(), block: vi.fn(), toast: vi.fn(),
}));
vi.mock('../../api/community', async importOriginal => ({
  ...await importOriginal<typeof import('../../api/community')>(),
  fetchCommunityConsent: mocks.consent, acceptCommunityRules: mocks.accept,
  reportContent: mocks.report, setUserBlocked: mocks.block,
}));
vi.mock('../../store/authStore', () => ({ useAuthStore: Object.assign(
  (selector: (state: { user: { id: string } }) => unknown) => selector({ user: { id: mocks.userId } }),
  { getState: () => ({ user: { id: mocks.userId } }) },
) }));
vi.mock('../../store/toastStore', () => ({ toast: { success: mocks.toast } }));
import CommunityGate from './CommunityGate';
import SafetyActions from './SafetyActions';

let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const target = { type: 'proof' as const, id: 'photo', groupId: 'group', userId: 'b' };
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
async function render(component: React.ReactNode) {
  await act(async () => { root.render(createElement(QueryClientProvider, { client }, component)); });
  await tick();
}
async function click(text: string) {
  const button = [...host.querySelectorAll('button')].find(el => el.textContent === text);
  expect(button).toBeDefined();
  await act(async () => { button!.click(); });
  await tick();
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.resetAllMocks();
  mocks.userId = 'a';
  mocks.consent.mockResolvedValue(false);
  mocks.accept.mockResolvedValue(undefined);
  mocks.report.mockResolvedValue(undefined);
  mocks.block.mockResolvedValue(undefined);
  host = document.createElement('div'); document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); });

test('명시적인 동의와 서버 저장이 끝나기 전에는 소모임 화면을 열지 않는다', async () => {
  await render(createElement(CommunityGate, { children: createElement('p', null, '소모임 화면') }));
  expect(host.textContent).not.toContain('소모임 화면');
  await click('동의하고 소모임 이용하기');
  expect(mocks.accept).not.toHaveBeenCalled();
  await act(async () => { (host.querySelector('input') as HTMLInputElement).click(); });
  await click('동의하고 소모임 이용하기');
  expect(mocks.accept).toHaveBeenCalledWith('a');
  expect(host.textContent).toContain('소모임 화면');
});

test('동의 저장 실패를 알리고 화면을 차단한 채 재시도할 수 있다', async () => {
  mocks.accept.mockRejectedValueOnce(new Error('offline'));
  await render(createElement(CommunityGate, { children: '소모임 화면' }));
  await act(async () => { (host.querySelector('input') as HTMLInputElement).click(); });
  await click('동의하고 소모임 이용하기');
  expect(host.querySelector('[role=alert]')?.textContent).toContain('다시 시도');
  expect(host.textContent).not.toContain('소모임 화면');
  await click('동의하고 소모임 이용하기');
  expect(host.textContent).toContain('소모임 화면');
});

test('신고 실패를 접수 성공으로 표시하지 않으며 사유를 함께 전송한다', async () => {
  mocks.report.mockRejectedValueOnce(new Error('offline'));
  await render(createElement(SafetyActions, { target }));
  await click('신고·차단');
  await click('신고 접수하기');
  expect(mocks.toast).not.toHaveBeenCalled();
  expect(host.querySelector('[role=alert]')).not.toBeNull();
  await click('신고 접수하기');
  expect(mocks.report).toHaveBeenCalledWith('a', target, 'harassment');
  expect(mocks.toast).toHaveBeenCalledOnce();
});

test('차단 요청이 끝나기 전에 계정을 바꾸면 새 계정 캐시를 수정하지 않는다', async () => {
  let finish!: () => void;
  mocks.block.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  await render(createElement(SafetyActions, { target }));
  await click('신고·차단');
  await click('이 사용자 차단하기');
  mocks.userId = 'c';
  await act(async () => { finish(); });
  await tick();
  expect(client.getQueryData(['blocked-users', 'a'])).toBeUndefined();
  expect(client.getQueryData(['blocked-users', 'c'])).toBeUndefined();
  expect(mocks.toast).not.toHaveBeenCalled();
});

test('본인 콘텐츠에는 신고·차단 버튼을 표시하지 않는다', async () => {
  await render(createElement(SafetyActions, { target: { ...target, userId: 'a' } }));
  expect(host.querySelector('button')).toBeNull();
});
