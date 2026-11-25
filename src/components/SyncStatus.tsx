import { useCallback, useState, useSyncExternalStore } from 'react';
import { useAuthStore } from '../store/authStore';
import { flush, pendingCount, unpersistedCount, goalSyncEntries, practiceSyncEntries, planSyncEntries, recordSyncEntries } from '../lib/sync/outbox';
import { toast } from '../store/toastStore';

function subscribe(onChange: () => void) {
  const events = ['onju-outbox-changed', 'online', 'offline'];
  for (const event of events) window.addEventListener(event, onChange);
  return () => { for (const event of events) window.removeEventListener(event, onChange); };
}

export default function SyncStatus() {
  const userId = useAuthStore(s => s.user?.id ?? '');
  const snapshot = useCallback(() => `${navigator.onLine}:${pendingCount(userId)}:${unpersistedCount(userId)}:${new Set(goalSyncEntries(userId).map(e => e.goalId)).size}:${new Set(practiceSyncEntries(userId).map(e => e.key)).size}:${new Set(planSyncEntries(userId).map(e => e.key)).size}:${new Set(recordSyncEntries(userId).map(e => e.key)).size}`, [userId]);
  const [online, pending, unpersisted, conflicts, practices, plans, records] = useSyncExternalStore(subscribe, snapshot).split(':');
  const [retrying, setRetrying] = useState(false);
  if (!userId || (online === 'true' && Number(pending) === 0 && Number(conflicts) === 0 && Number(practices) === 0 && Number(plans) === 0 && Number(records) === 0)) return null;
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try { await flush(); } catch { toast.error('전송하지 못했어요. 변경사항은 대기 목록에 남아 있어요.'); }
    finally { setRetrying(false); }
  };
  return (
    <details className="sync-notice border-b border-line bg-primary-soft px-4 text-caption1 text-label" open={Number(unpersisted) > 0 ? true : undefined}>
      <summary aria-live="polite" className="min-h-11 cursor-pointer py-3 font-semibold">{Number(unpersisted) > 0 ? '기기 보관 실패 · 확인 필요' : Number(conflicts) + Number(practices) + Number(plans) + Number(records) > 0 ? '저장 확인 필요 · 입력 보관 중' : online === 'true' ? `전송 대기 ${pending}개` : '오프라인 · 기기 기록 사용 중'}</summary>
      <div role="status" className="flex flex-wrap gap-2 pb-3">
      <p className="w-full min-w-0 leading-relaxed">
        {Number(unpersisted) > 0 ? '기기 보관에 실패했어요. 앱을 닫기 전에 저장 공간을 확인해주세요.'
          : Number(records) > 0 ? `할 일·일기·메모 ${records}개 확인 필요 · 입력은 기기에 보관 중`
          : Number(plans) > 0 ? `묶음·주간 목표 ${plans}개 확인 필요 · 입력은 기기에 보관 중`
          : Number(practices) > 0 ? `습관·루틴 ${practices}개 확인 필요 · 입력은 기기에 보관 중${Number(pending) > 0 ? ` · 다른 변경 ${pending}개 전송 대기` : ''}`
          : Number(conflicts) > 0 ? `목표 ${conflicts}개 확인 필요 · 입력은 기기에 보관 중${Number(pending) > 0 ? ` · 다른 변경 ${pending}개 전송 대기` : ''}`
          : Number(pending) > 0 ? (online === 'true' ? `변경 ${pending}개 전송 대기 중` : `오프라인 · 변경 ${pending}개를 기기에 보관했어요`)
          : '오프라인 · 기기에 저장된 기록으로 이용 중이에요'}
      </p>
      {Number(conflicts) > 0 && <a className="min-h-11 flex items-center px-2 font-bold text-primary" href="/goals/conflicts">목표 충돌 확인</a>}
      {Number(practices) > 0 && <a className="min-h-11 flex items-center px-2 font-bold text-primary" href="/practices/conflicts">실천 충돌 확인</a>}
      {Number(records) > 0 && <a className="min-h-11 flex items-center px-2 font-bold text-primary" href="/records/conflicts">기록 충돌 확인</a>}
      {Number(plans) > 0 && <a className="min-h-11 flex items-center px-2 font-bold text-primary" href="/plans/conflicts">묶음·주간 목표 확인</a>}
      {online === 'true' && Number(pending) > 0 && <button type="button" onClick={() => void retry()} disabled={retrying} className="min-h-11 shrink-0 px-2 font-semibold text-primary disabled:opacity-50">{retrying ? '전송 중…' : '다시 전송'}</button>}
      </div>
    </details>
  );
}
