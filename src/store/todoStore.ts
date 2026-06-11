import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Todo } from '../types';
import { newId } from '../utils/id';
import { upsertTodo, deleteTodo } from '../data/repos';

interface TodoState {
  todos: Todo[];
  addTodo: (title: string, date: string, emoji?: string) => void;
  removeTodo: (id: string) => void;
  toggleTodo: (id: string) => void;
  updateTodo: (id: string, title: string, emoji?: string) => void;
  getTodayTodos: (date: string) => Todo[];
}

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: [],

      addTodo: (title, date, emoji) => {
        const todo: Todo = {
          id: newId(),
          userId: '',
          title,
          ...(emoji ? { emoji } : {}),
          date,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        set(s => ({ todos: [...s.todos, todo] }));
        upsertTodo(todo);
      },

      removeTodo: (id) => {
        set(s => ({ todos: s.todos.filter(t => t.id !== id) }));
        deleteTodo(id);
      },

      toggleTodo: (id) => {
        set(s => ({
          todos: s.todos.map(t =>
            t.id === id
              ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined }
              : t
          ),
        }));
        const found = get().todos.find(t => t.id === id);
        if (found) upsertTodo(found);
      },

      updateTodo: (id, title, emoji) => {
        set(s => ({ todos: s.todos.map(t => t.id === id ? { ...t, title, ...(emoji !== undefined ? { emoji } : {}) } : t) }));
        const found = get().todos.find(t => t.id === id);
        if (found) upsertTodo(found);
      },

      getTodayTodos: (date) => {
        return get().todos.filter(t => t.date === date);
      },
    }),
    { name: 'todo-store' }
  )
);
