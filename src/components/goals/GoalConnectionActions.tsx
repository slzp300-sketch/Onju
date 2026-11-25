import { useId, useState } from 'react';
import type { DailyRoutine, Habit } from '../../types';
import { useGoalStore } from '../../store/goalStore';
import { useHabitStore } from '../../store/habitStore';
import { useRoutineStore } from '../../store/routineStore';
import { toast } from '../../store/toastStore';
import { today } from '../../utils/date';
import { canLinkMonthlyGoal } from '../../utils/goalRules';
import OverlayDialog from '../ui/OverlayDialog';
import Button from '../ui/Button';

export default function GoalConnectionActions({ item, goalId }: { item: Habit | DailyRoutine; goalId: string }) {
  const titleId = useId();
  const [action, setAction] = useState<'detach' | 'move'>();
  const [targetId, setTargetId] = useState('');
  const goals = useGoalStore(s => s.monthlyGoals);
  const faith = 'isActive' in item && item.type === 'faith';
  const targets = goals.filter(g => g.id !== goalId && canLinkMonthlyGoal(g, faith ? 'faith' : 'personal', today()));
  const target = targets.find(g => g.id === targetId);
  const confirm = () => {
    const current = 'isActive' in item
      ? [...useRoutineStore.getState().faithRoutines, ...useRoutineStore.getState().personalRoutines].find(r => r.id === item.id)
      : useHabitStore.getState().habits.find(h => h.id === item.id);
    if (!current || current.goalId !== goalId || (action === 'move' && !target)) {
      toast.error('연결 상태가 바뀌었어요. 현재 목표와 항목을 다시 확인해주세요.'); setAction(undefined); return;
    }
    try {
    const next = action === 'move' ? target!.id : undefined;
    if ('isActive' in current) useRoutineStore.getState().updateRoutine(current.id, { goalId: next });
    else useHabitStore.getState().updateHabit(current.id, { goalId: next });
    toast.success(`${today()}부터 ${next ? '다른 목표에 연결했어요' : '목표 연결을 해제했어요'}. 실천과 기록은 유지돼요.`);
    setAction(undefined);
    } catch (error) { toast.error(error instanceof Error ? error.message : '연결 변경을 보관하지 못했어요. 다시 확인해주세요.'); }
  };
  return <>
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <button className="min-h-11 text-caption1 font-bold text-primary" aria-label={`${item.title} 다른 목표로 이동`} onClick={() => { setTargetId(''); setAction('move'); }}>다른 목표로 이동</button>
      <button className="min-h-11 text-caption1 text-label-alt" aria-label={`${item.title} 연결 해제`} onClick={() => setAction('detach')}>연결 해제</button>
    </div>
    <OverlayDialog isOpen={!!action} onClose={() => setAction(undefined)} labelledBy={titleId} className="p-5">
      <h2 id={titleId} className="text-headline1 font-bold">{action === 'move' ? '어떤 목표로 옮길까요?' : '목표 연결을 해제할까요?'}</h2>
      <p className="mt-3 text-body2 break-words font-bold">{item.title}</p>
      <p className="mt-2 text-caption1 text-label-alt break-words">현재 목표: {goals.find(g => g.id === goalId)?.title ?? '이전 목표'}</p>
      {action === 'move' && <div className="mt-4">
        <label htmlFor={`${titleId}-target`} className="block text-body2 font-bold mb-2">옮길 목표</label>
        <select id={`${titleId}-target`} value={targetId} onChange={e => setTargetId(e.target.value)} className="w-full min-h-12 rounded-xl border border-line bg-surface p-3 text-body2">
          <option value="">목표를 선택해주세요</option>
          {targets.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        {!targets.length && <p className="mt-2 text-caption1 text-label-alt">옮길 수 있는 {faith ? '신앙' : '개인'} 목표가 없어요. 목표 관리에서 같은 분류의 목표를 먼저 만들어주세요.</p>}
      </div>}
      <p className="mt-4 text-body2 text-label-alt">적용일: {today()} · 오늘 기록부터 {action === 'move' ? '새 목표에 반영해요' : '이 목표의 진척에서 제외해요'}. 이전 날짜의 목표 연결 이력과 모든 수행 기록은 유지돼요.</p>
      <p className="mt-2 text-caption1 text-label-alt">습관·루틴의 내용, 반복 일정과 보관 상태는 바뀌지 않아요.</p>
      {target && <p className="mt-2 text-caption1 text-label-alt break-words">새 목표: {target.title} · {target.startDate} ~ {target.endDate}. 목표 진척은 이 기간 안의 기록만 계산해요.</p>}
      <div className="flex gap-2 mt-5">
        <Button size="md" variant="assistive" className="flex-1 px-2 whitespace-nowrap" onClick={() => setAction(undefined)}>취소</Button>
        <Button size="md" className="flex-1 px-2 whitespace-nowrap" disabled={action === 'move' && !target} onClick={confirm}>{action === 'move' ? '이 목표로 이동' : '연결만 해제'}</Button>
      </div>
    </OverlayDialog>
  </>;
}
