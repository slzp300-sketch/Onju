import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import FormBoundary from '../components/FormBoundary';
import Button from '../components/ui/Button';
import { useGoalStore } from '../store/goalStore';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { useLocalNow } from '../hooks/useLocalNow';
import { today } from '../utils/date';
import { toast } from '../store/toastStore';
import GoalConnectionActions from '../components/goals/GoalConnectionActions';

export default function GoalConnect() {
  const { id } = useParams();
  const exists = useGoalStore(s => s.monthlyGoals.some(g => g.id === id));
  return <FormBoundary id={id} exists={exists}><GoalConnectEditor /></FormBoundary>;
}

function GoalConnectEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  useLocalNow();
  const goal = useGoalStore(s => s.monthlyGoals.find(g => g.id === id))!;
  const { habits, updateHabit } = useHabitStore();
  const { faithRoutines, updateRoutine } = useRoutineStore();
  const [selected, setSelected] = useState<string>();
  const faith = goal.category === 'faith';
  const noun = faith ? '신앙 루틴' : '습관';
  const allItems = faith ? faithRoutines : habits;
  const items = allItems.filter(item => !item.archivedAt && (!('isActive' in item) || item.isActive));
  const linked = [...habits, ...faithRoutines].filter(item => item.goalId === id);
  const hasPersonal = linked.some(item => !('isActive' in item));
  const hasFaith = linked.some(item => 'isActive' in item);
  const mixedCategory = linked.some(item => ('isActive' in item) !== faith);
  const expired = goal.endDate < today();
  const link = () => {
    const chosen = items.find(item => item.id === selected);
    if (!chosen || chosen.goalId || expired) { toast.error('연결할 항목을 다시 선택해주세요.'); return; }
    // 기존 목표와 과거 연결 이력은 조용히 덮어쓰지 않는다.
    try {
      if (faith) updateRoutine(chosen.id, { goalId: goal.id }); else updateHabit(chosen.id, { goalId: goal.id });
      setSelected(undefined);
      toast.success('목표에 연결했어요. 홈에서 실천을 기록해보세요.');
    } catch { toast.error('연결하지 못했어요. 다시 시도해주세요.'); }
  };
  return <div className="form-paper min-h-dvh px-4 py-5 flex flex-col gap-4 pb-10">
    <button className="min-h-11 text-left text-primary font-bold" onClick={() => navigate('/goals')}>목표 관리로</button>
    <h1 className="text-heading2 font-bold text-label-strong">목표를 실천으로 이어가요</h1>
    <div className="rounded-xl bg-surface border border-line p-4">
      <h2 className="text-body1 font-bold break-words">{goal.title}</h2>
      <p className="text-caption1 text-label-alt mt-2">{goal.startDate} ~ {goal.endDate}</p>
      <p className="text-body2 text-label-alt mt-3">목표는 저장됐어요. 홈에서 실행할 {noun}을 연결하면 기록이 목표 진척에 반영돼요.</p>
      {goal.goalRoutines?.[0] && <p className="mt-3 text-caption1 text-label-alt">계획한 행동: {goal.goalRoutines[0].title}</p>}
      {goal.startDate > today() && <p className="mt-2 text-caption1 text-label-alt">새 {noun}은 오늘부터 실행할 수 있고, 목표 진척은 목표 기간의 기록으로 계산해요.</p>}
      <p className="mt-2 text-caption1 text-label-alt">기간 밖의 수행 기록도 유지돼요. 목표 기간이 바뀌어도 실천의 반복 일정은 그대로예요.</p>
    </div>
    {linked.length > 0 && <section aria-label="연결된 실천" className="rounded-xl bg-primary-soft p-4">
      <h2 className="font-bold text-primary">연결된 {mixedCategory ? '실천' : noun} {linked.length}개</h2>
      <p className="mt-2 text-caption1 text-label-alt">연결을 바꿔도 실천 항목과 과거 기록은 유지돼요.</p>
      {mixedCategory && <p className="mt-2 text-caption1 text-label-alt">이전 분류에서 연결한 항목도 표시하고 진척에 반영해요. 새로 연결할 항목은 {faith ? '신앙' : '개인'} 분류를 따라요.</p>}
      {linked.map(item => <div key={`${'isActive' in item ? 'faith' : 'habit'}:${item.id}`} className="mt-3 rounded-lg bg-surface p-3">
        <p className="text-body2 font-bold break-words">{item.title}</p>
        <p className="text-caption1 text-label-alt mt-1">{'isActive' in item ? '신앙 루틴' : '개인 습관'}{('isActive' in item) !== faith ? ' · 이전 분류의 연결 유지' : ''}</p>
        {(item.archivedAt || ('isActive' in item && !item.isActive)) && <p className="text-caption1 text-label-alt mt-1">보관 중 · 연결을 바꿔도 자동으로 다시 시작하지 않아요</p>}
        <GoalConnectionActions item={item} goalId={goal.id} />
      </div>)}
      {hasPersonal && <Button fullWidth className="mt-4" onClick={() => navigate('/', { state: { homeTab: 'personal' } })}>{mixedCategory ? '개인 습관 실천하기' : '홈에서 실천하기'}</Button>}
      {hasFaith && <Button fullWidth className="mt-4" onClick={() => navigate('/', { state: { homeTab: 'faith' } })}>{mixedCategory ? '신앙 루틴 실천하기' : '홈에서 실천하기'}</Button>}
    </section>}
    {expired ? <p className="text-body2 text-label-alt">기간이 끝난 목표예요. 기간을 수정한 뒤 실천을 연결해주세요.</p> : <>
      <Button fullWidth onClick={() => navigate(`${faith ? '/faith-routines/new' : '/habits/new'}?goal=${goal.id}`)}>새 {noun} 만들기</Button>
      <section className="rounded-xl bg-surface border border-line p-4">
        <h2 className="font-bold text-label-strong">기존 {noun} 연결</h2>
        <p className="text-caption1 text-label-alt mt-1">다른 목표의 항목은 해당 목표의 연결 관리에서 옮길 수 있어요.</p>
        {items.length === 0 && <p className="text-body2 text-label-alt py-4">아직 만든 {noun}이 없어요.</p>}
        {items.map(item => <button key={item.id} aria-pressed={selected === item.id} disabled={!!item.goalId}
          onClick={() => setSelected(item.id)} className={`w-full min-h-12 py-3 text-left border-b border-line-soft ${selected === item.id ? 'text-primary font-bold' : 'text-label'} disabled:opacity-50`}>
          <span className="block break-words">{item.title}</span>
          {item.goalId && <span className="text-caption1">{item.goalId === id ? '이 목표에 연결됨' : '다른 목표에 연결됨'}</span>}
        </button>)}
        <Button fullWidth className="mt-3" disabled={!items.some(item => item.id === selected && !item.goalId)} onClick={link}>선택한 {noun} 연결</Button>
      </section>
    </>}
    <button className="min-h-11 text-label-alt" onClick={() => navigate('/goals')}>나중에 연결하기</button>
  </div>;
}
