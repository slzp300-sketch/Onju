import { useEffect, useReducer, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useGroupStore } from '../../store/groupStore';
import { heldGroupStatusRequests } from '../../lib/sync/outbox';
import { effectiveStatus } from '../../utils/groupMeta';
import { useLocalNow } from '../../hooks/useLocalNow';
import type { SmallGroup, GroupStatus } from '../../types';
import Button from '../ui/Button';
import ConfirmModal from '../ui/ConfirmModal';

export default function GroupManagement({ groupId, group }: { groupId?: string; group?: SmallGroup }) {
  const owner = useAuthStore(s => s.user?.id);
  const { statusChanges, groups, setGroupStatus, refreshGroupStatus } = useGroupStore();
  const [confirmation, setConfirmation] = useState<{ target: GroupStatus; expected: GroupStatus } | null>(null);
  const [, refresh] = useReducer(n => n + 1, 0);
  useLocalNow();
  useEffect(() => {
    window.addEventListener('onju-outbox-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('onju-outbox-changed', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const held = owner ? heldGroupStatusRequests(owner).filter(r => !groupId || r.groupId === groupId) : [];
  const ids = [...new Set([...held.map(r => r.groupId), ...Object.keys(statusChanges)])]
    .filter(id => (!groupId || id === groupId) && (groupId || held.some(r => r.groupId === id) || statusChanges[id]?.phase !== 'success'));
  const state = groupId ? statusChanges[groupId] : undefined;
  const locked = state?.phase === 'pending' || state?.phase === 'unknown' || held.some(r => r.groupId === groupId);
  const status = group ? effectiveStatus(group) : undefined;
  const canManage = group && group.creatorId === owner;
  if (!ids.length && (!canManage || status === 'completed')) return null;

  return <div className="mx-4 flex flex-col gap-3">
    {ids.map(id => {
      const saved = statusChanges[id];
      const change = saved?.phase === 'success' && held.some(r => r.groupId === id) ? undefined : saved;
      return <div key={id} role={change?.phase === 'pending' || change?.phase === 'success' ? 'status' : 'alert'}
        className="rounded-xl border border-line bg-surface p-3 text-caption1 text-label-alt">
        <p className="font-bold text-label">{group?.title ?? groups.find(g => g.id === id)?.title ?? '소모임'} · 운영 상태</p>
        <p className="mt-1">{change?.message ?? '이전에 보류된 상태 변경 요청이 있어요. 현재 상태를 확인해주세요.'}</p>
        {held.some(r => r.groupId === id) && <p className="mt-1">요청을 자동 재전송하지 않아요. 서버에서 확인한 상태를 반영한 뒤 다시 변경할 수 있어요.</p>}
        {change?.phase !== 'pending' && change?.phase !== 'success' && <Button variant="ghost" className="mt-1" onClick={() => void refreshGroupStatus(id)}>현재 운영 상태 확인</Button>}
        {!groupId && <Link className="block py-2 font-bold text-primary" to={`/groups/${id}`}>소모임으로 이동</Link>}
      </div>;
    })}
    {canManage && status !== 'completed' && <details className="quiet-details"><summary>모임 운영</summary><Button fullWidth variant={status === 'active' ? 'assistive' : 'outlined'} disabled={locked}
      onClick={() => setConfirmation({ target: status === 'recruiting' ? 'active' : 'completed', expected: group.status })}>
      {state?.phase === 'pending' ? '운영 상태 확인 중…' : status === 'recruiting' ? '모집 마감하고 시작하기' : '소모임 종료하기'}
    </Button></details>}
    <ConfirmModal isOpen={!!confirmation && !!canManage && !locked && group?.status === confirmation.expected}
      title={confirmation?.target === 'active' ? '모집을 마감하고 시작할까요?' : '소모임을 종료할까요?'}
      message={confirmation?.target === 'active' ? '추가 참여를 마감하고 진행 중으로 바꿔요. 모집 중으로 되돌릴 수 없어요.' : '종료 후에는 다시 시작할 수 없어요. 기존 멤버와 기록은 그대로 남아요.'}
      confirmLabel={confirmation?.target === 'active' ? '마감하고 시작' : '종료하기'} danger={confirmation?.target === 'completed'}
      onCancel={() => setConfirmation(null)} onConfirm={() => {
        if (group && confirmation && !locked) void setGroupStatus(group.id, confirmation.target, confirmation.expected);
        setConfirmation(null);
      }} />
  </div>;
}
