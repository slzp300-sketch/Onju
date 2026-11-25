import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ fetchReviews: vi.fn(async (userId: string) => [{ id: `${userId}-review` }]) }));
vi.mock('../api/reviews', () => ({ fetchReviews: mocks.fetchReviews }));
vi.mock('./supabase', () => ({ supabase: { auth: { onAuthStateChange: vi.fn() } } }));
import { queryClient } from './queryClient';
import { useReviews } from '../hooks/useReviews';
import { useAuthStore } from '../store/authStore';
import { clearStores } from '../utils/storeManager';

let root: Root;
let host: HTMLDivElement;
const user = (id: string) => ({ id, name: id, email: `${id}@example.test`, weeklyGoalSlots: 3 });
function View() {
  const { data = [] } = useReviews();
  return createElement('div', null, data.map(review => review.id).join(','));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  queryClient.clear();
  mocks.fetchReviews.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  queryClient.clear();
  vi.unstubAllGlobals();
});
async function settle() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}

test('계정 변경 직후 기존 리뷰를 보여주지 않고 새 사용자 키로 조회한다', async () => {
  useAuthStore.setState({ user: user('a') });
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(View))));
  await settle();
  expect(host.textContent).toBe('a-review');
  await act(async () => useAuthStore.setState({ user: user('b') }));
  expect(host.textContent).not.toContain('a-review');
  await settle();
  expect(host.textContent).toBe('b-review');
  expect(mocks.fetchReviews).toHaveBeenCalledWith('b', expect.any(AbortSignal));
});

test('로그아웃 상태에서는 리뷰를 조회하지 않는다', async () => {
  useAuthStore.setState({ user: null });
  await act(async () => root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(View))));
  await settle();
  expect(mocks.fetchReviews).not.toHaveBeenCalled();
  expect(host.textContent).toBe('');
});

test('계정 데이터 정리는 캐시와 진행 중인 조회를 취소하고 늦은 응답도 남기지 않는다', async () => {
  queryClient.setQueryData(['reviews', 'a'], [{ id: 'private' }]);
  let finish!: () => void;
  let signal!: AbortSignal;
  const pending = queryClient.fetchQuery({
    queryKey: ['review', 'a', 40, 2026],
    queryFn: async context => {
      signal = context.signal;
      await new Promise<void>(resolve => { finish = resolve; });
      return { id: 'late-private' };
    },
  }).catch(() => null);
  clearStores();
  expect(signal.aborted).toBe(true);
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  finish();
  await pending;
  expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
});
