import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTodoStore } from '../store/todoStore';
import { today } from '../utils/date';
import PersonalTab from '../components/tabs/PersonalTab';
import FaithTab from '../components/tabs/FaithTab';

type TabType = 'personal' | 'faith' | 'todo';

export default function Routines() {
  const [activeTab, setActiveTab] = useState<TabType>('personal');

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-5 pb-0">
        <div className="flex border-b border-gray-100">
          {(['personal', 'faith', 'todo'] as TabType[]).map((key, i) => {
            const label = ['개인', '신앙', '투두'][i];
            return (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-1 pb-2.5 text-sm font-bold transition-colors relative ${activeTab === key ? 'text-gray-900' : 'text-gray-400'}`}>
                {label}
                {activeTab === key && <motion.div layoutId="tabLine" className="absolute bottom-0 left-4 right-4 h-0.5 bg-gray-900 rounded-full" />}
              </button>
            );
          })}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'personal' && (
          <motion.div key="p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 overflow-y-auto pb-24">
            <PersonalTab />
          </motion.div>
        )}
        {activeTab === 'faith' && (
          <motion.div key="f" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 overflow-y-auto pb-24">
            <FaithTab />
          </motion.div>
        )}
        {activeTab === 'todo' && (
          <motion.div key="t" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 overflow-y-auto pb-24">
            <TodoTab />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TodoTab() {
  const todayStr = today();
  const { todos, addTodo, removeTodo, toggleTodo } = useTodoStore();
  const [input, setInput] = useState('');
  const [showInput, setShowInput] = useState(false);

  const todayTodos = todos.filter(t => t.date === todayStr);
  const pending = todayTodos.filter(t => !t.completed);
  const done = todayTodos.filter(t => t.completed);

  const handleAdd = () => {
    if (!input.trim()) return;
    addTodo(input.trim(), todayStr);
    setInput(''); setShowInput(false);
  };

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-gray-50 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-gray-900">오늘의 할 일</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {pending.length > 0 ? `${pending.length}개 남음` : done.length > 0 ? '모두 완료! 🎉' : '할 일을 추가해 보세요'}
          </p>
        </div>
        {todayTodos.length > 0 && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${done.length === todayTodos.length ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'}`}>
            {done.length}/{todayTodos.length}
          </span>
        )}
      </div>

      <AnimatePresence>
        {showInput && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-gray-100">
            <div className="flex items-center gap-2 px-4 py-3">
              <input autoFocus type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowInput(false); }}
                placeholder="할 일 입력..." className="flex-1 text-sm outline-none placeholder-gray-300" />
              <button onClick={() => setShowInput(false)} className="text-gray-300 hover:text-gray-500"><X size={15} /></button>
              <button onClick={handleAdd} disabled={!input.trim()} className="text-xs font-bold text-indigo-500 disabled:text-gray-300 ml-1">추가</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {todayTodos.length === 0 && !showInput ? (
        <div className="px-4 py-6">
          <button onClick={() => setShowInput(true)}
            className="w-full flex items-center justify-center gap-1.5 py-4 border-2 border-dashed border-gray-200 rounded-2xl hover:border-indigo-300 transition-colors">
            <Plus size={14} className="text-gray-400" />
            <span className="text-sm text-gray-400">오늘의 할 일을 추가해 보세요</span>
          </button>
        </div>
      ) : (
        <div className="bg-white">
          <div className="divide-y divide-gray-50">
            {pending.map((todo, idx) => (
              <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xs font-bold w-5 text-center text-gray-400 flex-shrink-0">{idx + 1}</span>
                <button onClick={() => toggleTodo(todo.id)} className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0 hover:border-indigo-400 transition-colors" />
                <span className="flex-1 text-sm font-medium text-gray-800">{todo.title}</span>
                <button onClick={() => removeTodo(todo.id)} className="text-gray-200 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          {done.length > 0 && (
            <>
              <div className="px-4 py-2 bg-gray-50 border-y border-gray-100">
                <span className="text-xs font-bold text-gray-400">완료 {done.length}개</span>
              </div>
              <div className="divide-y divide-gray-50">
                {done.map((todo, idx) => (
                  <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xs font-bold w-5 text-center text-gray-300 flex-shrink-0">{pending.length + idx + 1}</span>
                    <button onClick={() => toggleTodo(todo.id)} className="w-5 h-5 rounded-full border-2 border-indigo-400 bg-indigo-400 flex items-center justify-center flex-shrink-0">
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <span className="flex-1 text-sm font-medium line-through text-gray-400">{todo.title}</span>
                    <button onClick={() => removeTodo(todo.id)} className="text-gray-200 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="px-4 py-3 border-t border-gray-50">
            <button onClick={() => setShowInput(true)}
              className="w-full flex items-center justify-center gap-1 py-2.5 rounded-xl border border-dashed border-gray-200 text-gray-400 text-xs font-semibold hover:border-indigo-300 hover:text-indigo-500 transition-colors">
              <Plus size={13} /> 할 일 추가
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
