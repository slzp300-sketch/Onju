import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
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
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-white border-b border-gray-100">
        <motion.button
          whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
          onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-500">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-base font-bold text-gray-900">
          {isEdit ? '투두 수정하기' : '투두 추가하기'}
        </h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 px-4 py-5 flex flex-col gap-5 pb-28">
        {/* 이모지 + 제목 */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">할 일</p>
          <div className="flex gap-2">
            <EmojiPickerButton emoji={emoji} onChange={setEmoji} />
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="오늘 해야 할 일을 입력하세요"
              autoFocus
              className="flex-1 h-14 bg-white border border-gray-200 rounded-2xl px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
            />
          </div>
        </div>

        {!isEdit && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="text-xl">📅</span>
              <div>
                <p className="text-sm font-semibold text-gray-800">오늘 날짜로 등록돼요</p>
                <p className="text-xs text-gray-400 mt-0.5">{todayStr}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 하단 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-white border-t border-gray-100"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <motion.button
          whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
          onClick={handleSubmit}
          disabled={!title.trim()}
          className="w-full py-4 mt-3 rounded-2xl bg-indigo-500 text-white font-bold text-base disabled:opacity-40 hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-200"
        >
          {isEdit ? '수정 완료' : '추가하기'}
        </motion.button>
      </div>
    </div>
  );
}
