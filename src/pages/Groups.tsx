import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import GroupCard from '../components/groups/GroupCard';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import { useGroupStore } from '../store/groupStore';

type TabStatus = 'all' | 'recruiting' | 'active';

export default function Groups() {
  const [tab, setTab] = useState<TabStatus>('all');
  const navigate = useNavigate();
  const { groups } = useGroupStore();

  const filtered = tab === 'all' ? groups : groups.filter(g => g.status === tab);

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
        {filtered.length === 0 ? (
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
          filtered.map(g => <GroupCard key={g.id} group={g} />)
        )}
      </div>
    </div>
  );
}
