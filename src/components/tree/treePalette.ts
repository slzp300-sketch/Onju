import type { TreeHealth } from '../../utils/treeGrowth';

/** 건강도별 나무 색 — healthy(싱싱) / dry(약간 시듦) / wilted(시듦) */
export const HEALTH_COLORS: Record<
  TreeHealth,
  { leafA: string; leafB: string; leafC: string; trunk: string; fruit: string }
> = {
  healthy: { leafA: '#57b97c', leafB: '#2f9e60', leafC: '#7fc98f', trunk: '#8a6a4a', fruit: '#e8954a' },
  dry:     { leafA: '#a8b86a', leafB: '#8a9b4f', leafC: '#bcc77e', trunk: '#8a6a4a', fruit: '#caa05a' },
  wilted:  { leafA: '#b09a5a', leafB: '#8f7a45', leafC: '#c2ad72', trunk: '#7a5f43', fruit: '#a98c54' },
};

/** 숲 컨셉 confetti 팔레트 (그린·골드) */
export const CONFETTI_FOREST = ['#2f9e60', '#7fc98f', '#d9a13b', '#b7e0c0'];
