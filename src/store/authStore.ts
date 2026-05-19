import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';
import { mockUser } from '../mocks/data/seed';

interface AuthState {
  user: User;
  onboardingDone: boolean;
  setUser: (user: User) => void;
  updateWeeklySlots: (slots: number) => void;
  setOnboardingDone: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: mockUser,
      onboardingDone: false,
      setUser: (user) => set({ user }),
      updateWeeklySlots: (slots) =>
        set((state) => ({ user: { ...state.user, weeklyGoalSlots: slots } })),
      setOnboardingDone: () => set({ onboardingDone: true }),
    }),
    { name: 'auth-store' }
  )
);
