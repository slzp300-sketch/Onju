import type { HabitChange, RoutineChange } from '../types';

export interface ReviewSnapshot {
  personalRate: number; faithRate: number; combinedRate: number;
  goalAchievedCount: number; goalTotalCount: number;
}
export interface ReviewDraft {
  submissionIds: Record<string, string>;
  changesAppliedAt?: string;
  snapshot?: ReviewSnapshot;
  step: number; mood: 'hard' | 'normal' | 'easy' | null; comment: string; intention: string;
  routineChanges: RoutineChange[]; habitChanges: HabitChange[]; shareToGroups: string[];
}
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const base = (v: unknown, id: string) => v === undefined || (record(v) && v.id === id && typeof v.title === 'string' && typeof v.createdAt === 'string' && (v.revision === undefined || typeof v.revision === 'string'));
const days = (v: unknown) => Array.isArray(v) && v.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
function changes(v: unknown, habit: boolean) {
  if (v === undefined) return true;
  if (!record(v)) return false;
  return Object.entries(v).every(([k, value]) => {
    if (['title','when','twoMinuteHabit','emoji','miniRoutine'].includes(k)) return typeof value === 'string';
    if (k === 'weeklyGoalId') return value === null || typeof value === 'string';
    if (k === 'customDays') return days(value);
    if (k === 'frequency') return ['daily','weekdays','weekends',...(habit ? ['custom'] : [])].includes(String(value)) || (!habit && days(value));
    return false;
  });
}
export function isReviewDraft(value: unknown): value is ReviewDraft {
  if (!record(value) || !record(value.submissionIds) || typeof value.submissionIds.review !== 'string' || !Object.values(value.submissionIds).every(id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) || !Number.isInteger(value.step) || Number(value.step) < 0 || Number(value.step) > 3 ||
    ![null,'hard','normal','easy'].includes(value.mood as string | null) || typeof value.comment !== 'string' || typeof value.intention !== 'string' ||
    !Array.isArray(value.shareToGroups) || !value.shareToGroups.every(x => typeof x === 'string')) return false;
  if (value.changesAppliedAt !== undefined && (typeof value.changesAppliedAt !== 'string' || !Number.isFinite(Date.parse(value.changesAppliedAt)))) return false;
  const snapshot = value.snapshot;
  if (snapshot !== undefined && (!record(snapshot) || !['personalRate','faithRate','combinedRate','goalAchievedCount','goalTotalCount'].every(k => typeof snapshot[k] === 'number' && Number.isFinite(snapshot[k])))) return false;
  return Array.isArray(value.habitChanges) && value.habitChanges.every(c => {
    if (!record(c) || typeof c.habitId !== 'string' || !['keep','edit','delete','add'].includes(String(c.action)) || !changes(c.changes,true) ||
      (c.personalRoutineId !== undefined && typeof c.personalRoutineId !== 'string')) return false;
    if (!base(c.baseHabit,c.habitId)) return false;
    if (c.action !== 'add') return true;
    const h = c.newHabit;
    return record(h) && typeof h.title === 'string' && typeof h.emoji === 'string' && typeof h.when === 'string' &&
      changes({ frequency: h.frequency, ...(h.customDays !== undefined ? { customDays: h.customDays } : {}) }, true);
  }) &&
    Array.isArray(value.routineChanges) && value.routineChanges.every(c => {
      if (!record(c) || typeof c.routineId !== 'string' || !['keep','edit','delete','add'].includes(String(c.action)) || !changes(c.changes,false)) return false;
      if (!base(c.baseRoutine,c.routineId)) return false;
      if (c.action !== 'add') return true;
      const r = c.newRoutine;
      return record(r) && typeof r.title === 'string' && ['personal','faith'].includes(String(r.type)) && typeof r.isActive === 'boolean' && Number.isInteger(r.order) && changes({ frequency: r.frequency },false);
    });
}

/** 이전 버전에서 작성 중이던 개인 루틴 추가 초안도 홈의 습관으로 복원한다. */
export function migrateReviewChanges(draft: ReviewDraft) {
  const habitChanges = [...draft.habitChanges];
  const routineChanges = draft.routineChanges.filter(c => {
    if (c.action !== 'add' || c.newRoutine?.type !== 'personal') return true;
    const r = c.newRoutine;
    if (!habitChanges.some(h => h.habitId === c.routineId)) habitChanges.push({
      habitId: c.routineId, action: 'add', newHabit: {
        title: r.title, emoji: r.emoji || '🌱', when: r.when ?? '',
        frequency: Array.isArray(r.frequency) ? 'custom' : r.frequency,
        customDays: Array.isArray(r.frequency) ? r.frequency : undefined,
        twoMinuteHabit: r.twoMinuteHabit, goalId: r.goalId,
        durationSeconds: r.durationSeconds, notification: r.notification,
      },
    });
    return false;
  });
  return { habitChanges, routineChanges };
}

/** 빈 이름 또는 실행 요일이 없는 조정은 저장하지 않는다. */
export function reviewChangesError(habits: HabitChange[], routines: RoutineChange[]): string | null {
  for (const c of habits) {
    const h = c.action === 'add' ? c.newHabit : c.action === 'edit' ? c.changes : undefined;
    if (!h) continue;
    if (h.title !== undefined && !h.title.trim()) return '습관 이름을 입력해주세요.';
    if (h.frequency === 'custom' && !h.customDays?.length) return '습관을 실천할 요일을 하나 이상 선택해주세요.';
  }
  for (const c of routines) {
    const r = c.action === 'add' ? c.newRoutine : c.action === 'edit' ? c.changes : undefined;
    if (!r) continue;
    if (r.title !== undefined && !r.title.trim()) return '루틴 이름을 입력해주세요.';
    if (Array.isArray(r.frequency) && !r.frequency.length) return '루틴을 실천할 요일을 하나 이상 선택해주세요.';
  }
  return null;
}
