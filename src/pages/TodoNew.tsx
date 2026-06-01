import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { useTodoStore } from '../store/todoStore';
import { today } from '../utils/date';

export default function TodoNew() {
  const navigate = useNavigate();
  const { addTodo } = useTodoStore();
  const todayStr = today();

  const [title, setTitle] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    addTodo(title.trim(), todayStr);
    navigate(-1);
  };

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-white border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-500">
          <ChevronLeft size={24} />
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-gray-900">투두 추가하기</h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 px-4 py-5 flex flex-col gap-5 pb-28">
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">할 일</p>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="오늘 해야 할 일을 입력하세요"
            autoFocus
            className="w-full h-14 bg-white border border-gray-200 rounded-2xl px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
          />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
          <div className="flex items-center gap-3">
            <span className="text-xl">📅</span>
            <div>
              <p className="text-sm font-semibold text-gray-800">오늘 날짜로 등록돼요</p>
              <p className="text-xs text-gray-400 mt-0.5">{todayStr}</p>
            </div>
          </div>
        </div>
      </div>

      {/* 하단 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-white border-t border-gray-100"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={handleSubmit}
          disabled={!title.trim()}
          className="w-full py-4 mt-3 rounded-2xl bg-indigo-500 text-white font-bold text-base disabled:opacity-40 hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-200"
        >
          추가하기
        </button>
      </div>
    </div>
  );
}
