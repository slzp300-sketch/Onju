import type { Habit, DailyRoutine } from '../types';
import type { WriteOp } from '../lib/sync/outbox';
import { habitToRow, routineToRow } from './mappers';
import { today } from '../utils/date';
import { localTimeZone } from '../utils/timeZone';

export function practiceWrite(item: Habit | DailyRoutine, expectedRevision: string | null, creating = false, effectiveDate = today()): WriteOp {
  const routine = 'isActive' in item;
  return { type: 'rpc', fn: 'save_practice', args: {
    item_kind: routine ? 'routine' : 'habit', item_id: item.id, request_id: item.revision,
    expected_revision: expectedRevision, creating, effective_date: effectiveDate, p_timezone: localTimeZone(),
    item_values: routine ? routineToRow(item) : habitToRow(item),
  } };
}
