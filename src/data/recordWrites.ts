import type { Todo, DiaryEntry, RoutineLog } from '../types';
import { todoToRow, diaryToRow, routineLogToRow } from './mappers';
import type { WriteOp } from '../lib/sync/outbox';
import { newId } from '../utils/id';

export type RecordKind = 'todo' | 'diary' | 'memo';
export type RecordItem = Todo | DiaryEntry | RoutineLog;
export type RecordMode = 'create' | 'edit' | 'complete' | 'delete' | 'resolve';
export const recordKey = (item: RecordItem) => 'routineId' in item ? `${item.routineId}:${item.date}` : 'title' in item ? item.id : item.date;
export const recordToRow = (item: RecordItem) => 'routineId' in item ? routineLogToRow(item) : 'title' in item ? todoToRow(item) : diaryToRow(item);
export function recordWrite(kind: RecordKind, item: RecordItem, base: string | null, mode: RecordMode = 'edit'): WriteOp {
  return { type:'rpc', fn:'save_record', args:{ item_kind:kind,item_key:recordKey(item),expected_revision:base,mode,
    request_id:mode==='delete'?newId():'routineId' in item?item.memoRevision:item.revision,item_values:recordToRow(item) } };
}
export const checkWrite = (item: RoutineLog): WriteOp => ({type:'rpc',fn:'save_record',args:{
  item_kind:'check',item_key:recordKey(item),expected_revision:null,mode:'complete',request_id:item.checkRequestId,
  item_values:{completed:item.completed,skipped:item.skipped??false,completed_at:item.completedAt??null},
}});
