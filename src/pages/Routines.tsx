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
        <div className="flex border-b border-line-soft">
          {(['personal', 'faith', 'todo'] as TabType[]).map((key, i) => {
            const label = ['개인', '신앙', '투두'][i];
            return (
              <button key={key} onClick={() => setActiveTab(key)}
                className={`flex-1 pb-2.5 text-label1 font-bold transition-colors relative ${activeTab === key ? 'text-label-strong' : 'text-label-assistive'}`}>
                {label}
                {activeTab === key && <motion.div layoutId="tabLine" className="absolute bottom-0 left-4 right-4 h-0.5 bg-label-strong rounded-full" />}
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
      <div className="px-4 py-3 border-b border-line-soft flex items-center justify-between">
        <div>
          <p className="text-label1 font-bold text-label-strong">오늘의 할 일</p>
          <p className="text-caption1 text-label-alt mt-0.5">
            {pending.length > 0 ? `${pending.length}개 남음` : done.length > 0 ? '모두 완료했어요!' : '할 일을 추가해 보세요'}
          </p>
        </div>
        {todayTodos.length > 0 && (
          <span className={`text-caption2 font-bold px-2 py-0.5 rounded ${done.length === todayTodos.length ? 'bg-primary-soft text-primary' : 'bg-fill text-label-alt'}`}>
            {done.length}/{todayTodos.length}
          </span>
        )}
      </div>

      <AnimatePresence>
        {showInput && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-b border-line-soft">
            <div className="flex items-center gap-2 px-4 py-3">
              <input autoFocus type="text" value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setShowInput(false); }}
                placeholder="할 일 입력..." className="flex-1 text-body2 outline-none placeholder-label-assistive text-label" />
              <button onClick={() => setShowInput(false)} className="text-label-assistive hover:text-label-alt"><X size={15} /></button>
              <button onClick={handleAdd} disabled={!input.trim()} className="text-label2 font-bold text-primary disabled:text-label-assistive ml-1">추가</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {todayTodos.length === 0 && !showInput ? (
        <div className="px-4 py-6">
          <button onClick={() => setShowInput(true)}
            className="w-full flex items-center justify-center gap-1.5 py-4 border-2 border-dashed border-line rounded-xl hover:border-primary transition-colors">
            <Plus size={14} className="text-label-assistive" />
            <span className="text-body2 text-label-alt">오늘의 할 일을 추가해 보세요</span>
          </button>
        </div>
      ) : (
        <div className="bg-surface">
          <div className="divide-y divide-line-soft">
            {pending.map((todo, idx) => (
              <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-caption2 font-bold w-5 text-center text-label-assistive flex-shrink-0">{idx + 1}</span>
                <button onClick={() => toggleTodo(todo.id)} className="w-5 h-5 rounded-full border-2 border-line flex-shrink-0 hover:border-primary transition-colors" />
                <span className="flex-1 text-body2 font-medium text-label">{todo.title}</span>
                <button onClick={() => removeTodo(todo.id)} className="text-label-assistive hover:text-negative transition-colors"><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
          {done.length > 0 && (
            <>
              <div className="px-4 py-2 bg-surface-alt border-y border-line-soft">
                <span className="text-caption2 font-bold text-label-assistive">완료 {done.length}개</span>
              </div>
              <div className="divide-y divide-line-soft">
                {done.map((todo, idx) => (
                  <div key={todo.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-caption2 font-bold w-5 text-center text-label-assistive flex-shrink-0">{pending.length + idx + 1}</span>
                    <button onClick={() => toggleTodo(todo.id)} className="w-5 h-5 rounded-full border-2 border-primary bg-primary flex items-center justify-center flex-shrink-0">
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none"><path d="M1 3.5L3 5.5L8 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <span className="flex-1 text-body2 font-medium line-through text-label-assistive">{todo.title}</span>
                    <button onClick={() => removeTodo(todo.id)} className="text-label-assistive hover:text-negative transition-colors"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="px-4 py-3 border-t border-line-soft">
            <button onClick={() => setShowInput(true)}
              className="w-full flex items-center justify-center gap-1 py-2.5 rounded-lg border border-dashed border-line text-label-assistive text-caption1 font-semibold hover:border-primary hover:text-primary transition-colors">
              <Plus size={13} /> 할 일 추가
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
