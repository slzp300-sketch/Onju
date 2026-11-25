import { create } from 'zustand';

const KEY = 'onju-password-recovery';
function remember(userId: string | null) {
  try {
    if (userId) sessionStorage.setItem(KEY, userId);
    else sessionStorage.removeItem(KEY);
  } catch { /* 기기 저장소가 막혀도 현재 화면의 복구는 가능 */ }
}

interface RecoveryState {
  userId: string | null;
  processing: boolean;
  error: string | null;
  begin: (userId: string) => void;
  restore: (userId: string | null) => void;
  verify: () => void;
  fail: () => void;
  finish: () => void;
}

export const usePasswordRecoveryStore = create<RecoveryState>((set, get) => ({
  userId: null, processing: false, error: null,
  begin: userId => { remember(userId); set({ userId, processing: false, error: null }); },
  restore: userId => {
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(KEY); } catch { /* 저장소 제한 */ }
    if (userId && (get().userId === userId || saved === userId)) {
      set({ userId, processing: false, error: null });
    } else {
      remember(null);
      set({ userId: null, error: null });
    }
  },
  verify: () => { remember(null); set({ userId: null, processing: true, error: null }); },
  fail: () => {
    remember(null);
    set({ userId: null, processing: false, error: '재설정 링크를 확인하지 못했어요. 메일을 요청한 기기에서 새 링크를 열어주세요.' });
  },
  finish: () => { remember(null); set({ userId: null, processing: false, error: null }); },
}));
