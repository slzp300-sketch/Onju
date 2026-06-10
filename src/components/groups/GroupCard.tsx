import { useNavigate } from 'react-router-dom';
import { Users, Calendar } from 'lucide-react';
import type { SmallGroup } from '../../types';
import Badge from '../ui/Badge';
import { GROUP_CATEGORY_LABEL, GROUP_STATUS_META, effectiveStatus, COVER_ICONS } from '../../utils/groupMeta';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function GroupCard({ group }: { group: SmallGroup }) {
  const navigate = useNavigate();
  const { label, color } = GROUP_STATUS_META[effectiveStatus(group)];
  const isFull = group.currentMemberCount >= group.maxMembers;

  return (
    <button
      onClick={() => navigate(`/groups/${group.id}`)}
      className="w-full bg-white rounded-2xl p-4 border border-line-soft text-left hover:border-primary-soft transition-colors"
    >
      <div className="flex items-start gap-3 mb-2">
        {group.coverIcon && COVER_ICONS[group.coverIcon] && (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: `${group.color ?? '#1f6bff'}1a` }}>
            {(() => { const Icon = COVER_ICONS[group.coverIcon]; return <Icon size={20} strokeWidth={1.9} style={{ color: group.color ?? '#1f6bff' }} />; })()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-label1 font-semibold text-label-strong flex-1 truncate">{group.title}</h3>
            <Badge label={label} color={color} />
          </div>
          {group.category && (
            <span className="text-caption2 font-medium text-label-assistive">{GROUP_CATEGORY_LABEL[group.category]}</span>
          )}
        </div>
      </div>
      <p className="text-caption1 text-label-alt leading-relaxed mb-3 line-clamp-2">{group.goal}</p>
      <div className="flex items-center gap-3 text-caption1 text-label-alt">
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
