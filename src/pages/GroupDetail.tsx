import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Users, Check } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useGroupStore } from '../store/groupStore';
import { useAuthStore } from '../store/authStore';
import { useCheerStore } from '../store/cheerStore';
import { fetchGroupMembers } from '../api/groups';
import { fetchWeeklyShares } from '../api/reviews';
import { GROUP_CATEGORY_LABEL } from '../utils/groupMeta';
import type { MemberGroupProgress, GroupWeeklyShare, CheerType } from '../types';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Badge from '../components/ui/Badge';

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
  const isJoined = isMember || isCreator;
  const canJoin = group.status === 'recruiting' && !isFull && !isMember && !isCreator;

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
          {group.emoji && (
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
              style={{ backgroundColor: `${group.color ?? '#0066FF'}1a` }}>
              {group.emoji}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              label={group.status === 'recruiting' ? '모집 중' : group.status === 'active' ? '진행 중' : '완료'}
              color={group.status === 'recruiting' ? 'green' : group.status === 'active' ? 'indigo' : 'gray'}
            />
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
          <Button fullWidth onClick={() => joinGroup(id!)}>소모임 참여하기</Button>
        </div>
      )}
      {isFull && !isJoined && (
        <div className="px-4">
          <p className="text-center text-body2 text-label-alt bg-fill rounded-xl py-3">정원이 마감되었습니다.</p>
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
          <MemberBoard groupId={id!} />
          <WeeklyShareFeed groupId={id!} />
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
        <h2 className="text-body2 font-bold text-label-strong">📊 멤버 현황판</h2>
        <span className="text-caption2 text-label-assistive">주간 달성률 순</span>
      </div>

      {isLoading ? (
        <div className="bg-surface rounded-xl border border-line shadow-emphasize py-10 text-center text-caption1 text-label-assistive">
          불러오는 중…
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-line shadow-emphasize divide-y divide-line-soft overflow-hidden">
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
            <span className="text-caption2 font-bold text-orange-500 flex-shrink-0">🔥{member.streak}</span>
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
        <div className="bg-surface rounded-xl border border-line shadow-emphasize py-10 text-center text-caption1 text-label-assistive">
          불러오는 중…
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-surface rounded-xl border border-line shadow-emphasize flex flex-col items-center text-center px-6 py-8">
          <span className="text-3xl mb-2">🌱</span>
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

const CHEERS: { key: CheerType; emoji: string }[] = [
  { key: 'heart', emoji: '❤️' },
  { key: 'fire', emoji: '🔥' },
  { key: 'pray', emoji: '🙏' },
];

function ShareCard({ share }: { share: GroupWeeklyShare }) {
  const cheered = useCheerStore(s => s.cheered);
  const toggleCheer = useCheerStore(s => s.toggleCheer);
  const isOn = (k: CheerType) => !!cheered[`${share.id}:${k}`];

  return (
    <div className="bg-surface rounded-2xl border border-line shadow-emphasize overflow-hidden">
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
              <span className="text-sm leading-none">{c.emoji}</span>
              <span className="tabular-nums">{isOn(c.key) ? 1 : 0}</span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
