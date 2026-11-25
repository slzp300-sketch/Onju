import { useEffect, useReducer } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useGroupStore } from '../../store/groupStore';
import { heldGroupCreations } from '../../lib/sync/outbox';
import { useQuery } from '@tanstack/react-query';
import { listUnfinishedGroupCreations } from '../../data/groupRepos';

export default function CreationRecovery() {
  const owner = useAuthStore(s => s.user?.id);
  const { creationStatus, createGroup } = useGroupStore();
  const navigate = useNavigate();
  const { data: unfinished = [], isError, refetch } = useQuery({
    queryKey: ['unfinished-group-creations', owner], queryFn: () => listUnfinishedGroupCreations(owner!), enabled: !!owner,
  });
  const [, refresh] = useReducer(n => n + 1, 0);
  useEffect(() => {
    window.addEventListener('onju-outbox-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('onju-outbox-changed', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const held = owner ? heldGroupCreations(owner) : [];
  const requests = [...held, ...unfinished.filter(g => !held.some(h => h.groupId === g.groupId)).map(g => ({ groupId: g.groupId, details: undefined }))];
  return <>{isError && <button className="mx-4 min-h-11 text-caption1 text-label-alt" onClick={() => void refetch()}>이전 생성 상태를 확인하지 못했어요 · 다시 확인</button>}
    {requests.map(item => <div key={item.groupId} className="mx-4 rounded-xl border border-line bg-surface p-4 text-caption1" aria-live="polite">
    <p className="font-bold text-label-strong">{typeof item.details?.title === 'string' ? item.details.title : unfinished.find(g => g.groupId === item.groupId)?.title ?? '이전에 만들던 소모임'} · 생성 확인 필요</p>
    <p className="mt-2 text-label-alt">모임 정보와 방장 등록 중 일부만 저장되었을 수 있어요. 기존 내용을 유지하며 복구할 수 있어요.</p>
    {creationStatus[item.groupId] && <p role="status" className="mt-2 text-label-alt">{creationStatus[item.groupId].message}</p>}
    <button disabled={creationStatus[item.groupId]?.phase === 'pending'} className="mt-2 min-h-11 font-bold text-primary" onClick={async () => {
      if (await createGroup(item.groupId, item.details) && useAuthStore.getState().user?.id === owner) navigate(`/groups/${item.groupId}`);
    }}>생성 확인·복구</button>
  </div>)}</>;
}
