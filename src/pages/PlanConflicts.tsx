import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useHabitStore } from '../store/habitStore';
import { useGoalStore } from '../store/goalStore';
import { useRoutineStore } from '../store/routineStore';
import { planSyncEntries, resolvePlanEntries, isPlanDeletion, type WriteOp } from '../lib/sync/outbox';
import { supabase, supabaseForSession } from '../lib/supabase';
import { personalRoutineFromRow, weeklyGoalFromRow } from '../data/mappers';
import { planWrite, planToRow, type PlanItem } from '../data/planWrites';
import type { PersonalRoutine, WeeklyGoal } from '../types';
import { newId } from '../utils/id';
import Button from '../components/ui/Button';
import OverlayDialog from '../components/ui/OverlayDialog';
import { toast } from '../store/toastStore';

function subscribe(change: () => void) { window.addEventListener('onju-outbox-changed',change); return () => window.removeEventListener('onju-outbox-changed',change); }
function Content({ item, label }: { item: PlanItem; label: string }) {
  const habits = useHabitStore(s => s.habits);
  const { faithRoutines, personalRoutines } = useRoutineStore();
  const all = [...habits,...faithRoutines,...personalRoutines];
  return <section aria-label={label} className="rounded-xl border border-line bg-surface p-4 break-words space-y-2">
    <h2 className="font-bold text-primary">{label}</h2><p className="font-bold">{item.emoji} {item.title}</p>
    {'habitIds' in item ? <>
      <p className="text-body2">실천 시점: {item.when || '미설정'} · 타이머 {item.timerEnabled ? '사용' : '꺼짐'}</p>
      <ol className="space-y-1 text-body2">{item.habitIds.map((id,i) => <li key={id}>{i+1}. {habits.find(h=>h.id===id)?.title ?? '현재 목록에 없는 습관'}{habits.find(h=>h.id===id)?.archivedAt ? ' (보관 중)' : ''} · {item.habitDurations?.[id] ?? 60}초</li>)}</ol>
    </> : <>
      <p className="text-body2">{item.startDate} ~ {item.endDate}</p>
      <p className="font-bold">주 {item.targetCount}회</p>
      <p className="text-caption1">연결: {all.find(i=>i.id===item.linkedId)?.title ?? '현재 목록에 없는 실천'}</p>
      <p className="text-caption1">저장된 결산 {item.completionRate}% · {item.status === 'completed' ? '달성' : '진행 중'}</p>
    </>}
  </section>;
}
export default function PlanConflicts() {
  const owner = useAuthStore(s=>s.user?.id ?? '');
  return <OwnerConflicts key={owner} owner={owner} />;
}
function OwnerConflicts({owner}: {owner:string}) {
  const navigate = useNavigate();
  const { personalRoutines: bundles, habits } = useHabitStore();
  const weekly = useGoalStore(s=>s.weeklyGoals);
  const routines = useRoutineStore();
  const snapshot = useCallback(()=>JSON.stringify(planSyncEntries(owner)),[owner]);
  const entries = JSON.parse(useSyncExternalStore(subscribe,snapshot)) as ReturnType<typeof planSyncEntries>;
  const [selected,setSelected] = useState<string>();
  const key = entries.some(e=>e.key===selected) ? selected : entries[0]?.key;
  const group = entries.filter(e=>e.key===key), signature = JSON.stringify(group), ref = group[0];
  const id = ref?.itemId, kind = ref?.kind;
  const [remote,setRemote] = useState<{signature:string;item:PlanItem|null}>();
  const [error,setError] = useState(''), [reload,setReload] = useState(0);
  const [confirmation,setConfirmation] = useState<{action:'mine'|'server';signature:string;impact:string;reload:number}>();
  useEffect(()=>{
    if (!id || !kind) return;
    let active = true;
    void (async()=>{try {
      const {data,error:sessionError} = await supabase.auth.getSession();
      if (sessionError || !data.session || data.session.user.id!==owner || !navigator.onLine) throw new Error('연결 확인');
      const result = await supabaseForSession(data.session.access_token).from(kind==='bundle'?'personal_routines':'weekly_goals').select('*').eq('id',id).eq('user_id',owner).maybeSingle();
      if (result.error) throw result.error;
      if (active && useAuthStore.getState().user?.id===owner) {
        setRemote({signature,item:result.data ? kind==='bundle' ? personalRoutineFromRow(result.data) : weeklyGoalFromRow(result.data) : null});setError('');
      }
    } catch { if(active && useAuthStore.getState().user?.id===owner) {setRemote(undefined);setError('서버 내용을 확인하지 못했어요. 연결 후 다시 불러와주세요. 입력은 기기에 남아 있어요.');} }})();
    return ()=>{active=false;};
  },[owner,id,kind,signature,reload]);
  const ready = remote?.signature===signature && !error, current = ready ? remote.item : null;
  const local = [...bundles,...weekly].find(i=>i.id===id);
  const row = group.reduce((values,e)=>e.op.type==='rpc'?{...values,...e.op.args.item_values as object}:'values' in e.op?{...values,...e.op.values}:values,local?planToRow(local):current?planToRow(current):{});
  const mine = id ? kind==='bundle'?personalRoutineFromRow({...row,id}):weeklyGoalFromRow({...row,id}) : undefined;
  const deleting = group.some(e=>isPlanDeletion(e.op));
  const valid = !!mine?.title?.trim() && ('habitIds' in mine ? mine.habitIds.length>0 && mine.habitIds.every(h=>habits.some(i=>i.id===h) || (!!current && 'habitIds' in current && current.habitIds.includes(h)))
    : Number.isInteger(mine.targetCount) && mine.targetCount>=1 && mine.targetCount<=7 && (!!current || [...habits,...routines.faithRoutines,...routines.personalRoutines].some(i=>i.id===mine.linkedId && !i.archivedAt && (!('isActive' in i)||i.isActive))));
  const impact = JSON.stringify({current,mine,valid,deleting});
  const confirmed = ready && confirmation?.signature===signature && confirmation.impact===impact && confirmation.reload===reload;
  const choose = (action:'mine'|'server')=>setConfirmation({action,signature,impact,reload});
  const apply = ()=>{
    if (!confirmed || !kind || !id || !key || useAuthStore.getState().user?.id!==owner) return;
    try {
      let next = current;
      let op:WriteOp = {type:'plan-accept',kind,itemId:id,current:current?{...planToRow(current),revision:current.revision,user_id:owner}:null};
      if(confirmation.action==='mine') {
        if(deleting) { if(!current)return;op=planWrite(current,current.revision??null,false,true); }
        else {
          if(!mine || !valid)return;
          // Weekly editing changes the count only; settlement, link and period remain the latest server values.
          next = current ? {...current,...('habitIds' in mine ? mine : {targetCount:mine.targetCount}),id,revision:newId(),createdAt:current.createdAt}
            : {...mine,id:newId(),revision:newId(),createdAt:new Date().toISOString(),userId:'',...('habitIds' in mine?{}:{status:'active' as const,completionRate:0,monthlyGoalId:undefined,linkedRoutineIds:[]})};
          op=planWrite(next,current?.revision??null,!current);
        }
      }
      resolvePlanEntries(owner,signature,key,op);
      if(kind==='bundle')useHabitStore.setState(s=>({personalRoutines:[...s.personalRoutines.filter(i=>i.id!==id),...(next?[next as PersonalRoutine]:[])]}));
      else useGoalStore.setState(s=>({weeklyGoals:[...s.weeklyGoals.filter(i=>i.id!==id),...(next?[next as WeeklyGoal]:[])]}));
      setConfirmation(undefined);toast.success(confirmation.action==='server'?'확인한 서버 내용을 사용해요.':'확인한 요청을 보관했어요. 서버 버전을 다시 확인하며 반영해요.');
    } catch {toast.error('보관된 입력이 바뀌었거나 복구 요청을 저장하지 못했어요. 다시 확인해주세요.');}
  };
  return <div className="records-paper min-h-full p-4 pb-8 space-y-4">
    <button className="min-h-11 font-bold text-primary" onClick={()=>navigate('/goals')}>목표로 돌아가기</button>
    <h1 className="text-heading2 font-bold">묶음·주간 목표 충돌 확인</h1>
    {!ref ? <p>확인할 충돌이 없어요. 저장 대기 변경은 연결되면 전송해요.</p> : <>
      <p className="text-body2 text-label-alt">다른 기기의 변경이나 구버전 요청을 확인해주세요. 이 항목의 전송만 멈추고 입력을 보관해요. 습관 수행 기록은 계속 저장돼요.</p>
      <label className="block font-semibold">확인할 항목<select aria-label="충돌 항목 선택" value={key} onChange={e=>{setSelected(e.target.value);setConfirmation(undefined);}} className="mt-2 w-full min-h-11 rounded-xl border border-line bg-surface px-3">
        {[...new Set(entries.map(e=>e.key))].map(k=><option key={k} value={k}>{k.startsWith('bundle:')?'루틴 묶음':'주간 목표'} · {[...bundles,...weekly].find(i=>k.endsWith(`:${i.id}`))?.title??'보관된 입력'}</option>)}
      </select></label>
      <Button variant="assistive" onClick={()=>{setRemote(undefined);setError('');setReload(n=>n+1);}}>서버 내용 다시 불러오기</Button>
      {error && <p role="alert" className="text-negative">{error}</p>}
      {group.some(e=>e.conflict?.reason) && <p role="alert" className="text-caption1 text-negative">저장 조건을 확인해주세요: {group.find(e=>e.conflict?.reason)?.conflict?.reason}</p>}
      {!ready && !error && <p role="status">서버 내용을 확인하고 있어요…</p>}
      {ready && (current?<Content item={current} label="서버에 저장된 내용"/>:<p className="rounded-xl bg-primary-soft p-4">서버에 이 항목이 없어요. 복사하면 새 항목으로 만들며, 표시한 습관 연결을 사용해요. 기존 습관과 기록을 복제하지 않아요.</p>)}
      {mine?.title && <Content item={mine} label="이 기기에 남긴 입력"/>}
      <p className="text-caption1 text-label-alt">{deleting?'삭제는 비교한 최신 버전으로 다시 요청해요. 서버 확인 전까지 항목을 유지해요.':kind==='weekly'&&current?'내 입력 적용 시 목표 횟수만 바꿔요. 기간·연결·저장된 결산은 위의 서버 내용을 유지해요.':'묶음의 이름·실천 시점·순서·시간 설정을 위의 입력으로 적용해요.'} 기존 습관·과거 수행 기록·리뷰는 유지돼요.</p>
      <Button className="w-full" disabled={!ready || (deleting?!current:!valid)} onClick={()=>choose('mine')}>{deleting?'확인한 버전으로 삭제':current?'내 입력 적용':'새 항목으로 복사'}</Button>
      <Button variant="assistive" className="w-full" disabled={!ready} onClick={()=>choose('server')}>서버 내용 사용</Button>
    </>}
    <OverlayDialog isOpen={!!confirmation} onClose={()=>setConfirmation(undefined)} labelledBy="plan-confirm-title" className="p-4">
      <h2 id="plan-confirm-title" className="font-bold text-headline1">{confirmation?.action==='server'?'기기에 남긴 요청을 정리할까요?':'비교한 내용으로 적용할까요?'}</h2>
      <p className="mt-3 text-body2">{confirmation?.action==='server'?'이 항목의 대기 입력을 버리고 확인한 서버 내용을 사용해요. 서버에 없으면 기기의 항목만 정리해요.':'위에서 비교한 요청만 반영해요. 서버가 다시 바뀌면 멈추고 다시 확인해요.'} 습관과 과거 기록은 유지돼요.</p>
      {!confirmed && <p role="alert" className="mt-2 text-negative">비교 내용이 바뀌었어요. 취소 후 다시 확인해주세요.</p>}
      <div className="mt-4 flex gap-2"><Button size="md" variant="assistive" className="flex-1 px-2" onClick={()=>setConfirmation(undefined)}>취소</Button><Button size="md" className="flex-1 px-1" disabled={!confirmed} onClick={apply}>확인하고 적용</Button></div>
    </OverlayDialog>
  </div>;
}
