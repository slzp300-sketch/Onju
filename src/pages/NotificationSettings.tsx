import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell, BellOff } from 'lucide-react';
import { motion } from 'framer-motion';
import Card from '../components/ui/Card';
import { useNotificationStore } from '../store/notificationStore';

export default function NotificationSettings() {
  const navigate = useNavigate();
  const store = useNotificationStore();
  const [requesting, setRequesting] = useState(false);

  const canNotify = store.permission === 'granted';
  const denied = store.permission === 'denied';

  const requestPermission = async () => {
    setRequesting(true);
    const result = await Notification.requestPermission();
    store.setPermission(result);
    setRequesting(false);
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-lg font-bold text-gray-900">알림 설정</h1>
      </div>

      {/* 권한 상태 */}
      {!canNotify && (
        <Card className="mx-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 ${denied ? 'text-red-400' : 'text-indigo-500'}`}>
              {denied ? <BellOff size={20} /> : <Bell size={20} />}
            </div>
            <div className="flex-1">
              {denied ? (
                <>
                  <p className="text-sm font-semibold text-gray-900">알림이 차단되어 있어요</p>
                  <p className="text-xs text-gray-400 mt-1">브라우저 설정에서 이 사이트의 알림을 허용해 주세요.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-gray-900">알림 권한이 필요해요</p>
                  <p className="text-xs text-gray-400 mt-1">루틴 리마인드와 주간 리뷰 알림을 받으려면 허용해 주세요.</p>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={requestPermission}
                    disabled={requesting}
                    className="mt-3 px-4 py-2 bg-indigo-500 text-white text-sm font-medium rounded-xl disabled:opacity-60"
                  >
                    {requesting ? '요청 중…' : '알림 허용하기'}
                  </motion.button>
                </>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* 아침 알림 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">🌅 아침 알림</p>
            <p className="text-xs text-gray-400 mt-0.5">오늘의 루틴을 시작하도록 알려줘요</p>
          </div>
          <Toggle
            enabled={canNotify && store.morningEnabled}
            disabled={!canNotify}
            onChange={v => store.update({ morningEnabled: v })}
          />
        </div>
        {store.morningEnabled && canNotify && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">알림 시간</span>
            <input
              type="time"
              value={store.morningTime}
              onChange={e => store.update({ morningTime: e.target.value })}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        )}
      </Card>

      {/* 저녁 알림 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">🌙 저녁 리마인드</p>
            <p className="text-xs text-gray-400 mt-0.5">미완료 루틴이 있을 때 알려줘요</p>
          </div>
          <Toggle
            enabled={canNotify && store.eveningEnabled}
            disabled={!canNotify}
            onChange={v => store.update({ eveningEnabled: v })}
          />
        </div>
        {store.eveningEnabled && canNotify && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-gray-500">알림 시간</span>
            <input
              type="time"
              value={store.eveningTime}
              onChange={e => store.update({ eveningTime: e.target.value })}
              className="text-sm border border-gray-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
          </div>
        )}
      </Card>

      {/* 주간 리뷰 알림 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-gray-900">📋 주간 리뷰 알림</p>
            <p className="text-xs text-gray-400 mt-0.5">일요일에 주간 리뷰를 상기시켜줘요</p>
          </div>
          <Toggle
            enabled={canNotify && store.reviewEnabled}
            disabled={!canNotify}
            onChange={v => store.update({ reviewEnabled: v })}
          />
        </div>
      </Card>

      {canNotify && (
        <p className="text-center text-xs text-gray-300 px-4">
          알림은 앱이 열려 있는 동안 예약됩니다
        </p>
      )}
    </div>
  );
}

function Toggle({ enabled, disabled, onChange }: { enabled: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0 ${
        enabled ? 'bg-indigo-500' : 'bg-gray-200'
      } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <motion.span
        animate={{ x: enabled ? 20 : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
      />
    </button>
  );
}
