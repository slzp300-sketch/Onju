import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Check, Share2, Heart, X, Users } from '../icons';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import EmptyState from '../components/ui/EmptyState';
import SegmentedControl from '../components/ui/SegmentedControl';
import { useAuthStore } from '../store/authStore';
import { useGroupStore } from '../store/groupStore';
import { useRoutineStore } from '../store/routineStore';
import { toast } from '../store/toastStore';
import {
  fetchSharedRoutines, fetchTodayProofs, createProof, toggleProofReaction,
  toggleShareCheer, adoptSharedRoutine, shareRoutineToGroups, unshareRoutine,
} from '../api/share';
import { captureProofPhoto } from '../lib/proofCamera';
import { isScheduled } from '../utils/goalProgress';
import { newId } from '../utils/id';
import type { DailyRoutine, ProofReaction, RoutineProof, SharedRoutine } from '../types';

const PROOF_WINDOW_MS = 10 * 60 * 1000; // 체크 후 10분 안에만 인증 촬영
const REACTION_EMOJI: Record<ProofReaction, string> = { heart: '❤️', fire: '🔥', clap: '👏' };

/** 인증 창이 아직 열려 있는지 — 이벤트 핸들러에서 실시간 판정 (렌더 밖) */
function isProofWindowOpen(completedAt: string | undefined): boolean {
  if (!completedAt) return false;
  return Date.now() - new Date(completedAt).getTime() < PROOF_WINDOW_MS;
}

type Tab = 'proof' | 'discover' | 'mine';

export default function RoutineShare() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore(s => s.user);
  const groups = useGroupStore(s => s.groups);
  const { personalRoutines, faithRoutines, logs, toggleRoutineLog, addRoutine } = useRoutineStore();

  const [tab, setTab] = useState<Tab>('proof');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  // 촬영 후 게시 시트: 사진 미리보기 + 메모 + 모임 선택
  const [pendingProof, setPendingProof] = useState<{ routine: DailyRoutine; photo: Blob; previewUrl: string } | null>(null);
  const [proofNote, setProofNote] = useState('');
  const [proofGroupIds, setProofGroupIds] = useState<string[]>([]);
  // 공유 시트: 모임 선택
  const [sharingRoutine, setSharingRoutine] = useState<DailyRoutine | null>(null);
  const [shareGroupIds, setShareGroupIds] = useState<string[]>([]);
  // 10분 카운트다운용 현재 시각 (렌더 순수성 위해 state로 관리, 창이 열려 있을 때만 틱)
  const [now, setNow] = useState(() => Date.now());

  const myUserId = user?.id ?? '';
  const myGroupIds = useMemo(() => groups.map(g => g.id), [groups]);
  const todayIso = format(new Date(), 'yyyy-MM-dd');

  const filteredGroupIds = groupFilter === 'all' ? myGroupIds : [groupFilter];

  const proofsQuery = useQuery({
    queryKey: ['proofs', todayIso, myGroupIds],
    queryFn: () => fetchTodayProofs(myGroupIds, todayIso, myUserId),
    enabled: myGroupIds.length > 0,
  });
  const sharesQuery = useQuery({
    queryKey: ['shared-routines', myGroupIds],
    queryFn: () => fetchSharedRoutines(myGroupIds, myUserId),
    enabled: myGroupIds.length > 0,
  });
  const proofs = useMemo(() => proofsQuery.data ?? [], [proofsQuery.data]);
  const shares = sharesQuery.data ?? [];

  const invalidateProofs = () => queryClient.invalidateQueries({ queryKey: ['proofs'] });
  const invalidateShares = () => queryClient.invalidateQueries({ queryKey: ['shared-routines'] });

  // ── 오늘 인증 대상: 오늘 예정된 활성 루틴 ──
  const todayRoutines = useMemo(
    () => [...personalRoutines, ...faithRoutines]
      .filter(r => r.isActive && isScheduled(todayIso, r.frequency)),
    [personalRoutines, faithRoutines, todayIso],
  );
  const logFor = (routineId: string) =>
    logs.find(l => l.routineId === routineId && l.date === todayIso);
  const myProofFor = (routineId: string) =>
    proofs.find(p => p.userId === myUserId && p.routineId === routineId);
  const proofWindowLeft = (routine: DailyRoutine): number => {
    const log = logFor(routine.id);
    if (!log?.completed || !log.completedAt) return 0;
    const left = PROOF_WINDOW_MS - (now - new Date(log.completedAt).getTime());
    return Math.min(PROOF_WINDOW_MS, Math.max(0, left));
  };

  // 카운트다운이 하나라도 살아 있는 동안만 1초 틱
  const anyWindowOpen = todayRoutines.some(r => proofWindowLeft(r) > 0 && !myProofFor(r.id));
  useEffect(() => {
    if (!anyWindowOpen) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyWindowOpen]);

  // ── 뮤테이션 ──
  const postProofMutation = useMutation({
    mutationFn: async () => {
      if (!pendingProof) return;
      await createProof({
        myUserId,
        routine: pendingProof.routine,
        photo: pendingProof.photo,
        note: proofNote.trim(),
        groupIds: proofGroupIds,
      });
    },
    onSuccess: () => {
      closeProofSheet();
      toast.success('인증 완료! 모임 보드에 올라갔어요 ✓⁺');
      invalidateProofs();
    },
  });
  const reactionMutation = useMutation({
    mutationFn: ({ proof, emoji }: { proof: RoutineProof; emoji: ProofReaction }) =>
      toggleProofReaction(proof.id, emoji, !proof.myReactions[emoji], myUserId),
    onSuccess: invalidateProofs,
  });
  const cheerMutation = useMutation({
    mutationFn: (share: SharedRoutine) => toggleShareCheer(share.id, !share.cheeredByMe, myUserId),
    onSuccess: invalidateShares,
  });
  const adoptMutation = useMutation({
    mutationFn: async (share: SharedRoutine) => {
      await adoptSharedRoutine(share.id);
      addRoutine({
        id: newId(), userId: '',
        type: share.kind, title: share.title, emoji: share.emoji,
        when: share.when || undefined,
        frequency: 'daily', isActive: true,
        order: (share.kind === 'personal' ? personalRoutines : faithRoutines).length,
        createdAt: new Date().toISOString(),
      });
    },
    onSuccess: () => { toast.success('내 루틴에 담았어요 🌱'); invalidateShares(); },
  });
  const shareMutation = useMutation({
    mutationFn: async () => {
      if (!sharingRoutine) return;
      const steps = sharingRoutine.twoMinuteHabit ? [sharingRoutine.twoMinuteHabit] : [];
      await shareRoutineToGroups(sharingRoutine, steps, shareGroupIds);
    },
    onSuccess: () => {
      setSharingRoutine(null);
      toast.success('모임에 공유했어요 ✨');
      invalidateShares();
    },
  });
  const unshareMutation = useMutation({
    mutationFn: (shareId: string) => unshareRoutine(shareId),
    onSuccess: () => { toast.info('공유를 취소했어요'); invalidateShares(); },
  });

  // ── 인증 촬영 플로우 ──
  const startProofCapture = async (routine: DailyRoutine) => {
    const photo = await captureProofPhoto();
    if (!photo) return; // 촬영 취소
    if (!isProofWindowOpen(logFor(routine.id)?.completedAt)) {
      toast.error('인증 시간이 지났어요. 다음 체크 때 다시 찍어보세요!');
      return;
    }
    setProofNote('');
    setProofGroupIds(myGroupIds);
    setPendingProof({ routine, photo, previewUrl: URL.createObjectURL(photo) });
  };
  const closeProofSheet = () => {
    if (pendingProof) URL.revokeObjectURL(pendingProof.previewUrl);
    setPendingProof(null);
  };

  const groupName = (id: string) => groups.find(g => g.id === id)?.title ?? '';
  const fmtLeft = (ms: number) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  // 소모임이 없으면 인증/공유 대상이 없다
  if (groups.length === 0) {
    return (
      <div className="share-paper flex flex-col min-h-full">
        <Header />
        <div className="px-4 pt-10">
          <EmptyState
            title="아직 참여 중인 소모임이 없어요"
            description="루틴 인증과 공유는 소모임 안에서 이루어져요"
          />
          <button
            onClick={() => navigate('/groups')}
            className="mt-4 mx-auto flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white text-body2 font-bold rounded-xl"
          >
            <Users size={15} /> 소모임 둘러보기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="share-paper flex flex-col min-h-full">
      <Header />

      {/* 그룹 필터 칩 */}
      {groups.length > 1 && tab !== 'mine' && (
        <div className="flex gap-1.5 px-4 pt-1 overflow-x-auto">
          {[{ id: 'all', title: '전체' }, ...groups].map(g => (
            <button
              key={g.id}
              onClick={() => setGroupFilter(g.id)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-caption1 font-bold border transition-colors ${
                groupFilter === g.id
                  ? 'bg-label-strong text-white border-label-strong'
                  : 'bg-surface text-label-alt border-line'
              }`}
            >
              {g.title}
            </button>
          ))}
        </div>
      )}

      {/* 탭 */}
      <SegmentedControl
        value={tab}
        onChange={setTab}
        label="루틴 공유 항목"
        variant="underline"
        className="px-4 mt-2"
        items={[
          { value: 'proof', label: '오늘 인증' },
          { value: 'discover', label: '루틴 발견' },
          { value: 'mine', label: '내 공유' },
        ]}
      />

      {/* ── 오늘 인증 ── */}
      {tab === 'proof' && (
        <div className="flex flex-col gap-3 px-4 py-4 pb-24">
          <p className="text-caption1 font-semibold text-label-assistive">내 루틴 — 체크하면 인증이 열려요</p>
          <div className="bg-surface border border-line-soft rounded-2xl px-4 divide-y divide-line-soft">
            {todayRoutines.length === 0 && (
              <p className="text-caption1 text-label-assistive py-6 text-center">오늘 예정된 루틴이 없어요</p>
            )}
            {todayRoutines.map(r => {
              const log = logFor(r.id);
              const proved = !!myProofFor(r.id);
              const left = proofWindowLeft(r);
              return (
                <div key={r.id} className="flex items-center gap-2.5 py-3">
                  <span className="text-lg">{r.emoji ?? '🌱'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-body2 font-bold text-label-strong truncate">{r.title}</p>
                    {r.when && <p className="text-caption2 text-label-alt">{r.when}</p>}
                  </div>
                  {proved ? (
                    <span className="flex items-center gap-1 text-caption1 font-bold text-positive bg-fill px-2.5 py-1.5 rounded-full flex-shrink-0">
                      ✓⁺ 인증됨
                    </span>
                  ) : log?.completed && left > 0 ? (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => void startProofCapture(r)}
                      className="flex items-center gap-1.5 text-caption1 font-bold text-white bg-cautionary px-3 py-2 rounded-xl flex-shrink-0"
                    >
                      <Camera size={13} /> 인증 <span className="tabular-nums opacity-85">{fmtLeft(left)}</span>
                    </motion.button>
                  ) : null}
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => toggleRoutineLog(r.id)}
                    aria-label={`${r.title} 체크`}
                    className={`w-8 h-8 rounded-xl border flex items-center justify-center flex-shrink-0 transition-colors ${
                      log?.completed ? 'bg-primary border-primary text-white' : 'border-line text-transparent'
                    }`}
                  >
                    <Check size={15} strokeWidth={3} />
                  </motion.button>
                </div>
              );
            })}
          </div>

          <p className="text-caption1 font-semibold text-label-assistive mt-2">오늘의 모임 인증 보드</p>
          {proofsQuery.isLoading ? (
            <p className="text-caption1 text-label-assistive text-center py-8">불러오는 중…</p>
          ) : (
            (() => {
              const list = proofs.filter(p => filteredGroupIds.includes(p.groupId));
              if (list.length === 0) {
                return (
                  <p className="text-caption1 text-label-assistive text-center py-6 leading-relaxed">
                    아직 오늘 인증이 없어요.<br />첫 인증의 주인공이 되어보세요 📸
                  </p>
                );
              }
              return (
                <div className="grid grid-cols-2 gap-2.5">
                  {list.map(p => (
                    <ProofCard key={p.id} proof={p}
                      onReact={emoji => reactionMutation.mutate({ proof: p, emoji })} />
                  ))}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ── 루틴 발견 ── */}
      {tab === 'discover' && (
        <div className="flex flex-col gap-3 px-4 py-4 pb-24">
          {sharesQuery.isLoading ? (
            <p className="text-caption1 text-label-assistive text-center py-8">불러오는 중…</p>
          ) : (
            (() => {
              const list = shares.filter(s => filteredGroupIds.includes(s.groupId));
              if (list.length === 0) {
                return (
                  <EmptyState
                    title="아직 공유된 루틴이 없어요"
                    description="'내 공유' 탭에서 내 루틴을 모임에 공유해 보세요"
                  />
                );
              }
              return list.map(s => (
                <SharedRoutineCard key={s.id} share={s} mine={s.userId === myUserId}
                  groupTitle={groupName(s.groupId)}
                  onCheer={() => cheerMutation.mutate(s)}
                  onAdopt={() => adoptMutation.mutate(s)} />
              ));
            })()
          )}
        </div>
      )}

      {/* ── 내 공유 ── */}
      {tab === 'mine' && (
        <div className="flex flex-col gap-3 px-4 py-4 pb-24">
          <p className="text-caption1 text-label-alt leading-relaxed">
            내 루틴을 모임에 공유하면 서로에게 영감이 돼요. 공유한 뒤에도 원본 루틴은 자유롭게 수정할 수 있어요.
          </p>
          {[...personalRoutines, ...faithRoutines].filter(r => r.isActive).map(r => {
            const myShares = shares.filter(s => s.userId === myUserId && s.sourceRoutineId === r.id);
            return (
              <div key={r.id} className="bg-surface border border-line-soft rounded-2xl px-4 py-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{r.emoji ?? '🌱'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-body2 font-bold text-label-strong truncate">{r.title}</p>
                    {r.when && <p className="text-caption2 text-label-alt">{r.when}</p>}
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => { setSharingRoutine(r); setShareGroupIds(myGroupIds.filter(id => !myShares.some(s => s.groupId === id))); }}
                    className="flex items-center gap-1.5 text-caption1 font-bold text-white bg-primary px-3 py-2 rounded-xl flex-shrink-0 disabled:opacity-35"
                    disabled={myShares.length >= groups.length}
                  >
                    <Share2 size={12} /> 공유
                  </motion.button>
                </div>
                {myShares.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {myShares.map(s => (
                      <span key={s.id} className="flex items-center gap-1 text-caption2 font-bold text-positive bg-fill pl-2.5 pr-1.5 py-1 rounded-full">
                        ✓ {groupName(s.groupId)}
                        <button aria-label="공유 취소" onClick={() => unshareMutation.mutate(s.id)}
                          className="text-label-assistive hover:text-negative p-0.5"><X size={11} /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 인증 게시 시트 ── */}
      <SheetShell open={!!pendingProof} onClose={closeProofSheet}>
        {pendingProof && (
          <>
            <h3 className="text-headline1 font-bold text-label-strong">
              {pendingProof.routine.emoji ?? '🌱'} {pendingProof.routine.title} 인증
            </h3>
            <img src={pendingProof.previewUrl} alt="인증 사진 미리보기"
              className="mt-3 w-full rounded-2xl object-cover aspect-square" />
            <input
              value={proofNote} onChange={e => setProofNote(e.target.value)} maxLength={40}
              placeholder="한 줄 메모 (선택)"
              className="mt-3 w-full border border-line rounded-xl px-3.5 py-2.5 text-body2 bg-surface placeholder:text-label-assistive"
            />
            {groups.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {groups.map(g => {
                  const on = proofGroupIds.includes(g.id);
                  return (
                    <button key={g.id}
                      onClick={() => setProofGroupIds(ids => on ? ids.filter(i => i !== g.id) : [...ids, g.id])}
                      className={`px-3 py-1.5 rounded-full text-caption1 font-bold border transition-colors ${
                        on ? 'bg-primary text-white border-primary' : 'bg-surface text-label-alt border-line'
                      }`}
                    >
                      {g.title}
                    </button>
                  );
                })}
              </div>
            )}
            <button
              onClick={() => postProofMutation.mutate()}
              disabled={proofGroupIds.length === 0 || postProofMutation.isPending}
              className="mt-4 w-full bg-primary text-white text-body2 font-bold py-3 rounded-xl disabled:opacity-35"
            >
              {postProofMutation.isPending ? '올리는 중…' : '모임 보드에 올리기'}
            </button>
            <p className="text-caption2 text-label-assistive text-center mt-2.5">사진은 모임원에게만 보여요</p>
          </>
        )}
      </SheetShell>

      {/* ── 루틴 공유 시트 ── */}
      <SheetShell open={!!sharingRoutine} onClose={() => setSharingRoutine(null)}>
        {sharingRoutine && (
          <>
            <h3 className="text-headline1 font-bold text-label-strong">어느 모임에 공유할까요?</h3>
            <p className="text-caption1 text-label-alt mt-1">{sharingRoutine.emoji ?? '🌱'} {sharingRoutine.title}</p>
            <div className="mt-2">
              {groups.map(g => {
                const alreadyShared = shares.some(s => s.userId === myUserId && s.sourceRoutineId === sharingRoutine.id && s.groupId === g.id);
                const on = shareGroupIds.includes(g.id);
                return (
                  <button key={g.id} disabled={alreadyShared}
                    onClick={() => setShareGroupIds(ids => on ? ids.filter(i => i !== g.id) : [...ids, g.id])}
                    className="w-full flex items-center gap-3 py-3 border-b border-line-soft text-left disabled:opacity-45"
                  >
                    <span className="flex-1 text-body2 font-semibold text-label-strong">{g.title}</span>
                    {alreadyShared ? (
                      <span className="text-caption2 font-bold text-label-assistive">공유됨</span>
                    ) : (
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center text-white transition-colors ${
                        on ? 'bg-primary border-primary' : 'border-line'
                      }`}><Check size={12} strokeWidth={3} /></span>
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => shareMutation.mutate()}
              disabled={shareGroupIds.length === 0 || shareMutation.isPending}
              className="mt-4 w-full bg-primary text-white text-body2 font-bold py-3 rounded-xl disabled:opacity-35"
            >
              {shareMutation.isPending ? '공유하는 중…' : '공유하기'}
            </button>
          </>
        )}
      </SheetShell>
    </div>
  );
}

function Header() {
  return (
    <div className="px-4 pt-5 pb-1">
      <h1 className="text-heading2 font-bold text-label-strong font-brand">루틴 공유</h1>
      <p className="text-caption1 text-label-alt mt-0.5">우리 모임의 오늘이 쌓이는 곳</p>
    </div>
  );
}

function ProofCard({ proof, onReact }: { proof: RoutineProof; onReact: (emoji: ProofReaction) => void }) {
  return (
    <div className="bg-surface border border-line-soft rounded-2xl overflow-hidden">
      <div className="relative aspect-square bg-fill">
        {proof.photoUrl && (
          <img src={proof.photoUrl} alt={`${proof.userName}의 ${proof.routineTitle} 인증`}
            className="w-full h-full object-cover" loading="lazy" />
        )}
        <span className="absolute bottom-1.5 left-1.5 right-1.5 text-[10px] font-bold text-white bg-label-strong/60 px-2 py-1 rounded-lg truncate">
          {proof.routineEmoji ?? ''} {proof.routineTitle}
        </span>
      </div>
      <div className="px-2.5 py-2">
        <div className="flex items-center gap-1.5">
          <p className="text-caption2 font-bold text-label-strong truncate flex-1">{proof.userName}</p>
          <p className="text-[10px] text-label-assistive tabular-nums">{format(new Date(proof.createdAt), 'HH:mm')}</p>
        </div>
        {proof.note && <p className="text-caption2 text-label-alt mt-1 line-clamp-2">{proof.note}</p>}
        <div className="flex gap-1 mt-1.5">
          {(Object.keys(REACTION_EMOJI) as ProofReaction[]).map(emoji => {
            const n = proof.reactions[emoji];
            const on = proof.myReactions[emoji];
            return (
              <button key={emoji} onClick={() => onReact(emoji)}
                className={`text-[10px] font-bold px-2 py-1 rounded-full transition-colors ${
                  on ? 'bg-primary-soft text-primary-strong' : 'bg-fill text-label-alt'
                }`}
              >
                {REACTION_EMOJI[emoji]}{n > 0 ? ` ${n}` : ''}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SharedRoutineCard({ share, mine, groupTitle, onCheer, onAdopt }: {
  share: SharedRoutine; mine: boolean; groupTitle: string;
  onCheer: () => void; onAdopt: () => void;
}) {
  return (
    <div className="bg-surface border border-line-soft rounded-2xl overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line-soft">
        <div className="w-8 h-8 rounded-full bg-primary-soft flex items-center justify-center text-primary text-caption1 font-bold flex-shrink-0">
          {share.userName.slice(0, 1)}
        </div>
        <p className="flex-1 text-caption2 font-semibold text-label-strong truncate">{share.userName}</p>
        <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${
          share.kind === 'faith' ? 'text-faith bg-faith-soft' : 'text-primary-strong bg-primary-soft'
        }`}>{groupTitle}</span>
      </div>
      <div className="px-4 pt-3 pb-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xl">{share.emoji ?? '🌱'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-label1 font-bold text-label-strong truncate">{share.title}</p>
            <p className="text-caption2 text-label-alt">
              {share.when || '시간 자유'}
              {share.weeklyProofCount > 0 && (
                <span className="text-positive font-bold"> · ✓⁺ 이번 주 인증 {share.weeklyProofCount}회</span>
              )}
            </p>
          </div>
        </div>
        {share.steps.length > 0 && (
          <div className="flex flex-col gap-1 mt-2 ml-1">
            {share.steps.map((st, i) => (
              <p key={i} className="text-caption1 text-label">
                <span className="text-caption2 font-bold text-label-assistive mr-1.5">{i + 1}</span>{st}
              </p>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line-soft mt-2.5 pt-2.5">
          <button onClick={onCheer}
            className={`flex items-center gap-1.5 text-caption1 font-bold transition-colors ${
              share.cheeredByMe ? 'text-negative' : 'text-label-alt'
            }`}
          >
            <Heart size={13} fill={share.cheeredByMe ? 'currentColor' : 'none'} />
            {share.cheerCount}
          </button>
          <span className="text-caption2 text-label-assistive">
            {share.adoptCount > 0 ? `${share.adoptCount}명이 담아갔어요` : ''}
          </span>
          {mine ? (
            <span className="text-caption2 font-bold text-label-assistive">내 공유</span>
          ) : (
            <motion.button whileTap={{ scale: 0.95 }} onClick={onAdopt}
              className="text-caption1 font-bold text-white bg-primary px-3 py-1.5 rounded-xl">
              담아가기
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 하단 시트 공통 셸 */
function SheetShell({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/40 z-50" onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 38 }}
            className="fixed left-0 right-0 bottom-0 z-50 bg-surface rounded-t-3xl px-5 pt-5 pb-7 max-w-lg mx-auto"
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
