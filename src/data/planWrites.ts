import type { PersonalRoutine, WeeklyGoal } from '../types';
import { personalRoutineToRow, weeklyGoalToRow } from './mappers';
import type { WriteOp } from '../lib/sync/outbox';
import { newId } from '../utils/id';

export type PlanItem = PersonalRoutine | WeeklyGoal;
export const planToRow = (item: PlanItem) => 'habitIds' in item ? personalRoutineToRow(item) : weeklyGoalToRow(item);
export function planWrite(item: PlanItem, expectedRevision: string | null, creating = false, deleting = false): WriteOp {
  return { type: 'rpc', fn: 'save_plan', args: {
    request_id: deleting ? newId() : item.revision, item_kind: 'habitIds' in item ? 'bundle' : 'weekly', item_id: item.id,
    expected_revision: expectedRevision, creating, deleting, item_values: planToRow(item),
  } };
}
