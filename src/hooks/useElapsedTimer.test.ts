import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useElapsedTimer } from './useElapsedTimer';

let root: Root, host: HTMLDivElement;
const complete = vi.fn();
const stopped = vi.fn();
function Harness({ running = true, step = 0 }: { running?: boolean; step?: number }) {
  const timer = useElapsedTimer(10, running, complete, step);
  return createElement('button', { onClick: () => stopped(timer.stop()) }, timer.elapsed);
}
async function render(running = true, step = 0) {
  await act(async () => root.render(createElement(StrictMode, null, createElement(Harness, { running, step }))));
}
const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-27T01:00:00Z')); complete.mockClear();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });

test('StrictMode에서 완료는 한 번만 호출하고 다음 단계의 시간을 새로 센다', async () => {
  await render(); await advance(10_000); await advance(5_000);
  expect(complete).toHaveBeenCalledExactlyOnceWith(10);
  await render(true, 1); expect(host.textContent).toBe('0');
  await advance(2_000); expect(host.textContent).toBe('2');
});
test('일시정지한 시간을 제외하고 재개한다', async () => {
  await render(); await advance(3_000); await render(false); await advance(60_000);
  expect(host.textContent).toBe('3'); expect(complete).not.toHaveBeenCalled();
  await render(); await advance(2_000);
  await act(async () => host.querySelector('button')!.click());
  expect(stopped).toHaveBeenLastCalledWith(5); await advance(20_000); expect(complete).not.toHaveBeenCalled();
});
test('백그라운드에서 틱이 멈추어도 화면 복귀 시 경과 시간을 복원한다', async () => {
  await render();
  await act(async () => { vi.setSystemTime(Date.now() + 30_000); document.dispatchEvent(new Event('visibilitychange')); });
  expect(host.textContent).toBe('10'); expect(complete).toHaveBeenCalledExactlyOnceWith(10);
});
test('화면을 떠나면 완료 콜백과 타이머가 해제된다', async () => {
  await render(); await act(async () => root.render(null)); await advance(20_000);
  expect(complete).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
