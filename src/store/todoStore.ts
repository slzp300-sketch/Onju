import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Todo } from '../types';
import { isOutboxOwner } from '../lib/sync/outbox';
import { todoFromRow } from '../data/mappers';
import { newId } from '../utils/id';
import { upsertTodo, deleteTodo } from '../data/repos';

interface TodoState {
  todos: Todo[];
  addTodo: (title: string, date: string, emoji?: string, id?: string) => void;
  removeTodo: (id: string, base?: Todo) => void;
  toggleTodo: (id: string) => void;
  updateTodo: (id: string, title: string, emoji?: string, base?: Todo) => void;
  getTodayTodos: (date: string) => Todo[];
}

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: [],

      addTodo: (title, date, emoji, id = newId()) => {
        if (get().todos.some(t => t.id === id)) return;
        const todo: Todo = {
          id, revision:newId(),
          userId: '',
          title,
          ...(emoji ? { emoji } : {}),
          date,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        upsertTodo(todo,null,'create');
        set(s => ({ todos: [...s.todos, todo] }));
      },

      removeTodo: (id, base) => {
        const current=get().todos.find(t=>t.id===id), previous=base??current;
        if(!previous || previous.id!==id || JSON.stringify(current)!==JSON.stringify(previous)) throw new Error('할 일이 바뀌었어요. 다시 확인해주세요.');
        deleteTodo(previous);
      },
      toggleTodo: (id) => {
        const previous=get().todos.find(t=>t.id===id);if(!previous)return;
        const next={...previous,revision:newId(),completed:!previous.completed,completedAt:!previous.completed?new Date().toISOString():undefined};
        upsertTodo(next,previous.revision??null,'complete');
        set(s=>({todos:s.todos.map(t=>t.id===id?next:t)}));
      },
      updateTodo: (id,title,emoji,base) => {
        const previous=base??get().todos.find(t=>t.id===id);
        if(!previous || previous.id!==id)throw new Error('할 일을 다시 확인해주세요.');
        const next={...previous,title,emoji:emoji??previous.emoji,revision:newId()};
        upsertTodo(next,previous.revision??null);
        set(s=>({todos:[...s.todos.filter(t=>t.id!==id),next]}));
      },

      getTodayTodos: (date) => {
        return get().todos.filter(t => t.date === date);
      },
    }),
    { name: 'todo-store' }
  )
);

if(typeof window!=='undefined')window.addEventListener('onju-record-saved',event=>{
  const {ownerId,kind,id,revision,current}=(event as CustomEvent).detail;
  if(kind!=='todo' || !isOutboxOwner(ownerId))return;
  useTodoStore.setState(s=>({todos:s.todos.flatMap(t=>t.id!==id || t.revision!==revision?[t]:current?[todoFromRow(current)]:[])}));
});
