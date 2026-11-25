import { useEffect, useReducer } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useGroupStore } from '../../store/groupStore';
import { cancelHeldMembershipRequests, heldMembershipRequests } from '../../lib/sync/outbox';
import { toast } from '../../store/toastStore';

export default function MembershipStatus({ groupId }: { groupId?: string }) {
  const owner = useAuthStore(s => s.user?.id);
  const { membershipStatus, groups, refreshMembership } = useGroupStore();
  const [, refresh] = useReducer(n => n + 1, 0);
  useEffect(() => {
    window.addEventListener('onju-outbox-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('onju-outbox-changed', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const held = owner ? heldMembershipRequests(owner).filter(r => !groupId || r.groupId === groupId) : [];
  const heldIds = [...new Set(held.map(r => r.groupId))];
  const statuses = Object.entries(membershipStatus).filter(([id]) => !groupId || id === groupId);
  if (!heldIds.length && !statuses.length) return null;
  return <div className="mx-4 flex flex-col gap-2" aria-live="polite">
    {heldIds.map(id => <div key={id} className="rounded-xl border border-line bg-surface p-3 text-caption1 text-label-alt">
      <p className="font-bold text-label">{groups.find(g => g.id === id)?.title ?? '소모임'} · 이전 요청 확인 필요</p>
      <p className="mt-1">예전 버전의 가입·나가기 요청을 보관하고 있어요. 자동 재전송하지 않아요.</p>
      <button className="min-h-11 font-bold text-primary" disabled={membershipStatus[id]?.phase === 'pending'} onClick={async () => {
        if (!owner || !cancelHeldMembershipRequests(owner, id)) { toast.error('이전 요청을 정리하지 못했어요. 계정과 기기 저장 공간을 확인해주세요.'); return; }
        await refreshMembership(id);
      }}>이전 요청 취소·현재 상태 확인</button>
    </div>)}
    {statuses.map(([id, status]) => <div key={id} role={status.phase === 'pending' ? 'status' : 'alert'} className="rounded-xl border border-line bg-surface p-3 text-caption1 text-label-alt">
      {!groupId && <p className="font-bold text-label">{groups.find(g => g.id === id)?.title ?? '소모임'} 참여 상태</p>}
      <p>{status.message}</p>
      {status.phase !== 'pending' && <button className="min-h-11 font-bold text-primary" onClick={() => void refreshMembership(id)}>현재 참여 상태 확인</button>}
    </div>)}
  </div>;
}
