import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { scheduleBrowserReminders } from './browserReminders';
import type { ReminderSpec } from './reminderSpecs';
const reminder: ReminderSpec = { key: 'habit-a', title: '물 마시기', body: '기록 확인', hour: 9, minute: 0 };
const cleanups: Array<() => void> = [];
beforeEach(() => { localStorage.clear(); vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 27, 8, 59)); });
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.useRealTimers(); });
function schedule(owner: string, specs = [reminder]) {
  const delivered = vi.fn(); cleanups.push(scheduleBrowserReminders(owner, specs, delivered, vi.fn())); return delivered;
}
test('이미 지난 알림을 실행하지 않고 요일 규칙을 지킨다', async () => {
  const delivered = schedule('A', [{ ...reminder, hour: 8 }, { ...reminder, weekdays: [1] }]);
  await vi.advanceTimersByTimeAsync(120_000); expect(delivered).not.toHaveBeenCalled();
});
test('예약 시각에 한 번만 보내고 중복 스케줄에도 같은 계정·날짜를 기억한다', async () => {
  const first = schedule('A'), second = schedule('A');
  await vi.advanceTimersByTimeAsync(60_000);
  expect(first.mock.calls.length + second.mock.calls.length).toBe(1);
});
test('다른 계정은 이전 계정의 발송 기록을 공유하지 않는다', async () => {
  const a = schedule('A'), b = schedule('B'); await vi.advanceTimersByTimeAsync(60_000);
  expect(a).toHaveBeenCalledOnce(); expect(b).toHaveBeenCalledOnce();
});
test('자정에 다음 날의 요일로 다시 예약하고 해제 후에는 보내지 않는다', async () => {
  vi.setSystemTime(new Date(2026, 9, 27, 23, 59));
  const delivered = schedule('A', [{ ...reminder, hour: 0, minute: 1, weekdays: [4] }]);
  await vi.advanceTimersByTimeAsync(120_000); expect(delivered).toHaveBeenCalledOnce();
  cleanups.splice(0).forEach(fn => fn()); await vi.advanceTimersByTimeAsync(86400_000);
  expect(delivered).toHaveBeenCalledOnce();
});
test('절전 복귀로 크게 늦어진 알림을 몰아서 보내지 않는다', async () => {
  const delivered = schedule('A'); vi.setSystemTime(new Date(2026, 9, 27, 18));
  await vi.advanceTimersByTimeAsync(60_000); expect(delivered).not.toHaveBeenCalled();
});
test('00:00 정각 알림도 자정에 누락하지 않는다', async () => {
  vi.setSystemTime(new Date(2026, 9, 27, 23, 59, 59));
  const delivered = schedule('A', [{ ...reminder, hour: 0, minute: 0 }]);
  await vi.advanceTimersByTimeAsync(1001); expect(delivered).toHaveBeenCalledOnce();
});
