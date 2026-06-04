import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Users } from 'lucide-react';
import { useGroupStore } from '../store/groupStore';
import { useAuthStore } from '../store/authStore';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getById, joinGroup, myGroupIds } = useGroupStore();
  const { user } = useAuthStore();

  const group = getById(id ?? '');
  const isMember = myGroupIds.includes(id ?? '');

  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 px-4">
        <p className="text-label-assistive text-sm">소모임을 찾을 수 없어요</p>
        <Button variant="ghost" onClick={() => navigate(-1)}>돌아가기</Button>
      </div>
    );
  }

  const isFull = group.currentMemberCount >= group.maxMembers;
  const isCreator = group.creatorId === user?.id;
  const canJoin = group.status === 'recruiting' && !isFull && !isMember && !isCreator;

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* 헤더 */}
      <div className="px-4 pt-4 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-label-alt p-1 hover:text-label transition-colors">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-headline1 font-bold text-label-strong flex-1 truncate">{group.title}</h1>
      </div>

      {/* 그룹 정보 */}
      <Card className="mx-4">
        <div className="flex items-start justify-between mb-2">
          <Badge
            label={group.status === 'recruiting' ? '모집 중' : group.status === 'active' ? '진행 중' : '완료'}
            color={group.status === 'recruiting' ? 'green' : group.status === 'active' ? 'indigo' : 'gray'}
          />
        </div>
        <p className="text-body2 text-label leading-relaxed mb-3">{group.goal}</p>
        <div className="flex gap-4 text-caption1 text-label-alt">
          <span className="flex items-center gap-1">
            <Users size={12} />
            {group.currentMemberCount}/{group.maxMembers}명
          </span>
          <span>
            {format(new Date(group.startDate), 'M.d', { locale: ko })} —{' '}
            {format(new Date(group.endDate), 'M.d', { locale: ko })}
          </span>
        </div>
      </Card>

      {/* 참여 버튼 */}
      {canJoin && (
        <div className="px-4">
          <Button fullWidth onClick={() => joinGroup(id!)}>
            소모임 참여하기
          </Button>
        </div>
      )}
      {isFull && !isMember && !isCreator && (
        <div className="px-4">
          <p className="text-center text-body2 text-label-alt bg-fill rounded-xl py-3">정원이 마감되었습니다.</p>
        </div>
      )}
      {(isMember || isCreator) && (
        <div className="px-4">
          <p className="text-center text-body2 text-primary bg-primary-soft rounded-xl py-3 font-medium">
            {isCreator ? '내가 만든 소모임이에요' : '참여 중인 소모임이에요'}
          </p>
        </div>
      )}
    </div>
  );
}
