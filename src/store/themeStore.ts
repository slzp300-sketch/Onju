import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 숲 테마 티어 — 나무 성장 단계(treeGrowth stage)로 해금된다.
 * '밤의 숲'(다크)은 추후 티어로 검토.
 */
export type ThemeId = 'grove' | 'sprout' | 'meadow' | 'deepforest' | 'autumn';

export interface ThemeTier {
  id: ThemeId;
  name: string;
  description: string;
  /** 해금에 필요한 나무 성장 단계 (0=기본 제공) */
  requiredStage: 0 | 1 | 2 | 3 | 4;
  preview: { bg: string; accent: string; leaf: string };
}

export const THEME_TIERS: ThemeTier[] = [
  {
    id: 'grove',
    name: '숲',
    description: '온주의 기본 숲 테마',
    requiredStage: 0,
    preview: { bg: '#f3f7f1', accent: '#2f9e60', leaf: '#57b97c' },
  },
  {
    id: 'sprout',
    name: '새싹',
    description: '맑은 민트빛 — 새싹이 트면 열려요',
    requiredStage: 1,
    preview: { bg: '#f0f8f4', accent: '#3bb08f', leaf: '#7fd4b8' },
  },
  {
    id: 'meadow',
    name: '풀잎',
    description: '싱그러운 옐로그린 — 묘목이 되면 열려요',
    requiredStage: 2,
    preview: { bg: '#f5f8ec', accent: '#5da033', leaf: '#94c462' },
  },
  {
    id: 'deepforest',
    name: '깊은숲',
    description: '고요한 틸그린 — 어린나무가 되면 열려요',
    requiredStage: 3,
    preview: { bg: '#eef5f2', accent: '#1d7a68', leaf: '#4fa897' },
  },
  {
    id: 'autumn',
    name: '가을숲',
    description: '따뜻한 앰버 — 큰나무가 되면 열려요',
    requiredStage: 4,
    preview: { bg: '#faf5ed', accent: '#c4742a', leaf: '#dfa05c' },
  },
];

const VALID_IDS = new Set<string>(THEME_TIERS.map(t => t.id));

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'grove',
      setTheme: (theme) => {
        set({ theme });
        applyTheme(theme);
      },
    }),
    {
      name: 'theme-store',
      version: 1,
      // 구 4테마(light/dark/rose/forest) 값은 grove로 흡수
      migrate: (state) => {
        const s = state as { theme?: string } | undefined;
        return { theme: s?.theme && VALID_IDS.has(s.theme) ? (s.theme as ThemeId) : 'grove' };
      },
    }
  )
);

export function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute('data-theme', VALID_IDS.has(theme) ? theme : 'grove');
}
