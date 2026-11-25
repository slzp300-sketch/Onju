import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useGoalStore } from '../store/goalStore';
import { goalSyncEntries, resolveGoalEntries, isGoalDeletion, type WriteOp } from '../lib/sync/outbox';
import { monthlyGoalDeletion } from '../data/repos';
import { supabase, supabaseForSession } from '../lib/supabase';
import { monthlyGoalFromRow, monthlyGoalToRow } from '../data/mappers';
import { newId } from '../utils/id';
import { goalPeriodError } from '../utils/goalRules';
import { today } from '../utils/date';
import type { MonthlyGoal } from '../types';
import Button from '../components/ui/Button';
import OverlayDialog from '../components/ui/OverlayDialog';
import GoalEditImpact from '../components/goals/GoalEditImpact';
import { toast } from '../store/toastStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { useLocalNow } from '../hooks/useLocalNow';

function subscribe(change: () => void) {
  window.addEventListener('onju-outbox-changed', change);
  return () => window.removeEventListener('onju-outbox-changed', change);
}

function GoalContent({ goal, label }: { goal: MonthlyGoal; label: string }) {
  return <section aria-label={label} className="rounded-xl border border-line bg-surface p-4 break-words">
    <h2 className="text-body2 font-bold text-primary">{label}</h2>
    <p className="mt-2 font-bold">{goal.title}</p>
    <p className="mt-1 text-caption1">{goal.category === 'faith' ? '신앙' : '개인'} · {goal.startDate} ~ {goal.endDate}</p>
    {goal.toBeStatement && goal.toBeStatement !== goal.title && <p className="mt-2">{goal.toBeStatement}</p>}
    {goal.description && <p className="mt-2 whitespace-pre-wrap">{goal.description}</p>}
    <p className="mt-2 text-caption1 text-label-alt flex flex-wrap items-center gap-1">상태: {goal.status === 'active' ? '진행 중' : goal.status === 'completed' ? '완료' : '미달성'} · 색상: {goal.color ? <><span className="inline-block w-4 h-4 rounded-full border border-line" style={{ backgroundColor: goal.color }} />지정색</> : '기본'}</p>
    <ul className="mt-2 space-y-2 text-caption1">{goal.goalRoutines?.map((plan, index) => <li key={index}>
      <p className="font-semibold">계획 {index + 1}. {plan.title}</p>
      {[plan.when, plan.where, plan.miniRoutine, plan.twoMinuteHabit].filter(Boolean).map((text, i) => <p key={i}>{text}</p>)}
    </li>)}</ul>
    {!goal.goalRoutines?.length && <p className="mt-2 text-caption1 text-label-alt">작성한 실천 계획 없음</p>}
  </section>;
}

export default function GoalConflicts() {
  const owner = useAuthStore(s => s.user?.id ?? '');
  return <GoalConflictsForOwner key={owner} owner={owner} />;
}

function GoalConflictsForOwner({ owner }: { owner: string }) {
  useLocalNow();
  const { habits, habitLogs } = useHabitStore();
  const { faithRoutines, personalRoutines, logs } = useRoutineStore();
  const navigate = useNavigate();
  const snapshot = useCallback(() => JSON.stringify(goalSyncEntries(owner)), [owner]);
  const serialized = useSyncExternalStore(subscribe, snapshot);
  const entries = JSON.parse(serialized) as ReturnType<typeof goalSyncEntries>;
  const [selected, setSelected] = useState<string>();
  const gid = selected && entries.some(e => e.goalId === selected) ? selected : entries[0]?.goalId;
  const group = entries.filter(e => e.goalId === gid);
  const signature = JSON.stringify(group);
  const { monthlyGoals, goalSlots } = useGoalStore();
  const [reload, setReload] = useState(0);
  const [remote, setRemote] = useState<{ signature: string; goal: MonthlyGoal | null }>();
  const [error, setError] = useState('');
  const [confirmation, setConfirmation] = useState<{ action: 'server' | 'mine' | 'delete'; signature: string; revision?: string; reload: number; impact: string }>();

  useEffect(() => {
    if (!gid) return;
    let active = true;
    const current = () => active && useAuthStore.getState().user?.id === owner;
    void (async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError || !data.session || data.session.user.id !== owner) throw new Error('로그인 상태를 확인해주세요.');
        if (!navigator.onLine) throw new Error('인터넷에 연결한 뒤 서버 내용을 확인해주세요. 입력은 이 기기에 남아 있어요.');
        const result = await supabaseForSession(data.session.access_token).from('monthly_goals').select('*').eq('id', gid).eq('user_id', owner).maybeSingle();
        if (result.error) throw result.error;
        if (current()) { setRemote({ signature, goal: result.data ? monthlyGoalFromRow(result.data) : null }); setError(''); }
      } catch { if (current()) { setRemote(undefined); setError('서버 내용을 확인하지 못했어요. 연결 상태를 확인하고 다시 불러와주세요. 입력은 기기에 남아 있어요.'); } }
    })();
    return () => { active = false; };
  }, [gid, owner, signature, reload]);

  const ready = remote?.signature === signature && !error;
  const current = ready ? remote.goal : null;
  const local = monthlyGoals.find(g => g.id === gid);
  const baseRow = local ? monthlyGoalToRow(local) : current ? monthlyGoalToRow(current) : {};
  const values = group.reduce((row, entry) => {
    const op = entry.op;
    if (op.type === 'rpc' && op.goalSnapshot) return { ...row, ...op.goalSnapshot };
    if (op.type === 'rpc' && op.fn === 'save_monthly_goal') return { ...row, ...op.args.goal_values as Record<string, unknown> };
    if ('values' in op) return { ...row, ...op.values };
    return row;
  }, baseRow);
  const mine = gid ? monthlyGoalFromRow({ ...values, id: gid, user_id: owner }) : undefined;
  const deleting = group.some(e => isGoalDeletion(e.op));
  const requestedDate = group.flatMap(e => e.op.type === 'rpc' && isGoalDeletion(e.op) && typeof e.op.args.effective_date === 'string' ? [e.op.args.effective_date] : []).at(-1);
  const linkedCount = [...habits, ...faithRoutines, ...personalRoutines].filter(item => item.goalId === gid || ('monthlyGoalId' in item && item.monthlyGoalId === gid)).length;
  const validMine = mine && !!mine.title?.trim() && !goalPeriodError(mine.startDate, mine.endDate);
  const room = current || !mine || mine.endDate < today() || monthlyGoals.filter(g => g.id !== gid && g.endDate >= today()).length < goalSlots;
  const impact = JSON.stringify({ mine, current, habits, habitLogs, faithRoutines, personalRoutines, logs, date: today() });
  const confirmationValid = ready && confirmation?.signature === signature && confirmation.revision === current?.revision && confirmation.reload === reload && confirmation.impact === impact;
  const confirm = (action: 'server' | 'mine' | 'delete') => setConfirmation({ action, signature, revision: current?.revision, reload, impact });
  const apply = () => {
    if (!confirmationValid || !gid || !mine || useAuthStore.getState().user?.id !== owner) return;
    try {
      let next: MonthlyGoal | null = current;
      let op: WriteOp = { type: 'goal-accept', goalId: gid, current: current ? { ...monthlyGoalToRow(current), revision: current.revision, user_id: owner } : null };
      if (confirmation.action === 'mine') {
        if (!validMine || !room || deleting) return;
        next = { ...mine, id: current?.id ?? newId(), revision: newId(), createdAt: current?.createdAt ?? new Date().toISOString() };
        op = { type: 'rpc', fn: 'save_monthly_goal', args: { gid: next.id, request_id: next.revision, expected_revision: current?.revision ?? null,
          creating: !current, goal_values: monthlyGoalToRow(next) } };
      }
      if (confirmation.action === 'delete') {
        if (!current?.revision || !deleting) return;
        op = monthlyGoalDeletion(current, today());
      }
      resolveGoalEntries(owner, signature, gid, op);
      useGoalStore.setState(s => ({ monthlyGoals: [...s.monthlyGoals.filter(g => g.id !== gid), ...(next ? [next] : [])] }));
      setConfirmation(undefined);
      toast.success(confirmation.action === 'server' ? '확인한 서버 내용을 사용해요.' : confirmation.action === 'delete' ? '최신 버전을 기준으로 삭제를 요청했어요. 서버 확인 전까지 목표와 연결을 유지해요.' : '변경을 기기에 보관했어요. 서버 버전을 다시 확인하며 저장해요.');
    } catch { toast.error('복구 내용을 보관하지 못했거나 입력이 바뀌었어요. 다시 불러와 확인해주세요.'); }
  };

  return <div className="records-paper min-h-full px-4 pt-5 pb-8 space-y-4">
    <button className="min-h-11 text-primary font-bold" onClick={() => navigate('/goals')}>목표 관리로</button>
    <h1 className="text-heading2 font-bold">목표 요청 충돌 확인</h1>
    {!gid ? <><p>확인할 목표 충돌이 없어요.</p><p className="text-body2 text-label-alt">저장 대기 중인 변경은 연결되면 전송해요.</p></> : <>
      <p className="text-body2 text-label-alt">다른 기기의 수정·삭제 또는 구버전 저장 요청을 확인해야 해요. 내 입력은 기기에 남아 있고, 다른 실천 기록은 계속 저장돼요.</p>
      <label className="block text-body2 font-semibold">확인할 목표
        <select aria-label="충돌 목표 선택" value={gid} onChange={e => { setSelected(e.target.value); setConfirmation(undefined); }} className="mt-2 w-full min-h-11 rounded-xl border border-line bg-surface px-3">
          {[...new Set(entries.map(e => e.goalId))].map(id => <option key={id} value={id}>{monthlyGoals.find(g => g.id === id)?.title ?? '보관된 목표 입력'}</option>)}
        </select>
      </label>
      <Button variant="assistive" onClick={() => { setRemote(undefined); setError(''); setReload(n => n + 1); }}>서버 내용 다시 불러오기</Button>
      {error && <p role="alert" className="text-body2 text-negative">{error}</p>}
      {!ready && !error && <p role="status">서버 내용을 확인하고 있어요…</p>}
      {ready && (current ? <GoalContent goal={current} label="서버에 저장된 내용" /> : <p role="status" className="rounded-xl bg-primary-soft p-4">서버에 이 목표가 없어요. {deleting ? '추가 삭제 없이 기기에 남은 요청만 정리할 수 있어요.' : '삭제된 목표를 자동으로 되살리지 않아요. 입력을 살리려면 새 목표로 복사할 수 있어요.'}</p>)}
      {mine && validMine && <GoalContent goal={mine} label={deleting ? '기기에 보관된 삭제 대상' : '이 기기에 남긴 입력'} />}
      {deleting && <p className="rounded-xl border border-line p-4 text-body2">삭제를 멈췄어요.{requestedDate && ` 이전 요청 적용일: ${requestedDate}.`} 최신 목표를 유지하거나 다시 삭제할 수 있어요. 다시 삭제하면 {today()}부터 현재 연결을 해제해요. 함께 보류된 수정 입력도 이 선택으로 정리돼요.</p>}
      {!validMine && !deleting && <p className="text-body2 text-negative">입력의 이름·기간을 확인해야 해요. 위 내용을 복사해 둔 뒤 목표 관리에서 다시 작성해주세요.</p>}
      {!room && <p className="text-body2 text-label-alt">진행 중 목표가 가득 찼어요. 다른 목표를 정리한 뒤 새 목표로 복사할 수 있어요.</p>}
      {!deleting && <Button className="w-full" disabled={!ready || !validMine || !room} onClick={() => confirm('mine')}>{current ? '내 입력으로 다시 저장' : '새 목표로 복사'}</Button>}
      <Button variant={deleting ? 'primary' : 'assistive'} className="w-full" disabled={!ready} onClick={() => confirm('server')}>{deleting ? current ? '삭제 취소 · 최신 목표 유지' : '이미 삭제된 목표 정리' : '서버 내용 사용'}</Button>
      {deleting && current && <Button variant="danger" className="w-full" disabled={!ready || !current.revision} onClick={() => confirm('delete')}>최신 목표 확인 후 삭제</Button>}
    </>}
    <OverlayDialog isOpen={!!confirmation} onClose={() => setConfirmation(undefined)} labelledBy="goal-conflict-title" className="p-4">
      <h2 id="goal-conflict-title" className="text-headline1 font-bold">{confirmation?.action === 'delete' ? '최신 목표만 삭제할까요?' : confirmation?.action === 'server' ? '기기에 남긴 요청을 정리할까요?' : current ? '내 입력으로 다시 저장할까요?' : '새 목표로 복사할까요?'}</h2>
      <p className="mt-3 text-body2">{confirmation?.action === 'delete' ? `‘${current?.title}’ 목표와 연결된 습관·루틴 ${linkedCount}개의 현재 연결을 ${today()}부터 해제해요. 목표의 상세·진척 화면은 다시 볼 수 없어요. 서버 내용이 다시 바뀌면 삭제를 멈춰요.` : confirmation?.action === 'server' ? '이 목표의 저장 대기 입력을 버리고 확인한 서버 내용을 사용해요. 보류된 삭제 요청도 취소해요. 서버에서 삭제됐다면 이 기기에서도 목표만 정리해요.' : current ? '위에서 비교한 내 입력의 이름·분류·기간·색상·계획을 저장해요. 서버 내용이 다시 바뀌면 덮어쓰지 않고 다시 확인해요.' : '새 목표에 입력만 복사해요. 기존 습관이나 과거 기록을 자동으로 연결하지 않아요.'}</p>
      <p className="mt-2 text-caption1 text-label-alt">습관·루틴·주간 목표·보관 상태와 과거 수행 기록은 보존해요.</p>
      {confirmation?.action === 'mine' && current && mine && <div className="mt-3"><GoalEditImpact before={current} after={mine} /></div>}
      {!confirmationValid && <p role="alert" className="mt-3 text-negative">확인할 내용이 바뀌었어요. 취소 후 다시 확인해주세요.</p>}
      <div className="mt-4 flex gap-2"><Button size="md" className="flex-1 px-2" variant="assistive" onClick={() => setConfirmation(undefined)}>취소</Button>
        <Button size="md" className="flex-1 px-1 whitespace-nowrap" disabled={!confirmationValid} onClick={apply}>확인하고 적용</Button></div>
    </OverlayDialog>
  </div>;
}
