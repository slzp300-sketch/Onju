import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Session } from '@supabase/supabase-js';
const fake = vi.hoisted(() => ({ native: true, schedule: vi.fn(), web: vi.fn(), server: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => fake.native } }));
vi.mock('./nativeNotifications', () => ({ syncNativeNotifications: fake.schedule }));
vi.mock('./webPush', () => ({ isWebPushConfigured: () => true, reconcileWebPush: fake.web }));
vi.mock('./reminderSchedule', () => ({ syncReminderSchedule: fake.server }));
import { setNotificationSession, updateNotificationSchedule } from './notificationSync';
const spec = { key: 'morning', title: '알림', body: '확인', hour: 8, minute: 0 };
const session = (id: string, token = id) => ({ user: { id }, access_token: token }) as Session;
const settle = async () => { for (let i=0; i<12; i++) await Promise.resolve(); };
beforeEach(async () => { fake.native = true; vi.resetAllMocks(); setNotificationSession(null); await settle(); vi.clearAllMocks(); });
afterEach(async () => { setNotificationSession(null); await settle(); });
test('계정 전환은 즉시 이전 예약을 무효화하며 늦게 온 A 화면 요청을 무시한다', async () => {
  setNotificationSession(session('A')); await settle(); updateNotificationSchedule('A', [spec], true); await settle();
  setNotificationSession(session('B')); await settle();
  updateNotificationSchedule('A', [{ ...spec, title: '잘못된 계정' }], true); await settle();
  expect(fake.schedule).toHaveBeenLastCalledWith([], expect.any(Function));
  updateNotificationSchedule('B', [{ ...spec, title: 'B' }], true); await settle();
  expect(fake.schedule).toHaveBeenLastCalledWith([expect.objectContaining({ title: 'B' })], expect.any(Function));
});
test('데이터 복원 전 서버 예약은 지우지 않고 권한 거절은 이 기기 구독만 해제한다', async () => {
  fake.native = false; setNotificationSession(session('A')); await settle(); expect(fake.server).not.toHaveBeenCalled();
  updateNotificationSchedule('A', [spec], false); await settle();
  expect(fake.web).toHaveBeenLastCalledWith('A','A',false,expect.any(Function));
  expect(fake.server).toHaveBeenLastCalledWith([spec],'A');
});
test('전송 중 토큰이 갱신되면 후속 요청은 새 토큰을 쓴다', async () => {
  fake.native = false; setNotificationSession(session('A','old')); await settle();
  let release!: () => void;
  fake.server.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  updateNotificationSchedule('A', [spec], true); await settle();
  setNotificationSession(session('A','fresh')); release(); await settle();
  expect(fake.server).toHaveBeenLastCalledWith([spec],'fresh');
});
