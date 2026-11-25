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

  return (
    <button
      onClick={() => navigate(`/groups/${group.id}`)}
      className="group-paper-card w-full p-4 text-left transition-transform active:scale-[0.99]"
    >
      <div className="flex items-start gap-3 mb-2">
        {group.coverIcon && COVER_ICONS[group.coverIcon] && (
          <div className="group-cover relative w-11 h-11 rounded-xl bg-primary-soft flex items-center justify-center flex-shrink-0 shadow-emphasize">
            {(() => { const Icon = COVER_ICONS[group.coverIcon]; return <Icon size={20} strokeWidth={1.9} className="text-primary" />; })()}
            {group.color && <span aria-hidden className="absolute bottom-1 right-1 size-2 rounded-full" style={{ backgroundColor: group.color }} />}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-body2 font-bold text-label-strong min-w-0 flex-1 break-words line-clamp-2">{group.title}</h3>
            <Badge label={label} color={color} />
          </div>
          {group.category && (
            <span className="mt-0.5 inline-flex rounded-md bg-fill px-1.5 py-0.5 text-caption2 font-medium text-label-alt">{GROUP_CATEGORY_LABEL[group.category]}</span>
          )}
          {!group.isPublic && <span className="ml-2 text-caption2 text-label-alt">비공개 · 초대 전용</span>}
        </div>
      </div>
      <p className="text-caption1 text-label-alt leading-relaxed mb-3 line-clamp-2">{group.goal}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption1 text-label-alt">
        <span className="flex items-center gap-1">
          <Users size={12} />
          <span className={isFull ? 'text-cautionary' : ''}>
            {group.currentMemberCount}/{group.maxMembers}명
          </span>
          {isFull && <span className="text-cautionary">(마감)</span>}
        </span>
        <span className="flex items-center gap-1">
          <Calendar size={12} />
          {format(new Date(group.endDate), 'M/d 종료', { locale: ko })}
        </span>
        <ChevronRight size={16} className="ml-auto text-label-assistive" />
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-fill-strong" aria-label={`정원 ${memberRate}% 참여`}>
        <div className="crayon-chart-fill h-full rounded-full bg-primary" style={{ width: `${memberRate}%` }} />
      </div>
    </button>
  );
}
