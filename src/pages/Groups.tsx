import MembershipStatus from '../components/groups/MembershipStatus';
import CreationRecovery from '../components/groups/CreationRecovery';
import GroupManagement from '../components/groups/GroupManagement';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Camera, ChevronRight, Ticket } from '../icons';
import { useInfiniteQuery } from '@tanstack/react-query';
import GroupCard from '../components/groups/GroupCard';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import SegmentedControl from '../components/ui/SegmentedControl';
import { useGroupStore } from '../store/groupStore';
import { fetchGroups } from '../api/groups';
import { useBlockedUsers } from '../hooks/useBlockedUsers';

type Tab = 'mine' | 'discover';

export default function Groups() {
  const [tab, setTab] = useState<Tab>('mine');
  const navigate = useNavigate();
  const { groups: allGroups, myGroupIds } = useGroupStore();
  const { data: blocked = [] } = useBlockedUsers();
  const groups = allGroups.filter(group => !blocked.some(user => user.userId === group.creatorId));

  // 탐색 = 공개 모집 중 소모임 (이미 참여한 건 제외)
  const { data: discoverData, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage, isFetching } = useInfiniteQuery({
    queryKey: ['discover-groups'],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => fetchGroups({ status: 'recruiting', page: pageParam }),
    getNextPageParam: page => page.nextPage ?? undefined,
    enabled: tab === 'discover',
  });
  const discover = (discoverData?.pages.flatMap(page => page.groups) ?? []).filter(g => !myGroupIds.includes(g.id) && !blocked.some(user => user.userId === g.creatorId));

  const tabs: { key: Tab; label: string }[] = [
    { key: 'mine', label: `내 소모임${groups.length ? ` ${groups.length}` : ''}` },
    { key: 'discover', label: '탐색' },
  ];

  return (
    <div className="groups-paper flex min-h-full flex-col gap-4 pb-4">
      <header className="px-5 pt-5 flex items-end justify-between">
        <div>

          <h1 className="mt-0.5 text-heading1 font-bold text-label-strong font-brand">소모임</h1>
        </div>
        <div className="flex gap-1">
          <button className="icon-button" aria-label="초대 코드로 참여" onClick={() => navigate('/groups/invite')}><Ticket size={21} /></button>
          <button className="icon-button bg-accent text-accent-ink" aria-label="소모임 만들기" onClick={() => navigate('/groups/new')}><Plus size={21} /></button>
        </div>
      </header>

      {/* 탭 */}
      <div className="groups-tab-backdrop sticky top-0 z-sticky py-1">
        <SegmentedControl value={tab} onChange={setTab} items={tabs.map(t => ({ value: t.key, label: t.label }))}
          label="소모임 목록" variant="underline" className="mx-4" />
      </div>

      <MembershipStatus />

      <CreationRecovery />
      <GroupManagement />
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

          </span>
          <ChevronRight size={16} className="text-label-assistive flex-shrink-0" />
        </button>
      )}

      {/* 탐색 */}
      {tab === 'discover' && (
        <div className="px-4 flex flex-col gap-3">
          {isLoading ? (
            <p className="text-center text-caption1 text-label-assistive py-10">불러오는 중…</p>
          ) : isError && !discoverData ? (
            <EmptyState title="소모임을 불러오지 못했어요" description="연결 상태를 확인하고 다시 시도해주세요."
              action={<Button size="sm" onClick={() => void refetch()} disabled={isFetching}>다시 불러오기</Button>} />
          ) : discover.length === 0 && !hasNextPage ? (
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
          {discoverData && isError && <p role="alert" className="text-caption1 text-negative">목록을 더 불러오지 못했어요. 다시 시도해주세요.</p>}
          {hasNextPage && <Button variant="assistive" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? '불러오는 중…' : '소모임 더 보기'}
          </Button>}
        </div>
      )}
    </div>
  );
}
