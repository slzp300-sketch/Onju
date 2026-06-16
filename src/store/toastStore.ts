import { create } from 'zustand';
import { newId } from '../utils/id';

export type ToastType = 'error' | 'success' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastState {
  toasts: ToastItem[];
  show: (message: string, type?: ToastType) => void;
  dismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 3500;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: (message, type = 'info') => {
    // 같은 메시지가 이미 떠 있으면 무시 — 오프라인 시 다중 실패 스팸 방지
    if (get().toasts.some(t => t.message === message)) return;
    const id = newId();
    set(s => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => get().dismiss(id), AUTO_DISMISS_MS);
  },
  dismiss: (id) => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })),
}));

/** React 밖(queryClient 등)에서도 호출하기 위한 헬퍼. */
export const toast = {
  error: (message: string) => useToastStore.getState().show(message, 'error'),
  success: (message: string) => useToastStore.getState().show(message, 'success'),
  info: (message: string) => useToastStore.getState().show(message, 'info'),
};
