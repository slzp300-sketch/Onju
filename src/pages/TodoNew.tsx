import { readDraft } from '../lib/localDrafts';
import { useAuthStore } from '../store/authStore';
import { useRecordDeletionIds } from '../hooks/useRecordDeletionIds';
import FormBoundary from '../components/FormBoundary';
import { useLocalDraft } from '../hooks/useLocalDraft';
import { useLocalNow } from '../hooks/useLocalNow';
import { isTodoDraft } from '../utils/formDrafts';
import { newId } from '../utils/id';
import { useState } from 'react';
import { useFormProtection } from '../hooks/useFormProtection';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Calendar } from '../icons';
import { motion } from 'framer-motion';
import { useTodoStore } from '../store/todoStore';
import { today, isEditableDay } from '../utils/date';
import { useSettingsStore } from '../store/settingsStore';
import { useUIStore } from '../store/uiStore';
import EmptyState from '../components/ui/EmptyState';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import type { Todo } from '../types';
import EmojiPickerButton from '../components/ui/EmojiPickerButton';

export default function TodoNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const todos = useTodoStore(s => s.todos);
  const graceEndHour = useSettingsStore(s => s.graceEndHour);
  const dataHydrated = useUIStore(s => s.dataHydrated);
  useLocalNow();

  const owner=useAuthStore(s=>s.user?.id);
  let saved;
  if(id&&owner){try{saved=readDraft(owner,`todo:${id}`,isTodoDraft);}catch{/* Keep unreadable drafts. */}}
  const existing = id ? todos.find(t => t.id === id) ?? (saved?.values.base?.id===id?saved.values.base:undefined) : null;
  if (id && !dataHydrated) return <LoadingSpinner />;
  if (id && (!existing || (!isEditableDay(existing.date, graceEndHour) && !saved))) {
    return <EmptyState title={existing ? '지난 기록은 읽기 전용이에요' : '할 일을 찾지 못했어요'} description="홈에서 날짜를 선택해 기록을 확인해주세요."
      action={<button className="min-h-11 px-4 font-bold text-primary" onClick={() => navigate('/', { replace: true })}>홈으로</button>} />;
  }
  return <FormBoundary id={id} exists={!!existing}><TodoEditor existing={existing ?? null} /></FormBoundary>;
}

function TodoEditor({ existing }: { existing: Todo | null }) {
  const navigate = useNavigate();
  const { addTodo, updateTodo } = useTodoStore();
  useLocalNow();
  const todayStr = today();
  const isEdit = existing !== null;
  const [base,setBase]=useState(existing??undefined);
  const pendingDelete=useRecordDeletionIds().includes(`todo:${existing?.id}`);
  const [title, setTitle] = useState(existing?.title ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '📝');
  const [entityId, setEntityId] = useState<string>(newId);
  const draftValues = { base, entityId, title, emoji };
  const draft = useLocalDraft({ document: `todo:${existing?.id ?? 'new'}`, values: draftValues, validate: isTodoDraft,
    restore: v => { setBase(v.base?.id===existing?.id?v.base:existing?{...existing,revision:undefined}:undefined); setEntityId(v.entityId); setTitle(v.title); setEmoji(v.emoji); } });
  const protection = useFormProtection(draftValues, draft.leaveMessage);

  const handleSubmit = () => {
    if (draft.awaitingChoice || pendingDelete || !title.trim()) return;
    if (!protection.save(() => {
      if (isEdit && existing) {
        updateTodo(existing.id, title.trim(), emoji, base);
      } else {
        addTodo(title.trim(), todayStr, emoji, entityId);
      }
      draft.clear();
    })) return;
    navigate('/', { replace: true, state: { homeTab: 'todo' } });
  };

  return (
    <div className="form-paper min-h-dvh flex flex-col">
      {protection.guard}
      <div className="form-paper-header flex items-center px-4 pt-5 pb-3">
        <motion.button
          whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
          onClick={() => protection.requestLeave(() => navigate('/', { replace: true, state: { homeTab: 'todo' } }))} aria-label="뒤로 가기" className="paper-back-button text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">
          {isEdit ? '할 일 수정하기' : '할 일 추가하기'}
        </h1>
        <div className="w-8" />
      </div>

      <div className="px-4 pt-3">{draft.banner}</div>
      {pendingDelete && <p role="status" className="px-4">삭제 결과 확인 중이에요. 입력은 초안으로 남아요.</p>}
      <fieldset disabled={draft.awaitingChoice || pendingDelete} className="contents">
      <div className="flex-1 px-4 py-5 flex flex-col gap-5 pb-28">
        <div>
          <p className="text-caption1 font-bold text-label-alt mb-2">할 일</p>
          <div className="flex gap-2">
            <EmojiPickerButton emoji={emoji} onChange={setEmoji} />
            <input
              type="text"
              aria-label="할 일 이름"
              maxLength={120}
              value={title}
              onChange={e => setTitle(e.target.value)}
              enterKeyHint="done"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                  e.preventDefault(); handleSubmit();
                }
              }}
              placeholder="오늘 해야 할 일을 입력하세요"
              autoFocus
              className="form-paper-input min-w-0 flex-1 text-body2 font-medium"
            />
          </div>
        </div>

        {!isEdit && (
          <div className="form-paper-card px-4 py-4">
            <div className="flex items-center gap-3">
              <Calendar size={20} strokeWidth={1.9} className="text-label-strong" />
              <div>
                <p className="text-body2 font-semibold text-label-strong">오늘 날짜로 등록돼요</p>
                <p className="text-caption1 text-label-alt mt-0.5">{todayStr}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      </fieldset>
      <div className="form-paper-footer fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4"
        style={{ paddingBottom: 'max(1rem, var(--app-safe-bottom))' }}>
        <motion.button
          whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
          onClick={handleSubmit}
          disabled={draft.awaitingChoice || pendingDelete || !title.trim()}
          className="w-full h-12 mt-3 rounded-lg bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors"
        >
          {isEdit ? '수정 완료' : '추가하기'}
        </motion.button>
      </div>
    </div>
  );
}
