import type { GroupCategory, GroupStatus, SmallGroup } from '../types';

export const GROUP_STATUS_META: Record<GroupStatus, { label: string; color: 'green' | 'indigo' | 'gray' }> = {
  recruiting: { label: '모집 중', color: 'green' },
  active: { label: '진행 중', color: 'indigo' },
  completed: { label: '완료', color: 'gray' },
};

// 종료일이 지나면 자동으로 '완료'로 간주
export function effectiveStatus(g: Pick<SmallGroup, 'status' | 'endDate'>): GroupStatus {
  if (g.status !== 'completed' && new Date(g.endDate).getTime() < Date.now()) return 'completed';
  return g.status;
}

export const GROUP_CATEGORIES: { key: GroupCategory; label: string; emoji: string }[] = [
  { key: 'faith', label: '신앙', emoji: '🙏' },
  { key: 'growth', label: '자기계발', emoji: '🌱' },
  { key: 'work', label: '직장', emoji: '💼' },
  { key: 'health', label: '운동·건강', emoji: '💪' },
  { key: 'etc', label: '기타', emoji: '✨' },
];

export const GROUP_CATEGORY_LABEL = Object.fromEntries(
  GROUP_CATEGORIES.map(c => [c.key, c.label])
) as Record<GroupCategory, string>;

// 커버 프리셋
export const COVER_EMOJIS = ['🌅', '🙏', '💪', '📖', '🏃', '☀️', '🔥', '🌱', '✝️', '🎯'];
export const GROUP_COLORS = ['#0066FF', '#7C7FF5', '#00BF40', '#FF6B6B', '#F59E0B', '#06B6D4'];

// 약속(규칙) 프리셋
export const GROUP_RULES = [
  '매일 루틴 인증하기',
  '주간 회고 나눔하기',
  '서로 응원하기',
  '결석 시 사유 남기기',
];
