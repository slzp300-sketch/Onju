import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useInfiniteQuery } from '@tanstack/react-query';
import GroupCard from '../components/groups/GroupCard';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { fetchGroups } from '../api/groups';

type TabStatus = 'all' | 'recruiting' | 'active';

export default function Groups() {
  const [tab, setTab] = useState<TabStatus>('all');
  const navigate = useNavigate();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['groups', tab],
    queryFn: ({ pageParam = 1 }) =>
      fetchGroups({ status: tab === 'all' ? undefined : tab, page: pageParam, limit: 10 }),
    getNextPageParam: (last) => last.nextPage ?? undefined,
    initialPageParam: 1,
  });

  const groups = data?.pages.flatMap(p => p.groups) ?? [];

  const tabs: { key: TabStatus; label: string }[] = [
    { key: 'all', label: '전체' },
    { key: 'recruiting', label: '모집 중' },
    { key: 'active', label: '진행 중' },
  ];

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5 flex items-center justify-between">
        <h1 className="text-lg font-bold text-gray-900">소모임</h1>
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
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
              tab === t.key
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-600'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 목록 */}
      <div className="px-4 flex flex-col gap-3">
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-gray-100 rounded-2xl h-24 animate-pulse" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            title="소모임이 없어요"
            description="첫 소모임을 만들어 함께 성장해 보세요"
            action={
              <Button size="sm" onClick={() => navigate('/groups/new')}>
                <Plus size={14} /> 소모임 만들기
              </Button>
            }
          />
        ) : (
          <>
            {groups.map(g => <GroupCard key={g.id} group={g} />)}
            {hasNextPage && (
              <Button
                variant="secondary"
                fullWidth
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? '불러오는 중...' : '더 보기'}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
