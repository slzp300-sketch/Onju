import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from '../icons';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { toast } from '../store/toastStore';

export default function Archive() {
  const navigate = useNavigate();
  const { habits, restoreHabit } = useHabitStore();
  const { faithRoutines, personalRoutines, restoreRoutine } = useRoutineStore();
  const items = [
    ...habits.filter(h => h.archivedAt).map(h => ({ ...h, kind: '개인 습관', restore: restoreHabit })),
    ...[...faithRoutines, ...personalRoutines].filter(r => r.archivedAt).map(r => ({ ...r, kind: '루틴', restore: restoreRoutine })),
  ];
  return <div className="min-h-full px-4 py-5">
    <header className="flex items-center gap-2 mb-4">
      <button className="size-11 grid place-items-center" onClick={() => navigate('/profile')} aria-label="마이페이지로 돌아가기"><ChevronLeft size={22} /></button>
      <h1 className="text-heading2 font-bold text-label-strong">보관한 습관·루틴</h1>
    </header>
    <p className="text-body2 text-label-alt mb-5">보관 전 날짜의 기록은 통계에 남아 있어요. 복원하면 오늘부터 다시 시작하며, 보관한 기간은 실패로 세지 않아요.</p>
    {items.length === 0 ? <p className="rounded-2xl bg-surface p-6 text-center text-label-alt">보관한 항목이 없어요.</p> :
      <ul className="space-y-3">{items.map(item => <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <span aria-hidden="true">{item.emoji ?? '🌱'}</span>
        <div className="min-w-0 flex-1"><p className="font-bold break-words text-label-strong">{item.title}</p><p className="text-caption1 text-label-alt">{item.kind} · {item.archivedAt} 보관</p></div>
        <button className="min-h-11 rounded-xl px-3 font-semibold text-primary bg-primary-soft" aria-label={`${item.title} 복원`} onClick={() => { try { item.restore(item.id); toast.success('오늘부터 다시 시작해요.'); } catch (error) { toast.error(error instanceof Error ? error.message : '복원 요청을 보관하지 못했어요. 다시 시도해주세요.'); } }}>복원</button>
      </li>)}</ul>}
  </div>;
}
