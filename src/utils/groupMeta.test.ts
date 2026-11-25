import { afterEach, expect, test, vi } from 'vitest';
import { effectiveStatus } from './groupMeta';
afterEach(() => vi.useRealTimers());
test('소모임 종료일은 서버와 같은 한국 날짜로 당일 전체를 포함한다', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-27T23:59:59+09:00'));
  expect(effectiveStatus({status:'recruiting',endDate:'2026-10-27'})).toBe('recruiting');
  expect(effectiveStatus({status:'completed',endDate:'2026-10-28'})).toBe('completed');
  vi.setSystemTime(new Date('2026-10-28T00:00:00+09:00'));
  expect(effectiveStatus({status:'active',endDate:'2026-10-27'})).toBe('completed');
});
