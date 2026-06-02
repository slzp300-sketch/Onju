import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { saveUserData, restoreUserData, clearStores } from '../utils/storeManager';

interface Account {
  id: string;
  name: string;
  email: string;
  password: string;
  weeklyGoalSlots: number;
  onboardingDone: boolean;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  onboardingDone: boolean;
  signup: (name: string, email: string, password: string) => { success: boolean; error?: string };
  login: (email: string, password: string) => { success: boolean; error?: string };
  socialLogin: (provider: 'google' | 'kakao', profile: { id: string; name: string; email?: string }) => void;
  logout: () => void;
  setOnboardingDone: () => void;
  updateWeeklySlots: (slots: number) => void;
}

function getAccounts(): Account[] {
  try { return JSON.parse(localStorage.getItem('jikjang_accounts') ?? '[]'); }
  catch { return []; }
}

function saveAccounts(accounts: Account[]) {
  localStorage.setItem('jikjang_accounts', JSON.stringify(accounts));
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      onboardingDone: false,

      signup: (name, email, password) => {
        const accounts = getAccounts();
        if (accounts.some(a => a.email === email)) {
          return { success: false, error: '이미 사용 중인 이메일이에요.' };
        }
        const id = `user-${Date.now()}`;
        saveAccounts([...accounts, { id, name, email, password, weeklyGoalSlots: 3, onboardingDone: false }]);
        clearStores();
        set({ user: { id, name, email, weeklyGoalSlots: 3 }, isAuthenticated: true, onboardingDone: false });
        return { success: true };
      },

      login: (email, password) => {
        const account = getAccounts().find(a => a.email === email && a.password === password);
        if (!account) return { success: false, error: '이메일 또는 비밀번호가 올바르지 않아요.' };
        restoreUserData(account.id);
        set({
          user: { id: account.id, name: account.name, email: account.email, weeklyGoalSlots: account.weeklyGoalSlots },
          isAuthenticated: true,
          onboardingDone: account.onboardingDone,
        });
        return { success: true };
      },

      socialLogin: (provider, profile) => {
        const accounts = getAccounts();
        const socialId = `${provider}-${profile.id}`;
        let account = accounts.find(a => a.id === socialId);
        if (!account) {
          account = {
            id: socialId,
            name: profile.name,
            email: profile.email ?? `${socialId}@social`,
            password: '',
            weeklyGoalSlots: 3,
            onboardingDone: false,
          };
          saveAccounts([...accounts, account]);
          clearStores();
        } else {
          restoreUserData(account.id);
        }
        set({
          user: { id: account.id, name: account.name, email: account.email, weeklyGoalSlots: account.weeklyGoalSlots },
          isAuthenticated: true,
          onboardingDone: account.onboardingDone,
        });
      },

      logout: () => {
        const { user } = get();
        if (user) saveUserData(user.id);
        clearStores();
        set({ user: null, isAuthenticated: false, onboardingDone: false });
      },

      setOnboardingDone: () => {
        const { user } = get();
        if (user) {
          saveAccounts(getAccounts().map(a => a.id === user.id ? { ...a, onboardingDone: true } : a));
        }
        set({ onboardingDone: true });
      },

      updateWeeklySlots: (slots) => {
        const { user } = get();
        if (!user) return;
        saveAccounts(getAccounts().map(a => a.id === user.id ? { ...a, weeklyGoalSlots: slots } : a));
        set({ user: { ...user, weeklyGoalSlots: slots } });
      },
    }),
    { name: 'auth-store' }
  )
);
