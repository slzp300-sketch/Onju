import { beforeEach, expect, test, vi } from 'vitest';
const plugin = vi.hoisted(() => ({ getPending: vi.fn(), cancel: vi.fn(), schedule: vi.fn(), removeAllDeliveredNotifications: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/local-notifications', () => ({ LocalNotifications: plugin }));
import { syncNativeNotifications } from './nativeNotifications';
const spec = { key: 'habit-a', title: '물 마시기', body: '확인', hour: 9, minute: 0, weekdays: [2, 6] };
beforeEach(() => { vi.resetAllMocks(); plugin.getPending.mockResolvedValue({ notifications: [{ id: 99 }] }); });
test('이전 예약을 취소한 다음 지정 요일을 중복 없는 ID로 예약한다', async () => {
  await syncNativeNotifications([spec], () => true);
  expect(plugin.cancel).toHaveBeenCalledWith({ notifications: [{ id: 99 }] });
  expect(plugin.schedule.mock.calls[0][0].notifications.map((n: { id: number; schedule: unknown }) => [n.id, n.schedule])).toEqual([
    [1, { on: { hour: 9, minute: 0, second: 0, weekday: 2 }, allowWhileIdle: true }], [2, { on: { hour: 9, minute: 0, second: 0, weekday: 6 }, allowWhileIdle: true }],
  ]);
  expect(plugin.cancel.mock.invocationCallOrder[0]).toBeLessThan(plugin.schedule.mock.invocationCallOrder[0]);
});
test('취소 대기 중 계정이 바뀌면 이전 계정의 예약을 추가하지 않는다', async () => {
  await syncNativeNotifications([spec], () => false); expect(plugin.schedule).not.toHaveBeenCalled();
});
test('로그아웃 또는 알림 해제는 예약과 알림함을 정리한다', async () => {
  await syncNativeNotifications([], () => true);
  expect(plugin.removeAllDeliveredNotifications).toHaveBeenCalledOnce(); expect(plugin.schedule).not.toHaveBeenCalled();
});
