import { retryNotificationSync, useNotificationSync } from '../lib/notificationSync';

export default function NotificationSyncStatus() {
  const status = useNotificationSync(s => s.status);
  if (status !== 'error') return null;
  return <div role="status" className="mx-4 my-2 rounded-xl border border-line bg-surface px-4 py-3 text-caption1 text-label">
    <p>알림 예약을 반영하지 못했어요. 이전 예약이 남아 있을 수 있어요. 연결 후 자동으로 다시 시도해요.</p>
    <button className="min-h-11 font-bold text-primary" onClick={retryNotificationSync}>알림 다시 확인</button>
  </div>;
}
