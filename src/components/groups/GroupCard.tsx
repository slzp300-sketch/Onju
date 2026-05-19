import { useNavigate } from 'react-router-dom';
import { Users, Calendar } from 'lucide-react';
import type { SmallGroup } from '../../types';
import Badge from '../ui/Badge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

const statusMap: Record<SmallGroup['status'], { label: string; color: 'green' | 'indigo' | 'gray' }> = {
  recruiting: { label: '모집 중', color: 'green' },
  active: { label: '진행 중', color: 'indigo' },
  completed: { label: '완료', color: 'gray' },
};

export default function GroupCard({ group }: { group: SmallGroup }) {
  const navigate = useNavigate();
  const { label, color } = statusMap[group.status];
  const isFull = group.currentMemberCount >= group.maxMembers;

  return (
    <button
      onClick={() => navigate(`/groups/${group.id}`)}
      className="w-full bg-white rounded-2xl p-4 border border-gray-100 shadow-sm text-left hover:border-indigo-200 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="text-sm font-semibold text-gray-900 flex-1">{group.title}</h3>
        <Badge label={label} color={color} />
      </div>
      <p className="text-xs text-gray-500 leading-relaxed mb-3 line-clamp-2">{group.goal}</p>
      <div className="flex items-center gap-3 text-xs text-gray-400">
        <span className="flex items-center gap-1">
          <Users size={12} />
          <span className={isFull ? 'text-red-400' : ''}>
            {group.currentMemberCount}/{group.maxMembers}명
          </span>
          {isFull && <span className="text-red-400">(마감)</span>}
        </span>
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {format(new Date(group.endDate), 'M/d 종료', { locale: ko })}
        </span>
      </div>
    </button>
  );
}
