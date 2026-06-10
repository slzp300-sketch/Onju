import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTodoStore } from '../store/todoStore';
import { today } from '../utils/date';
import EmojiPickerButton from '../components/ui/EmojiPickerButton';

export default function TodoNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { todos, addTodo, updateTodo } = useTodoStore();
  const todayStr = today();

  const existing = id ? todos.find(t => t.id === id) : null;
  const isEdit = !!existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '📝');

  const handleSubmit = () => {
    if (!title.trim()) return;
    if (isEdit && existing) {
      updateTodo(existing.id, title.trim(), emoji);
    } else {
      addTodo(title.trim(), todayStr, emoji);
    }
    navigate(-1);
  };

  return (
    <div className="min-h-dvh bg-surface-alt flex flex-col">
      <div className="flex items-center px-4 pt-5 pb-3 bg-surface border-b border-line-soft">
        <motion.button
          whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
          onClick={() => navigate(-1)} className="p-1 -ml-1 text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">
          {isEdit ? '투두 수정하기' : '투두 추가하기'}
        </h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 px-4 py-5 flex flex-col gap-5 pb-28">
        <div>
          <p className="text-caption1 font-bold text-label-alt mb-2">할 일</p>
          <div className="flex gap-2">
            <EmojiPickerButton emoji={emoji} onChange={setEmoji} />
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="오늘 해야 할 일을 입력하세요"
              autoFocus
              className="flex-1 h-12 bg-surface border border-line rounded-lg px-4 text-body2 font-medium focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(0,102,255,0.15)] shadow-emphasize transition-all"
            />
          </div>
        </div>

        {!isEdit && (
          <div className="bg-surface rounded-xl border border-line px-4 py-4">
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

      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-surface border-t border-line-soft"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <motion.button
          whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
          onClick={handleSubmit}
          disabled={!title.trim()}
          className="w-full h-12 mt-3 rounded-lg bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors"
        >
          {isEdit ? '수정 완료' : '추가하기'}
        </motion.button>
      </div>
    </div>
  );
}
