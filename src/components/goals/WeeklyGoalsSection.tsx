import { useSavedDrafts } from '../../hooks/useSavedDrafts';
import { usePlanDeletionIds } from '../../hooks/usePlanDeletionIds';
import ConfirmModal from '../ui/ConfirmModal';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, X, Check, Link2, Pencil, Trash2 } from '../../icons';
import { format } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import { useGoalStore } from '../../store/goalStore';
import { useHabitStore } from '../../store/habitStore';
import { useRoutineStore } from '../../store/routineStore';
import { useSettingsStore } from '../../store/settingsStore';
import { toast } from '../../store/toastStore';
import { currentWeek, currentYear, getWeekRangeFor } from '../../utils/date';
import { countWeeklyGoalDone, weeklyGoalRate } from '../../utils/weeklyGoalProgress';
import { newId } from '../../utils/id';
import type { WeeklyGoal } from '../../types';
import { useLocalDraft } from '../../hooks/useLocalDraft';
import { useFormProtection } from '../../hooks/useFormProtection';
import { useLocalNow } from '../../hooks/useLocalNow';
import { isWeeklyGoalDraft } from '../../utils/formDrafts';
import OverlayDialog from '../ui/OverlayDialog';
import OnjuIcon from '../ui/OnjuIcon';
import ActionMenu from '../ui/ActionMenu';

const MAX_TARGET = 7;

interface Linkable {
  id: string;
  title: string;
  emoji?: string;
  kind: 'habit' | 'routine';
  isFaith: boolean;
}

/** 목표 관리 상단 "이번 주 목표" — 습관·루틴 연동 횟수 목표, 진행률은 체크 로그에서 자동 */
export default function WeeklyGoalsSection() {
  const user = useAuthStore(s => s.user);
  const { weeklyGoals, addWeeklyGoal, removeWeeklyGoal } = useGoalStore();
  const { habits, habitLogs } = useHabitStore();
  const { faithRoutines, logs: routineLogs } = useRoutineStore();
  const weekStartDay = useSettingsStore(s => s.weekStartDay);

  const savedEdits = useSavedDrafts('weekly-goal:edit:',isWeeklyGoalDraft);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing,setEditing] = useState<WeeklyGoal>();
  const [deleting,setDeleting] = useState<WeeklyGoal>();
  const pendingDeletes = usePlanDeletionIds();
  useLocalNow();

  const slots = user?.weeklyGoalSlots ?? 3;
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const { start, end } = getWeekRangeFor(new Date(), weekStartDay);
  const weekStartIso = format(start, 'yyyy-MM-dd');
  const weekEndIso = format(end, 'yyyy-MM-dd');

  const thisWeekGoals = weeklyGoals.filter(g => g.startDate <= todayIso && g.endDate >= todayIso);

  const linkables = useMemo<Linkable[]>(() => [
    ...habits.filter(h => !h.archivedAt).map(h => ({ id: h.id, title: h.title, emoji: h.emoji, kind: 'habit' as const, isFaith: false })),
    ...faithRoutines
      .filter(r => r.isActive && !r.archivedAt)
      .map(r => ({ id: r.id, title: r.title, emoji: r.emoji, kind: 'routine' as const, isFaith: r.type === 'faith' })),
  ], [habits, faithRoutines]);

  const linkedIds = new Set(thisWeekGoals.flatMap(g => g.linkedId ? [g.linkedId] : []));
  const remainDays = Math.max(1, Math.round((new Date(weekEndIso + 'T12:00:00').getTime() - new Date(todayIso + 'T12:00:00').getTime()) / 86400000) + 1);

  const openSheet = () => setSheetOpen(true);
  const create = (pickedId: string, target: number, entityId: string) => {
    const item = linkables.find(l => l.id === pickedId);
    if (!item || linkedIds.has(item.id) || thisWeekGoals.length >= slots) return false;
    const goal: WeeklyGoal = {
      id: entityId,
      userId: '',
      title: item.title,
      emoji: item.emoji,
      weekNumber: currentWeek(),
      year: currentYear(),
      startDate: weekStartIso,
      endDate: weekEndIso,
      status: 'active',
      completionRate: 0,
      targetCount: target,
      linkedKind: item.kind,
      linkedId: item.id,
      linkedRoutineIds: [],
      createdAt: new Date().toISOString(),
    };
    addWeeklyGoal(goal);
    toast.success('이번 주 목표를 심었어요 🌱');
    return true;
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-caption1 font-semibold text-label-alt">이번 주 목표</p>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${
              i < thisWeekGoals.length ? 'bg-primary' : i < slots ? 'bg-primary/25' : 'bg-fill-strong'
            }`} />
          ))}
          <span className="text-caption2 text-label-alt font-medium ml-0.5">{thisWeekGoals.length}/{slots}</span>
        </div>
      </div>

      {thisWeekGoals.map(g => {
        const done = countWeeklyGoalDone(g, habitLogs, routineLogs);
        const rate = weeklyGoalRate(g, done);
        const achieved = rate >= 100;
        return (
          <div key={g.id}
            className={`bg-surface border rounded-xl px-4 py-3.5 ${achieved ? 'border-positive/35' : 'border-line-soft'}`}>
            <div className="flex items-center gap-2.5">
              <OnjuIcon emoji={g.emoji} fallback="🎯" size={26} />
              <div className="flex-1 min-w-0">
                <p className="text-body2 font-bold text-label-strong truncate">{g.title} 주 {g.targetCount}회</p>
                <p className="text-caption2 text-primary-strong font-semibold mt-0.5 flex items-center gap-1">
                  <Link2 size={10} /> {g.linkedKind === 'habit' ? '습관' : '루틴'} 체크에서 자동 계산
                </p>
              </div>
              <span className="text-body2 font-bold text-label-strong tabular-nums flex-shrink-0">
                {done}<span className="text-caption2 text-label-assistive font-semibold">/{g.targetCount}회</span>
              </span>
              <ActionMenu title={g.title + ' 주간 목표'} disabled={pendingDeletes.includes('weekly:' + g.id)} actions={[
                {label: '횟수 수정', icon: <Pencil size={18} />, onClick: () => setEditing(g)},
                {label: '주간 목표 삭제', icon: <Trash2 size={18} />, danger: true, onClick: () => setDeleting(g)},
              ]} />
            </div>
            {pendingDeletes.includes('weekly:' + g.id) && <p role="status" className="text-caption1 text-primary">삭제 확인 중 · 습관과 수행 기록은 유지돼요</p>}
            <div className="flex gap-1 mt-2.5">
              {Array.from({ length: g.targetCount }).map((_, i) => (
                <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${
                  i < done ? (achieved ? 'bg-positive' : 'bg-primary') : 'bg-fill-strong'
                }`} />
              ))}
            </div>
            <p className={`text-caption2 mt-2 ${achieved ? 'text-positive font-bold' : 'text-label-alt'}`}>
              {achieved
                ? '이번 주 달성! 나무가 쑥 자랐어요 🌳'
                : `${g.targetCount - done}회 남았어요 · ${remainDays}일 남음`}
            </p>
          </div>
        );
      })}

      {thisWeekGoals.length < slots ? (
        <button onClick={openSheet}
          className="w-full rounded-xl border-2 border-dashed border-line py-3.5 flex items-center justify-center gap-1.5 text-label-assistive hover:border-primary hover:text-primary transition-all text-body2 font-semibold">
          <Plus size={16} /> 주간 목표 추가
        </button>
      ) : (
        <p className="text-caption2 text-label-assistive text-center py-1">
          슬롯이 가득 찼어요 — 달성률 80% 이상이면 다음 주에 한 칸 늘어나요
        </p>
      )}

      {savedEdits.error && <p role="alert" className="text-caption1 text-negative">편집 초안을 모두 읽지 못했어요. 기기 저장 상태를 확인해주세요.</p>}
      {savedEdits.drafts.length>0 && <details className="rounded-xl border border-line p-3"><summary className="min-h-11 py-3 font-bold text-caption1">남겨둔 주간 목표 편집 ({savedEdits.drafts.length})</summary>
        {savedEdits.drafts.map(d=>d.values.baseGoal && <button key={d.document} className="block min-h-11 w-full text-left break-words text-body2 text-primary" onClick={()=>setEditing(d.values.baseGoal)}>{d.values.baseGoal.title} · {d.values.baseGoal.startDate} 초안 열기</button>)}
      </details>}
      <ConfirmModal isOpen={!!deleting} title="주간 목표를 삭제할까요?"
        message="이 주간 목표만 삭제해요. 연결한 습관·루틴과 과거 수행 기록·리뷰는 남아요. 서버가 확인할 때까지 목표를 유지해요."
        confirmDisabled={!!deleting && (pendingDeletes.includes(`weekly:${deleting.id}`) || JSON.stringify(weeklyGoals.find(g=>g.id===deleting.id))!==JSON.stringify(deleting))}
        onCancel={()=>setDeleting(undefined)} onConfirm={()=>{if(!deleting)return;try{removeWeeklyGoal(deleting.id,deleting);setDeleting(undefined);}catch(e){toast.error(e instanceof Error?e.message:'목표를 다시 확인해주세요.');}}}/>
      {editing && <WeeklyTargetEditor key={`${user?.id}:${editing.id}`} goal={editing} onClose={()=>setEditing(undefined)}/>}
      {sheetOpen && <WeeklyGoalEditor key={`${user?.id}:${weekStartIso}`}
        documentKey={`weekly-goal:new:${weekStartIso}`} linkables={linkables} linkedIds={linkedIds}
        hasSlot={thisWeekGoals.length < slots} onCreate={create} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}

function WeeklyGoalEditor({ documentKey, linkables, linkedIds, hasSlot, onCreate, onClose }: {
  documentKey: string; linkables: Linkable[]; linkedIds: Set<string>; hasSlot: boolean;
  onCreate: (pickedId: string, target: number, entityId: string) => boolean; onClose: () => void;
}) {
  const [entityId, setEntityId] = useState<string>(newId);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [target, setTarget] = useState(3);
  const values = { entityId, pickedId, target };
  const draft = useLocalDraft({ document: documentKey, values, validate: isWeeklyGoalDraft,
    restore: v => { setEntityId(v.entityId); setPickedId(v.pickedId); setTarget(v.target); } });
  const protection = useFormProtection(values, draft.leaveMessage);
  const validItem = !!pickedId && linkables.some(l => l.id === pickedId) && !linkedIds.has(pickedId);
  const save = () => {
    if (draft.awaitingChoice || !pickedId || !validItem || !hasSlot) return;
    if (protection.save(() => {
      if (!onCreate(pickedId, target, entityId)) throw new Error('Goal unavailable');
      draft.clear();
    })) onClose();
  };
  return <>
    <OverlayDialog isOpen onClose={() => protection.requestLeave(onClose)} labelledBy="weekly-goal-title" variant="sheet" className="p-5">
      <div className="flex items-center gap-2"><h3 id="weekly-goal-title" className="flex-1 text-headline1 font-bold text-label-strong">이번 주 목표 만들기</h3>
        <button className="min-h-11 min-w-11" aria-label="주간 목표 닫기" onClick={() => protection.requestLeave(onClose)}><X size={20} /></button></div>
      <p className="text-caption1 text-label-alt mb-3">어떤 습관·신앙 루틴을 몇 번 할까요?</p>
      {draft.banner}
      <fieldset disabled={draft.awaitingChoice} className="min-w-0">
        {linkables.length === 0 && <p className="text-caption1 text-label-alt py-4">홈에서 먼저 습관이나 신앙 루틴을 만들어주세요.</p>}
        {linkables.map(l => <button key={l.id} disabled={linkedIds.has(l.id)} aria-pressed={pickedId === l.id} onClick={() => setPickedId(l.id)}
          className="w-full flex items-center gap-3 min-h-12 py-3 border-b border-line-soft text-left disabled:opacity-40">
          <OnjuIcon emoji={l.emoji} size={26} /><span className="flex-1 text-body2 text-label truncate">{l.title}</span>
          <span className="text-caption2 text-label-alt">{linkedIds.has(l.id) ? '이미 목표 있음' : l.kind === 'habit' ? '습관' : '신앙 루틴'}</span>
          {pickedId === l.id && <Check size={16} className="text-primary" />}
        </button>)}
        {pickedId && !validItem && <p role="alert" className="text-caption1 text-negative mt-3">선택한 항목이 보관·삭제되었거나 이미 목표에 있어요. 다시 선택해주세요.</p>}
        {!hasSlot && <p role="alert" className="text-caption1 text-negative mt-3">이번 주 목표 칸이 가득 찼어요.</p>}
        <div className="flex items-center justify-center gap-5 mt-5">
          <motion.button whileTap={{ scale: 0.92 }} aria-label="횟수 줄이기" onClick={() => setTarget(n => Math.max(1, n - 1))} className="w-11 h-11 rounded-xl bg-fill text-label font-bold">−</motion.button>
          <p className="text-2xl font-bold text-label-strong" aria-live="polite">{target}<span className="text-caption1">회 / 주</span></p>
          <motion.button whileTap={{ scale: 0.92 }} aria-label="횟수 늘리기" onClick={() => setTarget(n => Math.min(MAX_TARGET, n + 1))} className="w-11 h-11 rounded-xl bg-fill text-label font-bold">＋</motion.button>
        </div>
        <button onClick={save} disabled={draft.awaitingChoice || !validItem || !hasSlot} className="mt-5 w-full min-h-12 bg-primary text-white text-body2 font-bold py-3 rounded-xl disabled:opacity-35">목표 추가</button>
      </fieldset>
    </OverlayDialog>
    {protection.guard}
  </>;
}

function WeeklyTargetEditor({goal,onClose}:{goal:WeeklyGoal;onClose:()=>void}) {
  const [base,setBase] = useState(goal);
  const [target,setTarget] = useState(goal.targetCount);
  const values = {entityId:goal.id,pickedId:goal.linkedId??null,target,baseGoal:base};
  const draft = useLocalDraft({document:`weekly-goal:edit:${goal.id}`,values,validate:isWeeklyGoalDraft,
    restore:v=>{setTarget(v.target);setBase(v.baseGoal?.id===goal.id?v.baseGoal:{...goal,revision:undefined});}});
  const protection = useFormProtection(values,draft.leaveMessage);
  const deleting = usePlanDeletionIds().includes(`weekly:${goal.id}`);
  const habitLogs = useHabitStore(s=>s.habitLogs), routineLogs = useRoutineStore(s=>s.logs);
  const done = countWeeklyGoalDone(base,habitLogs,routineLogs);
  const save = ()=>{
    if(draft.awaitingChoice || deleting)return;
    if(protection.save(()=>{useGoalStore.getState().updateWeeklyGoal(goal.id,{targetCount:target},base);draft.clear();}))onClose();
  };
  return <>
    <OverlayDialog isOpen onClose={()=>protection.requestLeave(onClose)} labelledBy="weekly-target-title" variant="sheet" className="p-5">
      <div className="flex items-center gap-2"><h3 id="weekly-target-title" className="flex-1 font-bold text-headline1">주간 목표 횟수 수정</h3><button className="min-h-11 min-w-11" aria-label="주간 목표 수정 닫기" onClick={()=>protection.requestLeave(onClose)}><X size={20}/></button></div>
      <p className="font-bold break-words">{base.title}</p><p className="my-2 text-caption1 text-label-alt">{base.startDate} ~ {base.endDate} · 연결한 실천과 기간은 유지해요.</p>
      {draft.banner}
      {deleting && <p role="status">삭제 결과를 확인 중이에요.</p>}
      <fieldset disabled={draft.awaitingChoice || deleting} className="min-w-0">
        <div className="flex items-center justify-center gap-5 my-4"><button className="size-11 rounded-xl bg-fill font-bold" aria-label="횟수 줄이기" onClick={()=>setTarget(n=>Math.max(1,n-1))}>−</button><p className="text-2xl font-bold" aria-live="polite">{target}<span className="text-caption1">회 / 주</span></p><button className="size-11 rounded-xl bg-fill font-bold" aria-label="횟수 늘리기" onClick={()=>setTarget(n=>Math.min(7,n+1))}>＋</button></div>
        <p className="text-body2">현재 {done}회 수행 · 달성률 {weeklyGoalRate(base,done)}% → {weeklyGoalRate({...base,targetCount:target},done)}%</p>
        <p className="mt-2 text-caption1 text-label-alt">횟수를 바꿔도 수행 기록과 이미 저장한 리뷰 결산은 그대로 남아요. 다른 기기에서 바꾼 내용이 있으면 비교 후 저장해요.</p>
        <button onClick={save} className="mt-5 w-full min-h-12 rounded-xl bg-primary text-white font-bold">횟수 저장</button>
      </fieldset>
    </OverlayDialog>{protection.guard}
  </>;
}
