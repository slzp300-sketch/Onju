import { useNavigate } from 'react-router-dom';
import { Users, Calendar, ChevronRight } from '../../icons';
import type { SmallGroup } from '../../types';
import Badge from '../ui/Badge';
import { GROUP_CATEGORY_LABEL, GROUP_STATUS_META, effectiveStatus, COVER_ICONS } from '../../utils/groupMeta';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function GroupCard({ group }: { group: SmallGroup }) {
  const navigate = useNavigate();
  const { label, color } = GROUP_STATUS_META[effectiveStatus(group)];
  const isFull = group.currentMemberCount >= group.maxMembers;
  const memberRate = Math.min(100, Math.round((group.currentMemberCount / group.maxMembers) * 100));
  const accent = group.color ?? 'var(--color-primary)';

  return (
    <button
      onClick={() => navigate(`/groups/${group.id}`)}
      className="group-paper-card w-full p-4 text-left transition-transform active:scale-[0.99]"
      style={{ '--group-accent': accent } as React.CSSProperties}
    >
      <div className="flex items-start gap-3 mb-2">
        {group.coverIcon && COVER_ICONS[group.coverIcon] && (
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-emphasize"
            style={{ backgroundColor: `${group.color ?? '#2f9e60'}1a` }}>
            {(() => { const Icon = COVER_ICONS[group.coverIcon]; return <Icon size={20} strokeWidth={1.9} style={{ color: group.color ?? '#2f9e60' }} />; })()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-body2 font-bold text-label-strong flex-1 truncate">{group.title}</h3>
            <Badge label={label} color={color} />
          </div>
          {group.category && (
            <span className="mt-0.5 inline-flex rounded-md bg-fill px-1.5 py-0.5 text-caption2 font-medium text-label-alt">{GROUP_CATEGORY_LABEL[group.category]}</span>
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
        <ChevronRight size={16} className="ml-auto text-label-assistive" />
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-fill-strong" aria-label={`정원 ${memberRate}% 참여`}>
        <div className="crayon-chart-fill h-full rounded-full" style={{ width: `${memberRate}%`, backgroundColor: accent }} />
      </div>
    </button>
  );
}
