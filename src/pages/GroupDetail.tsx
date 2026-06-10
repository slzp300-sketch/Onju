import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Users, Check, LogOut, Play, Flag, BarChart3, Sprout, Flame, Heart, Church } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useGroupStore } from '../store/groupStore';
import { useAuthStore } from '../store/authStore';
import { useCheerStore } from '../store/cheerStore';
import { fetchGroupMembers, fetchGroupById } from '../api/groups';
import { fetchWeeklyShares } from '../api/reviews';
import { GROUP_CATEGORY_LABEL, GROUP_STATUS_META, effectiveStatus, COVER_ICONS } from '../utils/groupMeta';
import type { ReactNode } from 'react';
import type { MemberGroupProgress, GroupWeeklyShare, CheerType } from '../types';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

export default function GroupDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getById, joinGroup, leaveGroup, setGroupStatus, myGroupIds } = useGroupStore();
  const { user } = useAuthStore();

  // 로컬(내 소모임)에 없으면 API(탐색 진입)에서 조회
  const local = getById(id);
  const { data: remote, isLoading } = useQuery({
    queryKey: ['group', id],
    queryFn: () => fetchGroupById(id),
    enabled: !local && !!id,
  });
  const group = local ?? remote;

  if (!group) {
    if (isLoading) {
      return <div className="flex items-center justify-center h-64 text-caption1 text-label-assistive">불러오는 중…</div>;
    }
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 px-4">
        <p className="text-label-assistive text-sm">소모임을 찾을 수 없어요</p>
        <Button variant="ghost" onClick={() => navigate(-1)}>돌아가기</Button>
      </div>
    );
  }

  const status = effectiveStatus(group);
  const statusMeta = GROUP_STATUS_META[status];
  const isFull = group.currentMemberCount >= group.maxMembers;
  const isMember = myGroupIds.includes(id);
  const isCreator = group.creatorId === user?.id;
  const isJoined = isMember || isCreator;
  const canJoin = status === 'recruiting' && !isFull && !isMember && !isCreator;

  const handleLeave = () => {
    leaveGroup(id);
    navigate('/groups', { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* 헤더 */}
      <div className="px-4 pt-4 flex items-center gap-2">
        <button onClick={() => navigate(-1)} className="text-label-alt p-1 hover:text-label transition-colors">
          <ChevronLeft size={22} />
        </button>
        <h1 className="text-headline1 font-bold text-label-strong flex-1 truncate">{group.title}</h1>
      </div>

      {/* 그룹 정보 */}
      <Card className="mx-4">
        <div className="flex items-start gap-3 mb-2">
          {group.coverIcon && COVER_ICONS[group.coverIcon] && (
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: `${group.color ?? '#1f6bff'}1a` }}>
              {(() => { const Icon = COVER_ICONS[group.coverIcon]; return <Icon size={24} strokeWidth={1.9} style={{ color: group.color ?? '#1f6bff' }} />; })()}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label={statusMeta.label} color={statusMeta.color} />
            {group.category && (
              <span className="text-caption2 font-bold px-2 py-0.5 rounded-full bg-fill text-label-alt">
                {GROUP_CATEGORY_LABEL[group.category]}
              </span>
            )}
          </div>
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

        {group.rules && group.rules.length > 0 && (
          <div className="mt-3 pt-3 border-t border-line-soft">
            <p className="text-caption1 font-bold text-label-alt mb-2">우리의 약속</p>
            <div className="flex flex-col gap-1.5">
              {group.rules.map(rule => (
                <div key={rule} className="flex items-center gap-2 text-caption1 text-label">
                  <Check size={13} className="text-primary flex-shrink-0" strokeWidth={2.5} />
                  {rule}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 참여 전 상태 */}
      {canJoin && (
        <div className="px-4">
          <Button fullWidth onClick={() => joinGroup(group)}>소모임 참여하기</Button>
        </div>
      )}
      {isFull && !isJoined && (
        <div className="px-4">
          <p className="text-center text-body2 text-label-alt bg-fill rounded-xl py-3">정원이 마감되었습니다.</p>
        </div>
      )}
      {status === 'completed' && !isJoined && (
        <div className="px-4">
          <p className="text-center text-body2 text-label-alt bg-fill rounded-xl py-3">종료된 소모임이에요.</p>
        </div>
      )}

      {/* 참여 후 — 소모임 홈 */}
      {isJoined && (
        <>
          <div className="px-4">
            <p className="text-center text-caption1 text-primary bg-primary-soft rounded-xl py-2.5 font-medium">
              {isCreator ? '내가 만든 소모임이에요' : '참여 중인 소모임이에요'}
            </p>
          </div>

          {/* 방장 관리 */}
          {isCreator && status === 'recruiting' && (
            <div className="px-4">
              <Button fullWidth variant="outlined" onClick={() => setGroupStatus(id, 'active')}>
                <Play size={16} /> 모집 마감하고 시작하기
              </Button>
            </div>
          )}
          {isCreator && status === 'active' && (
            <div className="px-4">
              <Button fullWidth variant="assistive" onClick={() => setGroupStatus(id, 'completed')}>
                <Flag size={16} /> 소모임 종료하기
              </Button>
            </div>
          )}

          <MemberBoard groupId={id} />
          <WeeklyShareFeed groupId={id} />

          {/* 나가기 (방장 제외) */}
          {!isCreator && (
            <div className="px-4 mt-2">
              <button onClick={handleLeave}
                className="w-full flex items-center justify-center gap-1.5 py-3 text-caption1 font-medium text-label-assistive hover:text-negative transition-colors">
                <LogOut size={14} /> 소모임 나가기
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════
   멤버 현황판 — 주간률 기준 리더보드
════════════════════════════════════════ */
function MemberBoard({ groupId }: { groupId: string }) {
  const { user } = useAuthStore();
  const { data: members = [], isLoading } = useQuery({
    queryKey: ['group-members', groupId],
    queryFn: () => fetchGroupMembers(groupId),
  });

  const sorted = [...members].sort((a, b) => b.weeklyRate - a.weeklyRate);

  return (
    <section className="px-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-body2 font-bold text-label-strong flex items-center gap-1.5">
          <BarChart3 size={16} strokeWidth={1.9} /> 멤버 현황판
        </h2>
        <span className="text-caption2 text-label-assistive">주간 달성률 순</span>
      </div>

      {isLoading ? (
        <div className="bg-surface rounded-xl border border-line py-10 text-center text-caption1 text-label-assistive">
          불러오는 중…
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-line divide-y divide-line-soft overflow-hidden">
          {sorted.map((m, i) => (
            <MemberRow key={m.userId} member={m} rank={i + 1} isMe={m.userId === user?.id} />
          ))}
        </div>
      )}
    </section>
  );
}

function MemberRow({ member, rank, isMe }: { member: MemberGroupProgress; rank: number; isMe: boolean }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-primary-soft/40' : ''}`}>
      <span className="w-5 text-center text-caption1 font-bold text-label-assistive flex-shrink-0">
        {medal ?? rank}
      </span>
      <div className="w-9 h-9 rounded-full bg-primary-soft flex items-center justify-center text-label1 font-bold text-primary flex-shrink-0">
        {member.userName[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-body2 font-semibold text-label-strong truncate">
            {member.userName}{isMe && <span className="text-caption2 text-primary font-bold"> (나)</span>}
          </span>
          {member.streak > 0 && (
            <span className="text-caption2 font-bold text-orange-500 flex-shrink-0 flex items-center gap-0.5">
              <Flame size={12} strokeWidth={1.9} />{member.streak}
            </span>
          )}
          <span className="ml-auto text-label1 font-bold text-primary tabular-nums flex-shrink-0">{member.weeklyRate}%</span>
        </div>
        <div className="h-1.5 bg-fill-strong rounded-full overflow-hidden">
          <motion.div className="h-full bg-primary rounded-full"
            initial={{ width: 0 }} animate={{ width: `${member.weeklyRate}%` }} transition={{ duration: 0.5 }} />
        </div>
        <p className="text-[10px] text-label-assistive mt-1">
          오늘 개인 {member.todayPersonalRate}% · 신앙 {member.todayFaithRate}%
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   주간 나눔 피드 + 응원
════════════════════════════════════════ */
function WeeklyShareFeed({ groupId }: { groupId: string }) {
  const { data: shares = [], isLoading } = useQuery({
    queryKey: ['group-shares', groupId],
    queryFn: () => fetchWeeklyShares(groupId),
  });

  const sorted = [...shares].sort((a, b) => (a.sharedAt < b.sharedAt ? 1 : -1));

  return (
    <section className="px-4">
      <h2 className="text-body2 font-bold text-label-strong mb-2 px-1">💬 주간 나눔</h2>

      {isLoading ? (
        <div className="bg-surface rounded-xl border border-line py-10 text-center text-caption1 text-label-assistive">
          불러오는 중…
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-surface rounded-xl border border-line flex flex-col items-center text-center px-6 py-8">
          <Sprout size={36} strokeWidth={1.9} className="text-label-assistive mb-2" />
          <p className="text-body2 font-bold text-label-strong mb-1">아직 이번 주 나눔이 없어요</p>
          <p className="text-caption1 text-label-alt">주간 리뷰를 완료하고 소모임에 나눠보세요</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {sorted.map(s => <ShareCard key={s.id} share={s} />)}
        </div>
      )}
    </section>
  );
}

const CHEERS: { key: CheerType; icon: ReactNode }[] = [
  { key: 'heart', icon: <Heart size={14} strokeWidth={1.9} /> },
  { key: 'fire', icon: <Flame size={14} strokeWidth={1.9} /> },
  { key: 'pray', icon: <Church size={14} strokeWidth={1.9} /> },
];

function ShareCard({ share }: { share: GroupWeeklyShare }) {
  const cheered = useCheerStore(s => s.cheered);
  const toggleCheer = useCheerStore(s => s.toggleCheer);
  const isOn = (k: CheerType) => !!cheered[`${share.id}:${k}`];

  return (
    <div className="bg-surface rounded-2xl border border-line overflow-hidden">
      <div className="px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="w-8 h-8 rounded-full bg-primary-soft flex items-center justify-center text-label2 font-bold text-primary flex-shrink-0">
            {share.userName[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-label1 font-semibold text-label-strong truncate">{share.userName}</p>
            <p className="text-caption2 text-label-assistive">{share.year}년 {share.weekNumber}주차 나눔</p>
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            <span className="text-caption2 font-bold px-2 py-0.5 rounded-full bg-primary-soft text-primary">개인 {share.personalRate}%</span>
            <span className="text-caption2 font-bold px-2 py-0.5 rounded-full bg-positive/10 text-positive">신앙 {share.faithRate}%</span>
          </div>
        </div>

        {share.comment && (
          <p className="text-body2 text-label leading-relaxed mb-2.5">{share.comment}</p>
        )}
        {share.intention && (
          <div className="flex items-start gap-1.5 bg-fill/60 rounded-lg px-3 py-2 mb-3">
            <span className="text-caption2 font-bold text-label-alt flex-shrink-0 mt-0.5">다짐</span>
            <span className="text-caption1 text-label leading-relaxed">{share.intention}</span>
          </div>
        )}

        {/* 응원 */}
        <div className="flex gap-2 border-t border-line-soft pt-3">
          {CHEERS.map(c => (
            <motion.button key={c.key} whileTap={{ scale: 0.88 }} transition={{ duration: 0.1 }}
              onClick={() => toggleCheer(share.id, c.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-caption1 font-bold transition-colors ${
                isOn(c.key) ? 'border-primary bg-primary-soft text-primary' : 'border-line text-label-alt'
              }`}>
              {c.icon}
              <span className="tabular-nums">{isOn(c.key) ? 1 : 0}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
