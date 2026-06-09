import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import GroupCard from '../components/groups/GroupCard';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { useGroupStore } from '../store/groupStore';
import { fetchGroups } from '../api/groups';

type Tab = 'mine' | 'discover';

export default function Groups() {
  const [tab, setTab] = useState<Tab>('mine');
  const navigate = useNavigate();
  const { groups, myGroupIds } = useGroupStore();

  // 탐색 = 공개 모집 중 소모임 (이미 참여한 건 제외)
  const { data: discoverData, isLoading } = useQuery({
    queryKey: ['discover-groups'],
    queryFn: () => fetchGroups({ status: 'recruiting' }),
  });
  const discover = (discoverData?.groups ?? []).filter(g => !myGroupIds.includes(g.id));

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mine', label: `내 소모임${groups.length ? ` ${groups.length}` : ''}` },
    { key: 'discover', label: '탐색' },
  ];

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5 flex items-center justify-between">
        <h1 className="text-heading2 font-bold text-label-strong font-brand">소모임</h1>
        <Button size="sm" onClick={() => navigate('/groups/new')}>
          <Plus size={15} /> 만들기
        </Button>
      </div>

      {/* 탭 */}
      <div className="px-4 flex gap-2">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3.5 py-1.5 rounded-lg text-label2 font-medium transition-colors ${
              tab === t.key ? 'bg-primary text-white' : 'bg-fill text-label-alt'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 내 소모임 */}
      {tab === 'mine' && (
        <div className="px-4 flex flex-col gap-3">
          {groups.length === 0 ? (
            <EmptyState
              title="참여 중인 소모임이 없어요"
              description="탐색에서 함께할 소모임을 찾거나 직접 만들어 보세요"
              action={
                <div className="flex gap-2">
                  <Button size="sm" variant="assistive" onClick={() => setTab('discover')}>탐색하기</Button>
                  <Button size="sm" onClick={() => navigate('/groups/new')}>
                    <Plus size={14} /> 만들기
                  </Button>
                </div>
              }
            />
          ) : (
            groups.map(g => <GroupCard key={g.id} group={g} />)
          )}
        </div>
      )}

      {/* 탐색 */}
      {tab === 'discover' && (
        <div className="px-4 flex flex-col gap-3">
          {isLoading ? (
            <p className="text-center text-caption1 text-label-assistive py-10">불러오는 중…</p>
          ) : discover.length === 0 ? (
            <EmptyState
              title="모집 중인 공개 소모임이 없어요"
              description="첫 소모임을 만들어 함께 성장해 보세요"
              action={
                <Button size="sm" onClick={() => navigate('/groups/new')}>
                  <Plus size={14} /> 소모임 만들기
                </Button>
              }
            />
          ) : (
            discover.map(g => <GroupCard key={g.id} group={g} />)
          )}
        </div>
      )}
    </div>
  );
}
