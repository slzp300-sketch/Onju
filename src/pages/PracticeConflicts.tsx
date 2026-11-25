import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { useGoalStore } from '../store/goalStore';
import { practiceSyncEntries, resolvePracticeEntries, type WriteOp } from '../lib/sync/outbox';
import { supabase, supabaseForSession } from '../lib/supabase';
import { habitFromRow, habitToRow, routineFromRow, routineToRow } from '../data/mappers';
import { practiceWrite } from '../data/practiceWrites';
import { newId } from '../utils/id';
import { today } from '../utils/date';
import { withHistory } from '../utils/scheduleHistory';
import type { Habit, DailyRoutine } from '../types';
import Button from '../components/ui/Button';
import OverlayDialog from '../components/ui/OverlayDialog';
import { toast } from '../store/toastStore';
import { useLocalNow } from '../hooks/useLocalNow';

type Item = Habit | DailyRoutine;
function subscribe(change: () => void) { window.addEventListener('onju-outbox-changed', change); return () => window.removeEventListener('onju-outbox-changed', change); }
const toRow = (item: Item) => 'isActive' in item ? routineToRow(item) : habitToRow(item);
const archived = (item: Item) => !!item.archivedAt || ('isActive' in item && !item.isActive);
function valid(item: Item | undefined) {
  if (!item?.title?.trim()) return false;
  const days = Array.isArray(item.frequency) ? item.frequency : item.frequency === 'custom' && 'customDays' in item ? item.customDays : undefined;
  return days ? days.length > 0 && days.every(d => Number.isInteger(d) && d >= 0 && d <= 6) : ['daily','weekdays','weekends'].includes(String(item.frequency));
}
function Content({ item, label }: { item: Item; label: string }) {
  const goals = useGoalStore(s => s.monthlyGoals);
  const days = Array.isArray(item.frequency) ? item.frequency : 'customDays' in item && item.frequency === 'custom' ? item.customDays : undefined;
  const frequency = days ? days.map(d => ['일','월','화','수','목','금','토'][d]).join('·') : ({ daily: '매일', weekdays: '평일', weekends: '주말' } as Record<string,string>)[String(item.frequency)];
  return <section aria-label={label} className="rounded-xl border border-line bg-surface p-4 break-words space-y-2">
    <h2 className="font-bold text-primary">{label}</h2><p className="font-bold">{item.emoji} {item.title}</p>
    <p className="text-body2">{'isActive' in item ? item.type === 'faith' ? '신앙 루틴' : '기존 개인 루틴' : '개인 습관'} · {frequency ?? '반복 요일 확인 필요'}</p>
    <p className="text-body2">{archived(item) ? `보관·중지 중${item.archivedAt ? ` · ${item.archivedAt}` : ''}` : '실천 중'}</p>
    <p className="text-caption1">연결 목표: {item.goalId ? goals.find(g => g.id === item.goalId)?.title ?? '현재 목록에 없는 목표' : '없음'}</p>
    {item.when && <p className="text-caption1">실천 시점: {item.when}</p>}
    {'timeSlot' in item && item.timeSlot && <p className="text-caption1">시간대: {({morning:'아침',afternoon:'점심',evening:'저녁'})[item.timeSlot]}</p>}
    <p className="text-caption1">타이머: {item.durationSeconds ? `${item.durationSeconds}초` : '사용 안 함'}</p>
    <p className="text-caption1">알림: {item.notification?.enabled ? `${item.notification.type === 'sound' ? '소리' : '푸시'} · ${item.notification.times.join(', ')}` : '사용 안 함'}</p>
    {'miniRoutine' in item && item.miniRoutine && <p className="text-caption1">대체 습관: {item.miniRoutine}</p>}
    {item.twoMinuteHabit && <p className="text-caption1">2분 행동: {item.twoMinuteHabit}</p>}
  </section>;
}
export default function PracticeConflicts() {
  const owner = useAuthStore(s => s.user?.id ?? '');
  return <PracticeConflictsForOwner key={owner} owner={owner} />;
}
function PracticeConflictsForOwner({ owner }: { owner: string }) {
  useLocalNow();
  const navigate = useNavigate();
  const { habits } = useHabitStore(); const { faithRoutines, personalRoutines } = useRoutineStore();
  const goals = useGoalStore(s => s.monthlyGoals);
  const snapshot = useCallback(() => JSON.stringify(practiceSyncEntries(owner)), [owner]);
  const entries = JSON.parse(useSyncExternalStore(subscribe, snapshot)) as ReturnType<typeof practiceSyncEntries>;
  const [selected, setSelected] = useState<string>();
  const key = selected && entries.some(e => e.key === selected) ? selected : entries[0]?.key;
  const group = entries.filter(e => e.key === key), signature = JSON.stringify(group);
  const ref = group[0];
  const [remote, setRemote] = useState<{ signature: string; item: Item | null }>();
  const [error, setError] = useState(''); const [reload, setReload] = useState(0);
  const [confirmation, setConfirmation] = useState<{ action: 'mine' | 'server'; signature: string; impact: string; reload: number }>();
  const kind = ref?.kind, id = ref?.itemId;
  useEffect(() => {
    if (!id || !kind) return;
    let active = true; const currentOwner = () => active && useAuthStore.getState().user?.id === owner;
    void (async () => { try {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !data.session || data.session.user.id !== owner || !navigator.onLine) throw new Error('연결 확인');
      const result = await supabaseForSession(data.session.access_token).from(kind === 'habit' ? 'habits' : 'daily_routines').select('*').eq('id',id).eq('user_id',owner).maybeSingle();
      if (result.error) throw result.error;
      if (currentOwner()) { setRemote({ signature, item: result.data ? kind === 'habit' ? habitFromRow(result.data) : routineFromRow(result.data) : null }); setError(''); }
    } catch { if (currentOwner()) { setRemote(undefined); setError('서버 내용을 확인하지 못했어요. 연결 후 다시 불러와주세요. 입력은 기기에 남아 있어요.'); } } })();
    return () => { active = false; };
  }, [owner, id, kind, signature, reload]);
  const ready = remote?.signature === signature && !error, current = ready ? remote.item : null;
  const local = (kind === 'habit' ? habits : [...faithRoutines,...personalRoutines]).find(i => i.id === id);
  const row = group.reduce((values, entry) => entry.op.type === 'rpc' ? { ...values, ...entry.op.args.item_values as object } : 'values' in entry.op ? { ...values, ...entry.op.values } : values, local ? toRow(local) : current ? toRow(current) : {});
  const mine = id ? kind === 'habit' ? habitFromRow({...row,id}) : routineFromRow({...row,id}) : undefined;
  const deleting = group.some(e => e.op.type === 'delete');
  const futureHistory = current?.scheduleHistory?.some(rule => rule.from > today()) ?? false;
  const missingGoal = !!mine?.goalId && !goals.some(g => g.id === mine.goalId);
  const impact = JSON.stringify({ mine, current, goals, date: today() });
  const confirmed = ready && confirmation?.signature === signature && confirmation.impact === impact && confirmation.reload === reload;
  const choose = (action: 'mine' | 'server') => setConfirmation({ action, signature, impact, reload });
  const apply = () => {
    if (!confirmed || !key || !id || !kind || !mine || useAuthStore.getState().user?.id !== owner) return;
    try {
      let next = current;
      let op: WriteOp = { type:'practice-accept', kind, itemId:id, current: current ? {...toRow(current),revision:current.revision,user_id:owner} : null };
      if (confirmation.action === 'mine') {
        if (!valid(mine) || futureHistory || (deleting && !current)) return;
        const archive = deleting || archived(mine);
        const fields = { ...mine, archivedAt: archive ? current?.archivedAt ?? today() : undefined, goalId: current && !missingGoal ? mine.goalId : undefined,
          ...('isActive' in mine ? { isActive: !archive } : {}) };
        next = current ? { ...withHistory(current, { ...fields, scheduleHistory: current.scheduleHistory, ...('isActive' in current ? { type:current.type, weeklyGoalId:current.weeklyGoalId, monthlyGoalId:current.monthlyGoalId, order:current.order } : {}) }), id, revision:newId(), createdAt:current.createdAt }
          : { ...fields, id:newId(), revision:newId(), userId:'', createdAt:new Date().toISOString(), scheduleHistory:undefined,
            ...('isActive' in fields ? { weeklyGoalId:undefined, monthlyGoalId:undefined } : {}) };
        op = practiceWrite(next, current?.revision ?? null, !current);
      }
      resolvePracticeEntries(owner,signature,key,op);
      if (kind === 'habit') useHabitStore.setState(s => ({ habits:[...s.habits.filter(h => h.id!==id),...(next ? [next as Habit] : [])] }));
      else useRoutineStore.setState(s => ({
        faithRoutines:[...s.faithRoutines.filter(r=>r.id!==id),...(next && 'type' in next && next.type==='faith' ? [next] : [])],
        personalRoutines:[...s.personalRoutines.filter(r=>r.id!==id),...(next && 'type' in next && next.type==='personal' ? [next] : [])],
      }));
      setConfirmation(undefined); toast.success(confirmation.action==='server' ? '최신 서버 내용을 사용해요. 수행 기록은 유지돼요.' : '오늘부터 적용할 변경을 보관했어요. 서버 버전을 다시 확인하며 저장해요.');
    } catch { toast.error('복구 요청을 보관하지 못했거나 내용이 바뀌었어요. 다시 확인해주세요.'); }
  };
  return <div className="records-paper min-h-full p-4 space-y-4 pb-8">
    <button className="min-h-11 font-bold text-primary" onClick={()=>navigate('/')}>홈으로</button>
    <h1 className="text-heading2 font-bold">습관·루틴 충돌 확인</h1>
    {!ref ? <p>확인할 실천 충돌이 없어요. 저장 대기 변경은 연결되면 전송해요.</p> : <>
      <p className="text-body2 text-label-alt">다른 기기의 수정·보관 또는 구버전 요청을 확인해주세요. 입력은 기기에 남아 있고 수행 체크·메모는 계속 저장돼요.</p>
      <label className="block font-semibold">확인할 실천<select aria-label="충돌 실천 선택" value={key} onChange={e=>{setSelected(e.target.value);setConfirmation(undefined);}} className="mt-2 w-full min-h-11 rounded-xl border border-line bg-surface px-3">
        {[...new Set(entries.map(e=>e.key))].map(k=><option key={k} value={k}>{entries.find(e=>e.key===k)?.kind==='habit'?'습관':'루틴'} · {[...habits,...faithRoutines,...personalRoutines].find(i=>k.endsWith(`:${i.id}`))?.title ?? '보관된 입력'}</option>)}
      </select></label>
      <Button variant="assistive" onClick={()=>{setRemote(undefined);setError('');setReload(n=>n+1);}}>서버 내용 다시 불러오기</Button>
      {error && <p role="alert" className="text-negative">{error}</p>}
      {!ready && !error && <p role="status">서버 내용을 확인하고 있어요…</p>}
      {ready && (current ? <Content item={current} label="서버에 저장된 내용" /> : <p className="rounded-xl bg-primary-soft p-4">서버에 이 항목이 없어요. 새 실천으로 복사하면 새 ID로 만들고 기존 기록·목표·루틴 묶음을 자동으로 연결하지 않아요.</p>)}
      {mine && valid(mine) && <Content item={mine} label="이 기기에 남긴 입력" />}
      {deleting && <p className="text-body2">구버전 삭제 요청이에요. 수행 기록을 남기기 위해 영구 삭제 대신 오늘부터 보관할 수 있어요.</p>}
      {futureHistory && <p className="text-body2">서버에 미래 날짜부터 적용될 일정이 있어요. 오늘 변경으로 예정 이력을 덮지 않도록 내 입력 적용을 보류해요. 입력을 보관한 채 나중에 확인하거나 서버 내용을 선택할 수 있어요.</p>}
      {missingGoal && <p className="text-body2">기기에 선택한 목표가 현재 목록에 없어 다시 저장할 때 목표 연결을 해제해요. 이전 연결 이력은 남아요.</p>}
      <Button className="w-full" disabled={!ready || futureHistory || !valid(mine) || (deleting && !current)} onClick={()=>choose('mine')}>{deleting ? '오늘부터 보관' : current ? '내 입력을 오늘부터 적용' : '새 실천으로 복사'}</Button>
      <Button variant="assistive" className="w-full" disabled={!ready} onClick={()=>choose('server')}>서버 내용 사용</Button>
    </>}
    <OverlayDialog isOpen={!!confirmation} onClose={()=>setConfirmation(undefined)} labelledBy="practice-conflict-title" className="p-4">
      <h2 id="practice-conflict-title" className="font-bold text-headline1">{confirmation?.action==='server' ? '기기에 남긴 요청을 정리할까요?' : '이 내용으로 적용할까요?'}</h2>
      <p className="mt-3 text-body2">{confirmation?.action==='server' ? '이 항목의 대기 입력을 버리고 확인한 서버 내용을 사용해요. 서버에 없으면 이 기기의 항목만 정리해요.' : `${today()}부터 위에서 비교한 이름·반복 일정·알림·목표 연결·보관 상태를 적용해요. 서버가 다시 바뀌면 멈추고 다시 확인해요.`}</p>
      {confirmation?.action==='mine' && current && mine && archived(current)!==(deleting||archived(mine)) && <p className="mt-2 font-bold text-primary">{deleting||archived(mine) ? '오늘부터 보관하고 홈에서 숨겨요.' : '보관 중인 항목을 오늘부터 복원해요.'}</p>}
      <p className="mt-2 text-caption1">이전 날짜의 일정·보관 이력과 수행 체크·메모는 바꾸지 않아요.</p>
      {!confirmed && <p role="alert" className="mt-2 text-negative">확인할 내용이 바뀌었어요. 취소 후 다시 확인해주세요.</p>}
      <div className="mt-4 flex gap-2"><Button size="md" className="flex-1 px-2" variant="assistive" onClick={()=>setConfirmation(undefined)}>취소</Button><Button size="md" className="flex-1 px-1 whitespace-nowrap" disabled={!confirmed} onClick={apply}>확인하고 적용</Button></div>
    </OverlayDialog>
  </div>;
}
