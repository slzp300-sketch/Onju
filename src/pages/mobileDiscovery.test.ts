import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), permission: vi.fn(), error: vi.fn() }));
vi.mock('../store/authStore', () => ({ useAuthStore: (selector: (s: unknown) => unknown) => selector({ user: null }) }));
vi.mock('../lib/sync/outbox', () => ({ heldMembershipRequests: () => [], cancelHeldMembershipRequests: vi.fn() }));
vi.mock('../api/groups', () => ({ fetchGroups: mocks.fetch }));
vi.mock('../store/groupStore', () => ({ useGroupStore: () => ({ groups: [], myGroupIds: [], membershipStatus: {}, statusChanges: {}, refreshMembership: vi.fn() }) }));
vi.mock('../hooks/useBlockedUsers', () => ({ useBlockedUsers: () => ({ data: [] }) }));
vi.mock('../lib/notifyPermission', () => ({ requestNotifPermission: mocks.permission }));
vi.mock('../lib/webPush', () => ({ isWebPushConfigured: () => false }));
vi.mock('../store/toastStore', () => ({ toast: { error: mocks.error } }));
import Groups from './Groups';
import NotificationSettings from './NotificationSettings';
import { useNotificationStore } from '../store/notificationStore';
import type { SmallGroup } from '../types';
let root: Root, host: HTMLDivElement, client: QueryClient;
const tick = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
async function render(component: React.ReactNode) {
  await act(async () => root.render(h(QueryClientProvider, { client }, h(MemoryRouter, null, component)))); await tick();
}
async function click(label: string) {
  const button = [...host.querySelectorAll('button')].find(b => b.textContent === label);
  expect(button).toBeDefined(); await act(async () => button!.click()); await tick();
}
const group = (id: string): SmallGroup => ({ id, title: `산책 모임 ${id}`, goal: '하루 10분 걷기', creatorId: 'other', startDate: '2026-10-27', endDate: '2099-12-31', status: 'recruiting', maxMembers: 10, currentMemberCount: 1, isPublic: true, createdAt: '' });
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  useNotificationStore.setState({ permission: 'default' });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); });

test('탐색 실패와 빈 목록을 구분하고 재시도로 회복한다', async () => {
  mocks.fetch.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ groups: [group('1')], total: 1, nextPage: null, hasNextPage: false });
  await render(h(Groups)); await click('탐색');
  expect(host.textContent).toContain('소모임을 불러오지 못했어요');
  expect(host.textContent).not.toContain('공개 소모임이 없어요');
  await click('다시 불러오기'); expect(host.textContent).toContain('산책 모임 1');
});
test('다음 목록 요청이 실패해도 첫 페이지를 보존하고 다시 불러온다', async () => {
  mocks.fetch.mockResolvedValueOnce({ groups: [group('1')], total: 2, nextPage: 2, hasNextPage: true })
    .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ groups: [group('2')], total: 2, nextPage: null, hasNextPage: false });
  await render(h(Groups)); await click('탐색'); await click('소모임 더 보기');
  expect(host.textContent).toContain('산책 모임 1'); expect(host.querySelector('[role=alert]')).not.toBeNull();
  await click('소모임 더 보기'); expect(mocks.fetch).toHaveBeenLastCalledWith({ status: 'recruiting', page: 2 });
  expect(host.textContent).toContain('산책 모임 2'); expect(host.textContent).not.toContain('소모임 더 보기');
});
test('알림 권한 요청이 예외로 실패해도 다시 누를 수 있다', async () => {
  mocks.permission.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce('granted');
  await render(h(NotificationSettings)); await click('알림 허용하기');
  expect(mocks.error).toHaveBeenCalledOnce(); await click('알림 허용하기');
  expect(useNotificationStore.getState().permission).toBe('granted');
  expect(host.querySelectorAll('[role=switch]')).toHaveLength(3);
  expect(new Set([...host.querySelectorAll('[role=switch]')].map(s => s.getAttribute('aria-label'))).size).toBe(3);
});
