import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Users, MessageSquare } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchGroupById, fetchGroupMembers, joinGroup } from '../api/groups';
import { fetchWeeklyShares } from '../api/reviews';
import MemberProgressCard from '../components/groups/MemberProgressCard';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { currentWeek } from '../utils/date';

export default function GroupDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: group, isLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => fetchGroupById(id!),
    enabled: !!id,
  });

  const { data: members = [] } = useQuery({
    queryKey: ['group-members', id],
    queryFn: () => fetchGroupMembers(id!),
    enabled: !!id,
  });

  const { data: weeklyShares = [] } = useQuery({
    queryKey: ['weekly-shares', id, currentWeek()],
    queryFn: () => fetchWeeklyShares(id!, currentWeek()),
    enabled: !!id,
  });

  const joinMutation = useMutation({
    mutationFn: () => joinGroup(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['group', id] }),
  });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4 p-4">
        {[1, 2, 3].map(i => <div key={i} className="bg-gray-100 rounded-2xl h-20 animate-pulse" />)}
      </div>
    );
  }

  if (!group) return null;

  const isFull = group.currentMemberCount >= group.maxMembers;

  return (
    <div className="flex flex-col gap-4 pb-4">
      {/* 헤더 */}
      <div className="px-4 pt-4 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-gray-500 p-1">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-base font-bold text-gray-900 flex-1 truncate">{group.title}</h1>
      </div>

      {/* 그룹 정보 */}
      <Card className="mx-4">
        <div className="flex items-start justify-between mb-2">
          <Badge
            label={group.status === 'recruiting' ? '모집 중' : group.status === 'active' ? '진행 중' : '완료'}
            color={group.status === 'recruiting' ? 'green' : group.status === 'active' ? 'indigo' : 'gray'}
          />
        </div>
        <p className="text-sm text-gray-600 leading-relaxed mb-3">{group.goal}</p>
        <div className="flex gap-4 text-xs text-gray-400">
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

      {/* 참여 버튼 (모집 중이고 자리 있을 때) */}
      {group.status === 'recruiting' && !isFull && (
        <div className="px-4">
          <Button
            fullWidth
            onClick={() => joinMutation.mutate()}
            disabled={joinMutation.isPending}
          >
            {joinMutation.isPending ? '참여 중...' : '소모임 참여하기'}
          </Button>
        </div>
      )}
      {isFull && group.status === 'recruiting' && (
        <div className="px-4">
          <p className="text-center text-sm text-gray-400 bg-gray-50 rounded-xl py-3">정원이 마감되었습니다</p>
        </div>
      )}

      {/* 멤버 현황 */}
      <div className="px-4">
        <p className="text-xs font-semibold text-gray-500 mb-2">오늘의 멤버 현황</p>
        <div className="flex flex-col gap-2">
          {members.map(m => <MemberProgressCard key={m.userId} member={m} />)}
        </div>
      </div>

      {/* 이번 주 나눔 (리뷰 공유 데이터) */}
      {weeklyShares.length > 0 && (
        <div className="px-4">
          <p className="text-xs font-semibold text-gray-500 mb-2">이번 주 나눔</p>
          <div className="flex flex-col gap-3">
            {weeklyShares.map(share => (
              <Card key={share.id} className="!p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-semibold text-xs">
                    {share.userName.slice(0, 1)}
                  </div>
                  <p className="text-sm font-semibold text-gray-900">{share.userName}</p>
                  <div className="flex gap-2 ml-auto text-xs text-gray-400">
                    <span className="text-indigo-500 font-medium">{share.personalRate}%</span>
                    <span className="text-emerald-500 font-medium">{share.faithRate}%</span>
                  </div>
                </div>
                {share.comment && (
                  <p className="text-xs text-gray-600 mb-1.5 leading-relaxed">
                    <MessageSquare size={11} className="inline mr-1 text-gray-400" />
                    "{share.comment}"
                  </p>
                )}
                {share.intention && (
                  <p className="text-xs text-indigo-600 font-medium">
                    → {share.intention}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
