import MembershipStatus from '../components/groups/MembershipStatus';
import GroupManagement from '../components/groups/GroupManagement';
import GroupInvites from '../components/groups/GroupInvites';
import { heldMembershipRequests } from '../lib/sync/outbox';
import { useSettingsStore } from '../store/settingsStore';
import { useLocalNow } from '../hooks/useLocalNow';
import { today } from '../utils/date';
import { localTimeZone } from '../utils/timeZone';
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import ConfirmModal from '../components/ui/ConfirmModal';
import { ChevronLeft, Users, Check, LogOut, BarChart3, Sprout, Flame, Heart, Church } from '../icons';
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
import SafetyActions from '../components/groups/SafetyActions';
import { useBlockedUsers } from '../hooks/useBlockedUsers';

export default function GroupDetail() {
  useLocalNow();
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { getById, joinGroup, leaveGroup, myGroupIds, membershipStatus, refreshMembership } = useGroupStore();
  const { user } = useAuthStore();
  const { data: blocked = [] } = useBlockedUsers();
  const [confirmLeave, setConfirmLeave] = useState(false);

  useEffect(() => {
    const refresh = () => { if (id && user?.id) void refreshMembership(id); };
    refresh(); window.addEventListener('online', refresh); window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('online', refresh); window.removeEventListener('focus', refresh); };
  }, [id, user?.id, refreshMembership]);
  // 로컬 스냅샷을 보여주면서 모집 상태·정원을 서버에서 갱신한다.
  const local = getById(id);
  const { data: remote, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['group', id],
    queryFn: () => fetchGroupById(id),
    enabled: !!id,
  });
  useEffect(() => {
    const refresh = () => { void refetch(); };
    window.addEventListener('onju-outbox-drained', refresh);
    return () => window.removeEventListener('onju-outbox-drained', refresh);
  }, [refetch]);
  const group = remote ?? local;
  const phase = membershipStatus[id]?.phase;
  const waiting = phase === 'pending' || phase === 'unknown';
  const held = user?.id ? heldMembershipRequests(user.id).some(r => r.groupId === id) : false;

  if (!group) {
    if (isLoading) {
      return <div className="flex items-center justify-center h-64 text-caption1 text-label-assistive">불러오는 중…</div>;
    }
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 px-4">
        <MembershipStatus groupId={id} />
        <GroupManagement key={`${user?.id}:${id}`} groupId={id} />
        <p className="text-label-alt text-sm">{isError ? '소모임을 불러오지 못했어요' : '소모임을 찾을 수 없어요'}</p>
        {isError && <Button disabled={isFetching} onClick={() => void refetch()}>다시 시도</Button>}
        <Button variant="ghost" onClick={() => navigate('/groups', { replace: true })}>소모임 목록으로</Button>
      </div>
    );
  }

  const status = effectiveStatus(group);
  const statusMeta = GROUP_STATUS_META[status];
  const isFull = group.currentMemberCount >= group.maxMembers;
  const isMember = myGroupIds.includes(id);
  const isCreator = group.creatorId === user?.id;
  const isJoined = isMember;
  const canJoin = status === 'recruiting' && !isFull && !isMember && !isCreator;

  const handleLeave = async () => {
    setConfirmLeave(false);
    const owner = user?.id;
    if (await leaveGroup(id) && useAuthStore.getState().user?.id === owner) navigate('/groups', { replace: true });
  };
  const leaveDialog = <ConfirmModal isOpen={confirmLeave} title="소모임에서 나갈까요?" message="다시 참여할 때 모집 상태와 정원에 따라 참여가 제한될 수 있어요." confirmLabel="나가기"
    onCancel={() => setConfirmLeave(false)} onConfirm={handleLeave} />;

  if (blocked.some(user => user.userId === group.creatorId)) return (
    <div className="flex flex-col gap-3 p-6 text-center">
      <p className="text-body2 text-label-alt">차단한 사용자가 만든 소모임이에요.</p>
      <Button onClick={() => navigate('/groups')}>소모임 목록으로</Button>
      <MembershipStatus groupId={id} />
      {isJoined && !isCreator && <Button disabled={waiting || held} variant="assistive" onClick={() => setConfirmLeave(true)}>소모임 나가기</Button>}
      {leaveDialog}
    </div>
  );

  return (
    <div className="group-detail-paper flex min-h-full flex-col gap-4 pb-8">
      {/* 헤더 */}
      <header className="px-4 pt-4 flex items-center gap-2">
        <button onClick={() => navigate('/groups')} aria-label="소모임 목록으로 돌아가기"
          className="paper-control flex h-11 w-11 items-center justify-center text-label-alt hover:text-label transition-colors">
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0 flex-1">

          <h1 className="text-headline1 font-bold text-label-strong break-words">{group.title}</h1>
        </div>
      </header>

      {/* 그룹 정보 */}
      <Card className="group-detail-hero mx-4">
        <div className="flex items-start gap-3 mb-2">
          {group.coverIcon && COVER_ICONS[group.coverIcon] && (
            <div className="relative w-12 h-12 rounded-xl bg-primary-soft flex items-center justify-center flex-shrink-0 shadow-emphasize">
              {(() => { const Icon = COVER_ICONS[group.coverIcon]; return <Icon size={24} strokeWidth={1.9} className="text-primary" />; })()}
              {group.color && <span aria-hidden className="absolute bottom-1 right-1 size-2 rounded-full" style={{ backgroundColor: group.color }} />}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge label={statusMeta.label} color={statusMeta.color} />
            {!group.isPublic && <span className="text-caption2 font-bold text-label-alt">비공개 · 초대 전용</span>}
            {group.category && (
              <span className="text-caption2 font-bold px-2 py-1 rounded-lg bg-fill text-label-alt">
                {GROUP_CATEGORY_LABEL[group.category]}
              </span>
            )}
          </div>
        </div>
        <p className="text-body2 text-label leading-relaxed mb-3">{group.goal}</p>
        <SafetyActions target={{ type: 'group', id, groupId: id, userId: group.creatorId }} />
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-caption1 text-label-alt">
          <span className="flex items-center gap-1">
            <Users size={12} />
            {group.currentMemberCount}/{group.maxMembers}명
          </span>
          <span>
            {format(new Date(group.startDate), 'M.d', { locale: ko })} —{' '}
            {format(new Date(group.endDate), 'M.d', { locale: ko })}
          </span>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-fill-strong" aria-label={`정원 ${Math.min(100, Math.round((group.currentMemberCount / group.maxMembers) * 100))}% 참여`}>
          <div className="crayon-chart-fill h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (group.currentMemberCount / group.maxMembers) * 100)}%` }} />
        </div>

        {group.rules && group.rules.length > 0 && (
          <details className="quiet-details mt-3 border-t border-line-soft" open={!isJoined}>
            <summary>우리의 약속</summary>
            <div className="flex flex-col gap-1.5">
              {group.rules.map(rule => (
                <div key={rule} className="flex items-center gap-2 text-caption1 text-label">
                  <Check size={13} className="text-primary flex-shrink-0" strokeWidth={2.5} />
                  {rule}
                </div>
              ))}
            </div>
          </details>
        )}
      </Card>

      <MembershipStatus groupId={id} />
      <GroupManagement key={`${user?.id}:${id}`} groupId={id} group={group} />
      {isCreator && !group.isPublic && <GroupInvites key={`${user?.id}:${id}`} group={group} />}
      {/* 참여 전 상태 */}
      {canJoin && (
        <div className="px-4">
          <Button fullWidth disabled={waiting || held} onClick={() => void joinGroup(group)}>{phase === 'pending' ? '참여 상태 확인 중…' : '소모임 참여하기'}</Button>
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
            <p className="paper-note text-center text-caption1 text-primary py-2.5 font-medium">
              {isCreator ? '내가 만든 소모임이에요' : '참여 중인 소모임이에요'}
            </p>
          </div>

          <MemberBoard groupId={id} />
          <WeeklyShareFeed groupId={id} />

          {/* 나가기 (방장 제외) */}
          {!isCreator && (
            <div className="px-4 mt-2">
              <button disabled={waiting || held} onClick={() => setConfirmLeave(true)}
                className="w-full flex items-center justify-center gap-1.5 py-3 text-caption1 font-medium text-label-assistive hover:text-negative transition-colors">
                <LogOut size={14} /> 소모임 나가기
              </button>
            </div>
          )}
        </>
      )}
      {leaveDialog}
    </div>
  );
}

/* ════════════════════════════════════════
   멤버 현황판 — 주간률 기준 리더보드
════════════════════════════════════════ */
function MemberBoard({ groupId }: { groupId: string }) {
  const weekStartDay = useSettingsStore(s => s.weekStartDay);
  useLocalNow();
  const { user } = useAuthStore();
  const { data: blocked = [] } = useBlockedUsers();
  const { data: members = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['group-members', groupId, today(), localTimeZone(), weekStartDay],
    queryFn: () => fetchGroupMembers(groupId),
    refetchOnMount: 'always', refetchInterval: 30_000,
  });

  useEffect(() => {
    const refresh = () => { void refetch(); };
    window.addEventListener('onju-outbox-drained', refresh);
    return () => window.removeEventListener('onju-outbox-drained', refresh);
  }, [refetch]);

  const sorted = members.filter(member => !blocked.some(user => user.userId === member.userId)).sort((a, b) => b.weeklyRate - a.weeklyRate);

  return (
    <section className="px-4">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-body2 font-bold text-label-strong flex items-center gap-1.5">
          <BarChart3 size={16} strokeWidth={1.9} /> 멤버 현황판
        </h2>
        <span className="text-caption2 text-label-assistive">주간 기록률 순</span>
      </div>

      <details className="quiet-details mb-3"><summary>통계 기준</summary><p className="px-1 text-caption2 text-label-alt">각 회원의 현지 날짜·주 시작 요일 기준이에요. 예정일별 기록률을 평균하며 완료·대체·쉬어가기를 포함해요. 아직 시간대가 동기화되지 않은 회원은 한국 시간을 사용해요.</p></details>
      {isError ? <div role="alert" className="rounded-xl bg-surface p-4 text-body2">통계를 불러오지 못했어요.<button className="ml-2 min-h-11 text-primary font-bold" onClick={() => void refetch()}>다시 시도</button></div> : isLoading ? (
        <div className="group-detail-card py-10 text-center text-caption1 text-label-assistive">
          불러오는 중…
        </div>
      ) : sorted.length === 0 ? (
        <div className="group-detail-card flex flex-col items-center py-7 text-center">
          <Sprout size={28} strokeWidth={1.9} className="mb-2 text-label-assistive" />
          <p className="text-caption1 font-bold text-label-alt">멤버 기록을 준비하고 있어요</p>
          <p className="mt-1 text-caption2 text-label-assistive">활동이 시작되면 주간 기록률이 보여요</p>
        </div>
      ) : (
        <div className="group-detail-card divide-y divide-line-soft overflow-hidden">
          {sorted.map((m, i) => (
            <div key={m.userId}>
              <MemberRow member={m} rank={i + 1} isMe={m.userId === user?.id} />
              <div className="px-4 text-right"><SafetyActions target={{ type: 'member', id: m.userId, groupId, userId: m.userId }} /></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MemberRow({ member, rank, isMe }: { member: MemberGroupProgress; rank: number; isMe: boolean }) {
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${isMe ? 'bg-primary-soft/45' : ''}`}>
      <span className="w-5 text-center text-caption1 font-bold text-label-assistive flex-shrink-0">
        {medal ?? rank}
      </span>
      <div className="w-10 h-10 rounded-xl border border-primary/15 bg-primary-soft flex items-center justify-center text-label1 font-bold text-primary flex-shrink-0">
        {member.userName[0]}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-body2 font-semibold text-label-strong truncate">
            {member.userName}{isMe && <span className="text-caption2 text-primary font-bold"> (나)</span>}
          </span>
          {member.streak > 0 && (
            <span className="text-caption2 font-bold text-cautionary flex-shrink-0 flex items-center gap-0.5">
              <Flame size={12} strokeWidth={1.9} />{member.streak}
            </span>
          )}
          <span className="ml-auto text-label1 font-bold text-primary tabular-nums flex-shrink-0">{member.weeklyRate}%</span>
        </div>
        <div className="h-1.5 bg-fill-strong rounded-full overflow-hidden">
          <motion.div className="crayon-chart-fill h-full bg-primary rounded-full"
            initial={{ width: 0 }} animate={{ width: `${member.weeklyRate}%` }} transition={{ duration: 0.5 }} />
        </div>
        <p className="text-[10px] text-label-assistive mt-1">
          오늘 개인 {member.todayPersonalRate < 0 ? '예정 없음' : `${member.todayPersonalRate}%`} · 신앙 {member.todayFaithRate < 0 ? '예정 없음' : `${member.todayFaithRate}%`}
        </p>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════
   주간 나눔 피드 + 응원
════════════════════════════════════════ */
function WeeklyShareFeed({ groupId }: { groupId: string }) {
  const { data: blocked = [] } = useBlockedUsers();
  const { data: shares = [], isLoading } = useQuery({
    queryKey: ['group-shares', groupId],
    queryFn: () => fetchWeeklyShares(groupId),
  });

  const sorted = shares.filter(share => !blocked.some(user => user.userId === share.userId)).sort((a, b) => (a.sharedAt < b.sharedAt ? 1 : -1));

  return (
    <section className="px-4">
      <h2 className="text-body2 font-bold text-label-strong mb-2 px-1">주간 나눔</h2>

      {isLoading ? (
        <div className="group-detail-card py-10 text-center text-caption1 text-label-assistive">
          불러오는 중…
        </div>
      ) : sorted.length === 0 ? (
        <div className="group-detail-card flex flex-col items-center text-center px-6 py-8">
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
    <div className="group-detail-card overflow-hidden">
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
            <span className="text-caption2 font-bold px-2 py-0.5 rounded-full bg-faith-soft text-faith">신앙 {share.faithRate}%</span>
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
        <SafetyActions target={{ type: 'weekly_share', id: share.id, groupId: share.groupId, userId: share.userId }} />
        <div className="flex gap-2 border-t border-line-soft pt-3">
          {CHEERS.map(c => (
            <motion.button key={c.key} whileTap={{ scale: 0.88 }} transition={{ duration: 0.1 }}
              onClick={() => toggleCheer(share.id, c.key, share.groupId)}
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
