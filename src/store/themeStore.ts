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
  /** 이 티어에서 새로 얻는 것 — [0]=팔레트, [1..]=앰비언스 효과 (상위 티어는 하위 효과 누적) */
  perks: string[];
}

/**
 * 테마 이름은 성장 서사를 따른다: 들녘 → 새싹 → 풀밭 → 우거진 숲 → 황금숲.
 * id는 저장 호환(user_settings·localStorage)을 위해 바꾸지 않는다.
 */
export const THEME_TIERS: ThemeTier[] = [
  {
    id: 'grove',
    name: '들녘',
    description: '씨앗을 기다리는 고요한 들 — 숲 이야기가 시작되는 곳',
    requiredStage: 0,
    preview: { bg: '#f3f7f1', accent: '#2f9e60', leaf: '#57b97c' },
    perks: ['고요한 들녘 팔레트'],
  },
  {
    id: 'sprout',
    name: '새싹',
    description: '첫 잎이 돋는 맑은 민트빛 — 새싹이 트면 열려요',
    requiredStage: 1,
    preview: { bg: '#f0f8f4', accent: '#3bb08f', leaf: '#7fd4b8' },
    perks: ['맑은 민트 팔레트', '그라데이션 버튼', '떠다니는 잎새'],
  },
  {
    id: 'meadow',
    name: '풀밭',
    description: '발밑에 풀이 자라나는 옐로그린 — 묘목이 되면 열려요',
    requiredStage: 2,
    preview: { bg: '#f5f8ec', accent: '#5da033', leaf: '#94c462' },
    perks: ['옐로그린 팔레트', '들빛 햇살 배경', '피어오르는 꽃가루', '바닥에 돋는 풀숲'],
  },
  {
    id: 'deepforest',
    name: '우거진 숲',
    description: '나무가 둘러서는 고요한 틸그린 — 어린나무가 되면 열려요',
    requiredStage: 3,
    preview: { bg: '#eef5f2', accent: '#1d7a68', leaf: '#4fa897' },
    perks: ['틸그린 팔레트', '숲의 빛내림', '은은한 반딧불이', '둘러서는 숲 실루엣'],
  },
  {
    id: 'autumn',
    name: '황금숲',
    description: '열매 맺는 따뜻한 황금빛 — 큰나무가 되면 열려요',
    requiredStage: 4,
    preview: { bg: '#faf5ed', accent: '#c4742a', leaf: '#dfa05c' },
    perks: ['황금빛 팔레트', '노을빛 태양', '흩날리는 낙엽', '열매 맺힌 숲'],
  },
];

/** 테마 → 앰비언스 레벨 (티어가 오를수록 장식 효과 누적: 1 잎새 → 2 +꽃가루 → 3 +반딧불이 → 4 +낙엽) */
export const TIER_LEVEL: Record<ThemeId, 0 | 1 | 2 | 3 | 4> = {
  grove: 0,
  sprout: 1,
  meadow: 2,
  deepforest: 3,
  autumn: 4,
};

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
