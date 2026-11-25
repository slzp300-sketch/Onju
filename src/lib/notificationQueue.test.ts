import { afterEach, expect, test, vi } from 'vitest';
import { createNotificationQueue } from './notificationQueue';

afterEach(() => vi.useRealTimers());
test('진행 중 변경·로그아웃·다른 계정 요청은 겹치지 않고 최신 요청만 적용한다', async () => {
  const calls: string[] = [];
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const queue = createNotificationQueue<string>(async (owner, current) => {
    calls.push(`start:${owner}`);
    if (owner === 'A') await pending;
    if (current()) calls.push(`apply:${owner}`);
  }, vi.fn());
  queue.update('A'); queue.update('logout'); queue.update('B');
  expect(calls).toEqual(['start:A']);
  release(); await pending; await Promise.resolve();
  expect(calls).toEqual(['start:A', 'start:B', 'apply:B']);
});
test('실패를 알리고 자동 재시도하며 성공 후 추가 전송하지 않는다', async () => {
  vi.useFakeTimers();
  const run = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const status = vi.fn(); const queue = createNotificationQueue(run, status);
  queue.update('A'); await Promise.resolve();
  expect(status).toHaveBeenLastCalledWith('error');
  await vi.advanceTimersByTimeAsync(2000);
  expect(status).toHaveBeenLastCalledWith('saved');
  await vi.advanceTimersByTimeAsync(120_000); expect(run).toHaveBeenCalledTimes(2);
});
test('실패 뒤 변경하면 재시도는 이전 설정 대신 최신 설정을 쓴다', async () => {
  vi.useFakeTimers();
  const run = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const queue = createNotificationQueue(run, vi.fn());
  queue.update('old'); await Promise.resolve(); queue.update('new'); await Promise.resolve();
  await vi.advanceTimersByTimeAsync(5000);
  expect(run.mock.calls.map(c => c[0])).toEqual(['old', 'new']);
});
