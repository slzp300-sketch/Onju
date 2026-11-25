import { useRecordDeletionIds } from '../../hooks/useRecordDeletionIds';
import { useSavedDrafts } from '../../hooks/useSavedDrafts';
import { isTodoDraft } from '../../utils/formDrafts';
import { toast } from '../../store/toastStore';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ListTodo, Trash2, Pencil } from '../../icons';
import { useTodoStore } from '../../store/todoStore';
import type { Todo } from '../../types';
import OnjuIcon from '../ui/OnjuIcon';
import FAB from '../ui/FAB';
import ActionMenu from '../ui/ActionMenu';
import EmptyState from '../ui/EmptyState';
import ConfirmModal from '../ui/ConfirmModal';

export default function TodoTab({ date, readOnly, hideCompleted = false, onShowCompleted }: { date: string; readOnly: boolean; hideCompleted?: boolean; onShowCompleted?: () => void }) {
  const navigate = useNavigate();
  const { todos, toggleTodo, removeTodo } = useTodoStore();
  const [deleting, setDeleting] = useState<Todo | null>(null);
  const deletionIds=useRecordDeletionIds();
  const drafts=useSavedDrafts('todo:',isTodoDraft);
  const attempt=(action:()=>void)=>{try{action();}catch(error){toast.error(error instanceof Error?error.message:'저장하지 못했어요. 다시 시도해주세요.');}};
  const entries = todos.filter(todo => todo.date === date);
  const pending = entries.filter(todo => !todo.completed);
  const completed = entries.filter(todo => todo.completed);
  const row = (todo: Todo) => (
    <div key={todo.id} className="habit-paper-row flex min-h-[72px] items-center gap-2 px-3 py-2.5">
      <OnjuIcon emoji={todo.emoji} fallback="📝" size={30} className="shrink-0" />
      {readOnly ? <span className={`min-w-0 flex-1 break-words text-body2 font-semibold ${todo.completed ? 'line-through text-label-alt' : 'text-label-strong'}`}>{todo.title}</span>
        : <button disabled={deletionIds.includes(`todo:${todo.id}`)} onClick={() => navigate(`/todos/edit/${todo.id}`)} aria-label={`${todo.title} 수정`}
          className={`min-h-11 min-w-0 flex-1 break-words text-left text-body2 font-semibold ${todo.completed ? 'line-through text-label-alt' : 'text-label-strong'}`}>{todo.title}</button>}
      {deletionIds.includes(`todo:${todo.id}`)&&<span className="text-caption2">삭제 확인 중</span>}
      {readOnly ? <span className="shrink-0 text-caption1 text-label-alt">{todo.completed ? '완료' : '미완료'}</span> : <>
        <button disabled={deletionIds.includes(`todo:${todo.id}`)} onClick={() => attempt(()=>toggleTodo(todo.id))} aria-label={`${todo.title} ${todo.completed ? '미완료' : '완료'}로 표시`} aria-pressed={todo.completed}
          className="completion-button">
          <Check size={19} />
        </button>
        <ActionMenu title={todo.title} disabled={deletionIds.includes('todo:' + todo.id)} actions={[
          { label: '할 일 수정', icon: <Pencil size={18} />, onClick: () => navigate('/todos/edit/' + todo.id) },
          { label: '할 일 삭제', icon: <Trash2 size={18} />, danger: true, onClick: () => setDeleting(todo) },
        ]} />
      </>}
    </div>
  );
  return <>
    {drafts.error&&<p role="alert" className="p-4">남겨둔 초안을 읽지 못했어요. 저장 공간을 확인해주세요.</p>}
    {drafts.drafts.length>0&&<details className="mx-4 rounded-xl border border-line p-3"><summary className="min-h-11 font-bold">남겨둔 할 일 초안 {drafts.drafts.length}개</summary>{drafts.drafts.map(d=><button key={d.document} className="block min-h-11 w-full text-left text-primary" onClick={()=>navigate(d.document==='todo:new'?'/todos/new':`/todos/edit/${d.document.slice(5)}`)}>{d.values.title||'작성 중인 할 일'}{d.values.base?` · ${d.values.base.date}`:''}</button>)}</details>}

    {entries.length === 0 ? <EmptyState title={readOnly ? '이날 기록한 할 일이 없어요' : '오늘 할 일을 적어보세요'}
      description={readOnly ? '다른 날짜의 기록도 살펴보세요.' : '작은 일 하나부터 적고, 마칠 때마다 체크해보세요.'}
      action={!readOnly && <button className="min-h-11 px-4 font-bold text-primary" onClick={() => navigate('/todos/new')}>첫 할 일 추가하기</button>} />
      : <div className="routine-paper-group mx-3 overflow-hidden divide-y divide-line-soft">
        {pending.map(row)}
        {hideCompleted && pending.length === 0 && <EmptyState title="할 일을 모두 마쳤어요" description="필요하면 완료한 항목을 펼쳐 다시 확인하세요."
          action={<button className="min-h-11 px-4 font-bold text-primary" onClick={onShowCompleted}>완료 기록 보기</button>} />}
        {!hideCompleted && completed.length > 0 && <><p className="bg-surface-alt px-4 py-3 text-caption1 font-bold text-label-alt">완료한 할 일 {completed.length}개</p>{completed.map(row)}</>}
      </div>}
    {!readOnly && <FAB options={[{ icon: <ListTodo size={20} />, label: '할 일 추가', onClick: () => navigate('/todos/new') }]} />}
    <ConfirmModal isOpen={deleting !== null} title="할 일을 삭제할까요?" message={deleting ? `“${deleting.title}” 기록이 삭제돼요.` : undefined}
      onCancel={() => setDeleting(null)} onConfirm={() => { if (deleting && !readOnly) attempt(()=>removeTodo(deleting.id,deleting)); setDeleting(null); }} />
  </>;
}
