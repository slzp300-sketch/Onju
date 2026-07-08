import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Bell, BellOff, Sunrise, Moon, ClipboardList } from 'lucide-react';
import { motion } from 'framer-motion';
import { Capacitor } from '@capacitor/core';
import Card from '../components/ui/Card';
import { useNotificationStore } from '../store/notificationStore';
import { requestNotifPermission } from '../lib/notifyPermission';

export default function NotificationSettings() {
  const navigate = useNavigate();
  const store = useNotificationStore();
  const [requesting, setRequesting] = useState(false);
  const isNative = Capacitor.isNativePlatform();

  const canNotify = store.permission === 'granted';
  const denied = store.permission === 'denied';

  const requestPermission = async () => {
    setRequesting(true);
    const result = await requestNotifPermission();
    store.setPermission(result);
    setRequesting(false);
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-label-alt hover:text-label transition-colors">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-heading2 font-bold text-label-strong font-brand">알림 설정</h1>
      </div>

      {/* 권한 상태 */}
      {!canNotify && (
        <Card className="mx-4">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 ${denied ? 'text-negative' : 'text-primary'}`}>
              {denied ? <BellOff size={20} /> : <Bell size={20} />}
            </div>
            <div className="flex-1">
              {denied ? (
                <>
                  <p className="text-body2 font-semibold text-label-strong">알림이 차단되어 있어요</p>
                  <p className="text-caption1 text-label-alt mt-1">
                    {isNative
                      ? '휴대폰 설정 > 앱 > 온주에서 알림을 허용해 주세요.'
                      : '브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-body2 font-semibold text-label-strong">알림 권한이 필요해요</p>
                  <p className="text-caption1 text-label-alt mt-1">루틴 리마인드와 주간 리뷰 알림을 받으려면 허용해 주세요.</p>
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={requestPermission}
                    disabled={requesting}
                    className="mt-3 px-4 h-9 bg-primary text-white text-label2 font-medium rounded-lg disabled:opacity-30 hover:bg-primary-strong transition-colors"
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
            <p className="text-body2 font-semibold text-label-strong flex items-center gap-1.5"><Sunrise size={16} strokeWidth={1.9} className="text-label-alt" />아침 알림</p>
            <p className="text-caption1 text-label-alt mt-0.5">오늘의 루틴을 시작하도록 알려줘요</p>
          </div>
          <Toggle
            enabled={canNotify && store.morningEnabled}
            disabled={!canNotify}
            onChange={v => store.update({ morningEnabled: v })}
          />
        </div>
        {store.morningEnabled && canNotify && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-caption1 text-label-alt">알림 시간</span>
            <input
              type="time"
              value={store.morningTime}
              onChange={e => store.update({ morningTime: e.target.value })}
              className="text-body2 border border-line rounded-lg px-2 py-1 focus:outline-none focus:border-primary bg-surface text-label"
            />
          </div>
        )}
      </Card>

      {/* 저녁 알림 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body2 font-semibold text-label-strong flex items-center gap-1.5"><Moon size={16} strokeWidth={1.9} className="text-label-alt" />저녁 리마인드</p>
            <p className="text-caption1 text-label-alt mt-0.5">미완료 루틴이 있을 때 알려줘요</p>
          </div>
          <Toggle
            enabled={canNotify && store.eveningEnabled}
            disabled={!canNotify}
            onChange={v => store.update({ eveningEnabled: v })}
          />
        </div>
        {store.eveningEnabled && canNotify && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-caption1 text-label-alt">알림 시간</span>
            <input
              type="time"
              value={store.eveningTime}
              onChange={e => store.update({ eveningTime: e.target.value })}
              className="text-body2 border border-line rounded-lg px-2 py-1 focus:outline-none focus:border-primary bg-surface text-label"
            />
          </div>
        )}
      </Card>

      {/* 주간 리뷰 알림 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-body2 font-semibold text-label-strong flex items-center gap-1.5"><ClipboardList size={16} strokeWidth={1.9} className="text-label-alt" />주간 리뷰 알림</p>
            <p className="text-caption1 text-label-alt mt-0.5">일요일에 주간 리뷰를 상기시켜줘요</p>
          </div>
          <Toggle
            enabled={canNotify && store.reviewEnabled}
            disabled={!canNotify}
            onChange={v => store.update({ reviewEnabled: v })}
          />
        </div>
      </Card>

      {canNotify && (
        <p className="text-center text-caption1 text-label-assistive px-4">
          {isNative
            ? '앱을 닫아도 예약된 시간에 알림이 와요'
            : '알림은 앱이 열려 있는 동안 예약됩니다'}
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
        enabled ? 'bg-primary' : 'bg-fill-strong'
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
