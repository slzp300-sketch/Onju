import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeId = 'light' | 'dark' | 'rose' | 'forest';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  emoji: string;
  description: string;
  preview: { bg: string; card: string; accent: string };
}

export const THEMES: ThemeConfig[] = [
  {
    id: 'light',
    name: '라이트',
    emoji: '☀️',
    description: '깔끔한 화이트 테마',
    preview: { bg: '#f7f8fa', card: '#ffffff', accent: '#6366f1' },
  },
  {
    id: 'dark',
    name: '다크',
    emoji: '🌙',
    description: '눈이 편안한 다크 테마',
    preview: { bg: '#1c1e26', card: '#252830', accent: '#7c7ff5' },
  },
  {
    id: 'rose',
    name: '로즈',
    emoji: '🌸',
    description: '부드러운 블러시 테마',
    preview: { bg: '#fdf0f2', card: '#ffffff', accent: '#d4546a' },
  },
  {
    id: 'forest',
    name: '포레스트',
    emoji: '🌿',
    description: '차분한 세이지 그린 테마',
    preview: { bg: '#f2f5f0', card: '#fafcf9', accent: '#5e8f6a' },
  },
];

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'light',
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
    }),
    { name: 'theme-store' }
  )
);

export function applyTheme(theme: ThemeId) {
  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
}
