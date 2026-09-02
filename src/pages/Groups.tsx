import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Camera, ChevronRight } from '../icons';
import { useQuery } from '@tanstack/react-query';
import GroupCard from '../components/groups/GroupCard';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import SegmentedControl from '../components/ui/SegmentedControl';
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
    <div className="groups-paper flex min-h-full flex-col gap-4 pb-4">
      <header className="px-5 pt-5 flex items-end justify-between">
        <div>
          <p className="text-caption1 font-medium tracking-wide text-label-alt">함께 심고 함께 자라요</p>
          <h1 className="mt-0.5 text-heading1 font-bold text-label-strong font-brand">온주의 작은 숲</h1>
        </div>
        <Button size="sm" onClick={() => navigate('/groups/new')}>
          <Plus size={15} /> 만들기
        </Button>
      </header>

      {/* 루틴 공유·인증 보드 진입 */}
      {groups.length > 0 && (
        <button
          onClick={() => navigate('/share')}
          className="group-share-card mx-4 flex min-h-16 items-center gap-3 px-4 py-3.5 text-left hover:bg-primary-soft/70 transition-colors"
        >
          <span className="w-9 h-9 rounded-xl bg-primary text-white flex items-center justify-center flex-shrink-0">
            <Camera size={16} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-body2 font-bold text-label-strong">오늘 인증 · 루틴 공유</span>
            <span className="block text-caption1 text-label-alt mt-0.5">모임원들의 인증샷과 루틴을 만나보세요</span>
          </span>
          <ChevronRight size={16} className="text-label-assistive flex-shrink-0" />
        </button>
      )}

      {/* 탭 */}
      <div className="groups-tab-backdrop sticky top-0 z-sticky py-1">
        <SegmentedControl value={tab} onChange={setTab} items={tabs.map(t => ({ value: t.key, label: t.label }))}
          label="소모임 목록" variant="pills" className="px-4" />
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
