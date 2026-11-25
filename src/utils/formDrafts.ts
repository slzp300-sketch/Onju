import type { HabitFrequency, MonthlyGoal, Habit, DailyRoutine, PersonalRoutine, WeeklyGoal, Todo } from '../types';

export interface HabitDraft {
  baseHabit?: Habit;
  baseRoutine?: DailyRoutine;
  entityId: string; title: string; emoji: string; freq: HabitFrequency; customDays: number[];
  when: string; goalId?: string; miniRoutine: string; twoMinuteHabit: string; twoMinEnabled: boolean;
  timerEnabled: boolean; durationSecs: number; notifEnabled: boolean; notifType: 'push' | 'sound'; notifTimes: string[];
}
export interface GoalDraft {
  baseGoal?: MonthlyGoal;
  entityId: string; coreHabitId: string; toBeStatement: string; startDate: string; endDate: string;
  habitTitle: string; habitWhen: string; habitWhere: string; miniHabit: string; twoMinuteHabit: string;
  category: 'personal' | 'faith'; colorEnabled: boolean; selectedColor: string;
}
export interface TodoDraft { base?: Todo; entityId: string; title: string; emoji: string }
export interface WeeklyGoalDraft { baseGoal?: WeeklyGoal; entityId: string; pickedId: string | null; target: number }
export interface FaithDraft extends HabitDraft { mode: 'choose' | 'template' | 'template-config' | 'custom'; timeSlot: 'morning' | 'afternoon' | 'evening' | null }
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const uuid = (v: unknown) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const strings = (v: Record<string, unknown>, fields: string[]) => fields.every(k => typeof v[k] === 'string');
const bools = (v: Record<string, unknown>, fields: string[]) => fields.every(k => typeof v[k] === 'boolean');
export function habitDraftBase(v: HabitDraft, id: string): Habit {
  return v.baseHabit?.id === id ? v.baseHabit : { id, userId:'', title:v.title, emoji:v.emoji, frequency:v.freq, customDays:v.customDays, when:v.when, goalId:v.goalId, createdAt:new Date().toISOString() };
}
export function routineDraftBase(v: FaithDraft, id: string): DailyRoutine {
  return v.baseRoutine?.id === id ? v.baseRoutine : { id, userId:'', type:'faith', title:v.title, emoji:v.emoji, frequency:v.freq==='custom' ? v.customDays : v.freq, when:v.when, goalId:v.goalId, createdAt:new Date().toISOString(), order:0, isActive:true };
}
export function isHabitDraft(v: unknown): v is HabitDraft {
  return record(v) && [v.baseHabit, v.baseRoutine].every(base => base === undefined || (record(base) && strings(base, ['id','title','createdAt']) && (base.revision === undefined || typeof base.revision === 'string'))) && uuid(v.entityId) && strings(v,['title','emoji','when','miniRoutine','twoMinuteHabit']) &&
    bools(v,['twoMinEnabled','timerEnabled','notifEnabled']) && ['daily','weekdays','weekends','custom'].includes(String(v.freq)) &&
    Array.isArray(v.customDays) && v.customDays.every(d => Number.isInteger(d) && d >= 0 && d <= 6) &&
    (v.goalId === undefined || typeof v.goalId === 'string') && typeof v.durationSecs === 'number' && Number.isFinite(v.durationSecs) && v.durationSecs >= 0 &&
    ['push','sound'].includes(String(v.notifType)) && Array.isArray(v.notifTimes) && v.notifTimes.every(t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
}
export function isGoalDraft(v: unknown): v is GoalDraft {
  return record(v) && uuid(v.entityId) && typeof v.coreHabitId === 'string' && strings(v,['toBeStatement','startDate','endDate','habitTitle','habitWhen','habitWhere','miniHabit','twoMinuteHabit','selectedColor']) &&
    ['personal','faith'].includes(String(v.category)) && typeof v.colorEnabled === 'boolean' &&
    (v.baseGoal === undefined || (record(v.baseGoal) && strings(v.baseGoal, ['id','title','startDate','endDate','createdAt']) &&
      (v.baseGoal.revision === undefined || typeof v.baseGoal.revision === 'string') &&
      (v.baseGoal.goalRoutines === undefined || Array.isArray(v.baseGoal.goalRoutines))));
}
export function isFaithDraft(v: unknown): v is FaithDraft {
  if (!isHabitDraft(v)) return false;
  const extra = v as Partial<FaithDraft>;
  return ['choose','template','template-config','custom'].includes(String(extra.mode)) &&
    (extra.timeSlot === null || ['morning','afternoon','evening'].includes(String(extra.timeSlot)));
}
export function isTodoDraft(v: unknown): v is TodoDraft {
  return record(v) && (v.base===undefined || (record(v.base) && strings(v.base,['id','date','title','createdAt']) && (v.base.revision===undefined || typeof v.base.revision==='string'))) && uuid(v.entityId) && strings(v,['title','emoji']);
}
export function isWeeklyGoalDraft(v: unknown): v is WeeklyGoalDraft {
  return record(v) && (v.baseGoal === undefined || (record(v.baseGoal) && strings(v.baseGoal,['id','title','startDate','endDate','createdAt']) && (v.baseGoal.revision === undefined || uuid(v.baseGoal.revision)))) && uuid(v.entityId) && (v.pickedId === null || typeof v.pickedId === 'string') && Number.isInteger(v.target) && Number(v.target) >= 1 && Number(v.target) <= 7;
}

export interface BundleDraft {
  base?: PersonalRoutine; entityId:string; title:string; emoji:string; when:string;
  selectedIds:string[]; timerEnabled:boolean; habitDurations:Record<string,number>;
}
export function isBundleDraft(v:unknown): v is BundleDraft {
  return record(v) && uuid(v.entityId) && strings(v,['title','emoji','when']) && typeof v.timerEnabled==='boolean'
    && Array.isArray(v.selectedIds) && v.selectedIds.every(id=>typeof id==='string')
    && record(v.habitDurations) && Object.values(v.habitDurations).every(n=>typeof n==='number' && Number.isFinite(n) && n>=5 && n<=3600)
    && (v.base===undefined || (record(v.base) && strings(v.base,['id','title','createdAt']) && Array.isArray(v.base.habitIds)
      && v.base.habitIds.every(id=>typeof id==='string') && (v.base.revision===undefined || uuid(v.base.revision))));
}
