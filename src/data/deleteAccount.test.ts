import { beforeEach, expect, test, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ list: vi.fn(), remove: vi.fn(), rpc: vi.fn(), client: vi.fn() }));
vi.mock('../lib/supabase', () => ({ supabaseForSession: mocks.client }));
import { deleteAccountData } from './deleteAccount';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockReturnValue({ storage: { from: () => ({ list: mocks.list, remove: mocks.remove }) }, rpc: mocks.rpc });
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.remove.mockImplementation(async paths => ({ data: paths.map((name: string) => ({ name })), error: null }));
  mocks.rpc.mockResolvedValue({ error: null });
});

test('100개가 넘는 사진과 DB에서 참조하지 않는 사진도 빠짐없이 먼저 삭제한다', async () => {
  mocks.list.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, i) => ({ id: String(i), name: `${i}.jpg` })), error: null });
  mocks.list.mockResolvedValueOnce({ data: [{ id: 'last', name: 'orphan.jpg' }], error: null });
  await deleteAccountData('user-a', 'token-a');
  expect(mocks.client).toHaveBeenCalledExactlyOnceWith('token-a');
  expect(mocks.list).toHaveBeenNthCalledWith(2, 'user-a', { limit: 100, offset: 0 });
  expect(mocks.remove.mock.calls[0][0]).toHaveLength(100);
  expect(mocks.remove).toHaveBeenLastCalledWith(['user-a/orphan.jpg']);
  expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith('delete_account');
  expect(mocks.rpc.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.remove.mock.invocationCallOrder[1]);
});

test.each(['list', 'remove'] as const)('사진 %s 실패 시 계정을 삭제하지 않고 재시도를 허용한다', async operation => {
  mocks.list.mockResolvedValueOnce({ data: [{ id: 'photo', name: 'photo.jpg' }], error: null });
  mocks[operation].mockResolvedValueOnce({ data: null, error: new Error('offline') });
  await expect(deleteAccountData('user-a', 'token-a')).rejects.toThrow('offline');
  expect(mocks.rpc).not.toHaveBeenCalled();
});

test('삭제 권한이 없어 성공 응답이 빈 목록이면 무한 반복하거나 계정을 삭제하지 않는다', async () => {
  mocks.list.mockResolvedValueOnce({ data: [{ id: 'photo', name: 'photo.jpg' }], error: null });
  mocks.remove.mockResolvedValueOnce({ data: [], error: null });
  await expect(deleteAccountData('user-a', 'token-a')).rejects.toThrow('모두 삭제');
  expect(mocks.list).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

test('사진이 없어도 RPC 실패를 성공으로 처리하지 않는다', async () => {
  mocks.rpc.mockResolvedValueOnce({ error: new Error('database unavailable') });
  await expect(deleteAccountData('user-a', 'token-a')).rejects.toThrow('database unavailable');
});
