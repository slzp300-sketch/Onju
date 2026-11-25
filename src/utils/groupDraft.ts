import type { GroupCategory } from '../types';
import { COVER_ICON_KEYS, GROUP_CATEGORIES, GROUP_COLORS } from './groupMeta';

export interface GroupForm {
  coverIcon: string; color: string; title: string; goal: string; category: GroupCategory;
  maxMembers: number; durationDays: number; rules: string[]; isPublic: boolean;
}
export interface GroupDraft { entityId: string; step: 1 | 2; form: GroupForm; attemptedAt?: string }
export function isGroupDraft(value: unknown): value is GroupDraft {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<GroupDraft>, f = v.form;
  return typeof v.entityId === 'string' && /^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(v.entityId) &&
    (v.step === 1 || v.step === 2) && !!f && typeof f.title === 'string' && typeof f.goal === 'string' &&
    COVER_ICON_KEYS.includes(f.coverIcon) && GROUP_COLORS.includes(f.color) && GROUP_CATEGORIES.some(c => c.key === f.category) &&
    Number.isInteger(f.maxMembers) && f.maxMembers >= 2 && f.maxMembers <= 10 &&
    Number.isInteger(f.durationDays) && f.durationDays >= 7 && f.durationDays <= 90 &&
    Array.isArray(f.rules) && f.rules.every(r => typeof r === 'string') && typeof f.isPublic === 'boolean' &&
    (v.attemptedAt === undefined || (typeof v.attemptedAt === 'string' && Number.isFinite(Date.parse(v.attemptedAt))));
}
