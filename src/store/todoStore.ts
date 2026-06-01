import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Todo } from '../types';

interface TodoState {
  todos: Todo[];
  addTodo: (title: string, date: string) => void;
  removeTodo: (id: string) => void;
  toggleTodo: (id: string) => void;
  getTodayTodos: (date: string) => Todo[];
}

export const useTodoStore = create<TodoState>()(
  persist(
    (set, get) => ({
      todos: [],

      addTodo: (title, date) => {
        const todo: Todo = {
          id: `todo-${Date.now()}`,
          userId: 'user-1',
          title,
          date,
          completed: false,
          createdAt: new Date().toISOString(),
        };
        set(s => ({ todos: [...s.todos, todo] }));
      },

      removeTodo: (id) => {
        set(s => ({ todos: s.todos.filter(t => t.id !== id) }));
      },

      toggleTodo: (id) => {
        set(s => ({
          todos: s.todos.map(t =>
            t.id === id
              ? { ...t, completed: !t.completed, completedAt: !t.completed ? new Date().toISOString() : undefined }
              : t
          ),
        }));
      },

      getTodayTodos: (date) => {
        return get().todos.filter(t => t.date === date);
      },
    }),
    { name: 'todo-store' }
  )
);
