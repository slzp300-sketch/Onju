import { supabase, supabaseForSession } from '../supabase';
import { newId } from '../../utils/id';
import { toast } from '../../store/toastStore';

/**
 * 아웃박스 큐 — 오프라인 변경사항을 소유 계정별로 보관·재시도한다.
 *
 * 스토어가 낙관적 set() 후 쓰기를 enqueue 하면:
 *  1) 즉시 flush 시도 (온라인이면 사실상 바로 반영)
 *  2) 실패하면 localStorage 큐에 남겨 두고 재연결/포커스/백오프 타이머에 재시도
 *
 * 큐는 함수가 아닌 "선언적 디스크립터"를 담아 localStorage에 직렬화한다
 * (앱 재시작·오프라인에서도 살아남아야 하므로).
 */

type Row = Record<string, unknown>;
type Match = Record<string, string | number | boolean>;

export type WriteOp =
  | { type: 'record-accept'; kind: 'todo' | 'diary' | 'memo'; itemId: string; current: Row | null }
  | { type: 'plan-accept'; kind: 'bundle' | 'weekly'; itemId: string; current: Row | null }
  | { type: 'practice-accept'; kind: 'habit' | 'routine'; itemId: string; current: Row | null }
  | { type: 'goal-accept'; goalId: string; current: Row | null }
  | { type: 'upsert'; table: string; values: Row; onConflict?: string }
  | { type: 'insert'; table: string; values: Row }
  | { type: 'update'; table: string; values: Row; match: Match }
  | { type: 'delete'; table: string; match: Match }
  | { type: 'rpc'; fn: string; args: Row; goalSnapshot?: Row };

function membershipRequest(op: WriteOp): { groupId: string; action: 'join' | 'leave' } | undefined {
  if (op.type === 'rpc' && op.fn === 'join_group' && typeof op.args.gid === 'string') return { groupId: op.args.gid, action: 'join' };
  if (op.type === 'delete' && op.table === 'group_members' && typeof op.match.group_id === 'string') return { groupId: op.match.group_id, action: 'leave' };
}

function creationRequest(op: WriteOp): { groupId: string; details?: Row } | undefined {
  if (op.type !== 'insert') return;
  if (op.table === 'small_groups' && typeof op.values.id === 'string') return { groupId: op.values.id, details: op.values };
  if (op.table === 'group_members' && op.values.role === 'creator' && typeof op.values.group_id === 'string') return { groupId: op.values.group_id };
}
function groupStatusRequest(op: WriteOp) {
  if (op.type === 'update' && op.table === 'small_groups' && 'status' in op.values && typeof op.match.id === 'string') {
    return { groupId: op.match.id };
  }
  if (op.type === 'rpc' && op.fn === 'change_group_status' && typeof op.args.gid === 'string') return { groupId: op.args.gid };
}
const heldRequest = (op: WriteOp) => membershipRequest(op) || creationRequest(op) || groupStatusRequest(op);

function goalId(op: WriteOp): string | undefined {
  if (op.type === 'practice-accept' || op.type === 'plan-accept' || op.type === 'record-accept') return;
  if (op.type === 'goal-accept') return op.goalId;
  if (op.type === 'rpc' && ['save_monthly_goal', 'delete_monthly_goal_preserving_history', 'delete_monthly_goal_checked'].includes(op.fn)) return op.args.gid as string;
  if (op.type !== 'rpc' && op.table === 'monthly_goals') return String('values' in op ? op.values.id ?? ('match' in op ? op.match.id : '') : op.match.id);
}
function legacyGoal(op: WriteOp) {
  return op.type === 'rpc' ? op.fn === 'delete_monthly_goal_preserving_history' : 'table' in op && op.table === 'monthly_goals';
}
function practiceRef(op: WriteOp): { kind: 'habit' | 'routine'; id: string; key: string } | undefined {
  let kind: 'habit' | 'routine', id: string;
  if (op.type === 'practice-accept') { kind = op.kind; id = op.itemId; }
  else if (op.type === 'rpc' && op.fn === 'save_practice') { kind = op.args.item_kind as typeof kind; id = String(op.args.item_id); }
  else if ('table' in op && ['habits', 'daily_routines'].includes(op.table)) {
    kind = op.table === 'habits' ? 'habit' : 'routine';
    id = String('values' in op ? op.values.id ?? ('match' in op ? op.match.id : '') : op.match.id);
  } else return;
  return { kind, id, key: `${kind}:${id}` };
}
const legacyPractice = (op: WriteOp) => !!practiceRef(op) && op.type !== 'rpc' && op.type !== 'practice-accept';
function planRef(op: WriteOp): { kind: 'bundle' | 'weekly'; id: string; key: string } | undefined {
  let kind: 'bundle' | 'weekly', id: string;
  if (op.type === 'plan-accept') { kind = op.kind; id = op.itemId; }
  else if (op.type === 'rpc' && op.fn === 'save_plan') { kind = op.args.item_kind as typeof kind; id = String(op.args.item_id); }
  else if ('table' in op && ['personal_routines', 'weekly_goals'].includes(op.table)) {
    kind = op.table === 'personal_routines' ? 'bundle' : 'weekly';
    id = String('values' in op ? op.values.id ?? ('match' in op ? op.match.id : '') : op.match.id);
  } else return;
  return { kind, id, key: `${kind}:${id}` };
}
const legacyPlan = (op: WriteOp) => !!planRef(op) && op.type !== 'rpc' && op.type !== 'plan-accept';
function recordRef(op: WriteOp): {kind:'todo'|'diary'|'memo';id:string;key:string}|undefined {
  let kind:'todo'|'diary'|'memo', id:string;
  if(op.type==='record-accept'){kind=op.kind;id=op.itemId;}
  else if(op.type==='rpc' && op.fn==='save_record' && op.args.item_kind!=='check'){kind=op.args.item_kind as typeof kind;id=String(op.args.item_key);}
  else if('table' in op && ['todos','diary_entries','routine_logs'].includes(op.table)) {
    kind=op.table==='todos'?'todo':op.table==='diary_entries'?'diary':'memo';
    const v={...('match' in op?op.match:{}),...('values' in op?op.values:{})};
    id=kind==='todo'?String(v.id??''):kind==='diary'?String(v.date??''):v.routine_id && v.date?`${v.routine_id}:${v.date}`:`legacy-id:${v.id??''}`;
  }else return;
  return {kind,id,key:`${kind}:${id}`};
}
const legacyRecord = (op:WriteOp) => !!recordRef(op) && op.type!=='rpc' && op.type!=='record-accept';
export const isRecordDeletion = (op:WriteOp) => !!recordRef(op) && (op.type==='delete' || (op.type==='rpc' && op.args.mode==='delete'));
export const isPlanDeletion = (op: WriteOp) => !!planRef(op) && (op.type === 'delete' || (op.type === 'rpc' && op.args.deleting === true));
export function isGoalDeletion(op: WriteOp) {
  return (op.type === 'delete' && op.table === 'monthly_goals') || (op.type === 'rpc' && ['delete_monthly_goal_preserving_history', 'delete_monthly_goal_checked'].includes(op.fn));
}

interface Queued {
  id: string;
  ownerId: string;
  op: WriteOp;
  attempts: number;
  queuedAt: number;
  lastError?: string;
  goalConflict?: { status: 'conflict' | 'deleted'; current: Row | null };
  recordConflict?: { status:'conflict'|'deleted'; current:Row|null; reason?:string };
  planConflict?: { status: 'conflict' | 'deleted'; current: Row | null; reason?: string };
  practiceConflict?: { status: 'conflict' | 'deleted'; current: Row | null };
  replaces?: string[];
}

const STORAGE_KEY = 'onju-outbox';
const ITEM_PREFIX = `${STORAGE_KEY}:item:`;
// Older app tabs treat unknown RPC results as success. Keep versioned records outside their scan.
const RECORD_PREFIX = 'onju-record-outbox:item:';
const queueKey=(item:Pick<Queued,'id'|'op'>) => `${item.op.type==='record-accept'||(item.op.type==='rpc'&&item.op.fn==='save_record')?RECORD_PREFIX:ITEM_PREFIX}${item.id}`;
const WARN_AFTER_ATTEMPTS = 8;
const QUEUE_WARNING_SIZE = 500;

let storageReadable = true;
let queue: Queued[] = load();
const volatileItems = new Set(queue.filter(item => {
  try { return !localStorage.getItem(queueKey(item)); } catch { return true; }
}).map(item => item.id));
let inFlight: Promise<void> | null = null;
let inFlightGeneration = 0;
let generation = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
// localStorage의 마지막 UID는 탭 사이에서 즉시 바뀐다. 작성자 판단에는 이 탭의 확인된 세션만 쓴다.
let currentOwnerId: string | null = null;

function load(): Queued[] {
  storageReadable = true;
  const found = new Map<string, Queued>();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Queued[]) : [];
    const owner = localStorage.getItem('onju_last_uid');
    let migrated = true;
    const now = Date.now();
    if (Array.isArray(parsed)) parsed.forEach((item, index) => {
      const ownerId = item.ownerId ?? owner;
      if (!ownerId || !item.id || !item.op) { migrated = false; return; }
      const entry = { ...item, ownerId, queuedAt: item.queuedAt ?? now + index };
      found.set(entry.id, entry);
      try {
        if (!localStorage.getItem(queueKey(entry))) localStorage.setItem(queueKey(entry), JSON.stringify(entry));
      } catch { migrated = false; }
    });
    if (raw && migrated && Array.isArray(parsed)) localStorage.removeItem(STORAGE_KEY);
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(ITEM_PREFIX) && !key.startsWith(RECORD_PREFIX)) continue;
      const item = JSON.parse(localStorage.getItem(key) ?? 'null') as Queued | null;
      if (!item?.id || !item.ownerId || !item.op || ![`${ITEM_PREFIX}${item.id}`,`${RECORD_PREFIX}${item.id}`].includes(key)) continue;
      const canonical=queueKey(item);
      if(key!==canonical) {
        const existing=localStorage.getItem(canonical);
        if(!existing)localStorage.setItem(canonical,JSON.stringify(item));
        localStorage.removeItem(key);
        found.set(item.id,existing?JSON.parse(existing) as Queued:item);
      }else found.set(item.id,item);
    }
  } catch {
    storageReadable = false;
    toast.error('저장 대기 기록을 모두 읽지 못했어요. 기기 저장 공간과 브라우저 설정을 확인해주세요.');
  }
  return [...found.values()].sort((a, b) => a.queuedAt - b.queuedAt || a.id.localeCompare(b.id));
}

function changed() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('onju-outbox-changed'));
}
function refreshQueue() {
  const disk = load();
  if (!storageReadable) return;
  const ids = new Set(disk.map(item => item.id));
  for (const id of ids) volatileItems.delete(id);
  queue = [...disk, ...queue.filter(item => volatileItems.has(item.id) && !ids.has(item.id))]
    .sort((a, b) => a.queuedAt - b.queuedAt || a.id.localeCompare(b.id));
}
function save(item: Queued): void {
  queue = queue.map(q => q.id === item.id ? item : q);
  try {
    localStorage.setItem(queueKey(item), JSON.stringify(item));
    volatileItems.delete(item.id);
  } catch {
    volatileItems.add(item.id);
    toast.error('기기 저장 공간이 부족해 변경사항을 보관하지 못했어요. 앱을 닫기 전에 연결 상태와 저장 공간을 확인해주세요.');
  }
  changed();
}
function remove(item: Queued): boolean {
  try { localStorage.removeItem(queueKey(item)); }
  catch { toast.error('저장 완료 기록을 기기에 반영하지 못했어요. 저장 공간과 브라우저 설정을 확인해주세요.'); return false; }
  volatileItems.delete(item.id);
  queue = queue.filter(candidate => candidate.id !== item.id);
  changed();
  return true;
}

function describe(op: WriteOp): string {
  return op.type === 'rpc' ? `rpc:${op.fn}` : op.type === 'goal-accept' || op.type === 'practice-accept' || op.type === 'plan-accept' || op.type === 'record-accept' ? op.type : `${op.type}:${op.table}`;
}

// 교체 요청을 먼저 영속화해 이전 항목 정리 실패에도 중복 전송하지 않는다.
function effectiveQueue() {
  const replaced = new Set(queue.flatMap(item => item.replaces ?? []));
  return queue.filter(item => !replaced.has(item.id));
}
function blocked(item: Queued) {
  if (heldRequest(item.op)) return true;
  const record = recordRef(item.op);
  if(record) return effectiveQueue().some(q=>q.ownerId===item.ownerId && recordRef(q.op)?.key===record.key && (q.recordConflict || legacyRecord(q.op)));
  const plan = planRef(item.op);
  if (plan) return effectiveQueue().some(q => q.ownerId === item.ownerId && planRef(q.op)?.key === plan.key && (q.planConflict || legacyPlan(q.op)));
  const ref = practiceRef(item.op);
  if (ref) return effectiveQueue().some(q => q.ownerId === item.ownerId && practiceRef(q.op)?.key === ref.key && (q.practiceConflict || legacyPractice(q.op)));
  const gid = goalId(item.op);
  return !!gid && effectiveQueue().some(q => q.ownerId === item.ownerId && goalId(q.op) === gid && (q.goalConflict || legacyGoal(q.op)));
}

/** UI snapshots contain only the requested account's queued goal inputs. */
export function goalSyncEntries(ownerId: string) {
  return effectiveQueue().filter(q => q.ownerId === ownerId && goalId(q.op) && blocked(q)).map(q => ({
    id: q.id, goalId: goalId(q.op)!, op: q.op, conflict: q.goalConflict,
  }));
}
export function pendingGoalIds(ownerId: string): string[] {
  return [...new Set(effectiveQueue().filter(q => q.ownerId === ownerId).flatMap(q => goalId(q.op) ? [goalId(q.op)!] : []))];
}
export function pendingGoalDeletionIds(ownerId: string): string[] {
  return [...new Set(effectiveQueue().filter(q => q.ownerId === ownerId && isGoalDeletion(q.op)).map(q => goalId(q.op)!))];
}
export function practiceSyncEntries(ownerId: string) {
  return effectiveQueue().filter(q => q.ownerId === ownerId && practiceRef(q.op) && blocked(q)).map(q => ({
    kind: practiceRef(q.op)!.kind, key: practiceRef(q.op)!.key, itemId: practiceRef(q.op)!.id, op: q.op, conflict: q.practiceConflict,
    // Queue identity must remain separate from the practice entity ID.
    requestId: q.id,
  }));
}
export function pendingPracticeIds(ownerId: string): string[] {
  return [...new Set(effectiveQueue().filter(q => q.ownerId === ownerId).flatMap(q => practiceRef(q.op) ? [practiceRef(q.op)!.key] : []))];
}

export function planSyncEntries(ownerId: string) {
  return effectiveQueue().filter(q => q.ownerId === ownerId && planRef(q.op) && blocked(q)).map(q => ({
    kind: planRef(q.op)!.kind, key: planRef(q.op)!.key, itemId: planRef(q.op)!.id,
    op: q.op, conflict: q.planConflict, requestId: q.id,
  }));
}
export function pendingPlanIds(ownerId: string, deletionsOnly = false): string[] {
  return [...new Set(effectiveQueue().filter(q => q.ownerId === ownerId && (!deletionsOnly || isPlanDeletion(q.op))).flatMap(q => planRef(q.op) ? [planRef(q.op)!.key] : []))];
}

export function recordSyncEntries(ownerId:string) {
  return effectiveQueue().filter(q=>q.ownerId===ownerId && recordRef(q.op) && blocked(q)).map(q=>({
    kind:recordRef(q.op)!.kind,key:recordRef(q.op)!.key,itemId:recordRef(q.op)!.id,op:q.op,conflict:q.recordConflict,requestId:q.id,
  }));
}
export function pendingRecordIds(ownerId:string,deletionsOnly=false):string[] {
  return [...new Set(effectiveQueue().filter(q=>q.ownerId===ownerId && (!deletionsOnly || isRecordDeletion(q.op))).flatMap(q=>recordRef(q.op)?[recordRef(q.op)!.key]:[]))];
}
export function resolveRecordEntries(owner:string,signature:string,key:string,op:WriteOp) {
  refreshQueue();
  const entries=recordSyncEntries(owner).filter(q=>q.key===key);
  if(!storageReadable || currentOwnerId!==owner || !entries.length || JSON.stringify(entries)!==signature) throw new Error('보관된 입력이 바뀌었어요. 다시 확인해주세요.');
  replaceEntries(entries.map(q=>q.requestId),owner,op);
}

/** 쓰기 작업을 큐에 넣고 즉시 flush 시도. 스토어 액션이 낙관적 set() 후 호출한다. */
export function enqueue(op: WriteOp, options?: { requireDurable?: boolean; replaces?: string[] }): void {
  const ownerId = currentOwnerId;
  if (!ownerId) {
    if (options?.requireDurable) throw new Error('로그인 상태를 확인해주세요.');
    toast.error('로그인 상태를 확인한 뒤 다시 저장해주세요.');
    return;
  }
  refreshQueue();
  if (options?.requireDurable && !storageReadable) throw new Error('기기 저장 상태를 확인해주세요.');
  if (options?.requireDurable && !options.replaces && practiceSyncEntries(ownerId).some(q => q.key === practiceRef(op)?.key)) {
    throw new Error('습관·루틴의 저장 충돌을 먼저 확인해주세요. 입력은 기기에 남아 있어요.');
  }
  if (options?.requireDurable && !options.replaces && goalSyncEntries(ownerId).some(q => q.goalId === goalId(op))) {
    throw new Error('목표의 저장 충돌을 먼저 확인해주세요.');
  }
  if (options?.requireDurable && !options.replaces && pendingGoalDeletionIds(ownerId).includes(goalId(op) ?? '')) {
    throw new Error('목표 삭제 결과를 확인 중이에요. 완료 후 다시 시도해주세요.');
  }
  if (options?.requireDurable && !options.replaces && (planSyncEntries(ownerId).some(q => q.key === planRef(op)?.key) || pendingPlanIds(ownerId, true).includes(planRef(op)?.key ?? ''))) {
    throw new Error('묶음·주간 목표의 저장 충돌 또는 삭제 결과를 먼저 확인해주세요. 입력은 기기에 남아 있어요.');
  }
  if(options?.requireDurable && !options.replaces && (recordSyncEntries(ownerId).some(q=>q.key===recordRef(op)?.key) || pendingRecordIds(ownerId,true).includes(recordRef(op)?.key??''))) {
    throw new Error('기록의 저장 충돌 또는 삭제 결과를 먼저 확인해주세요. 입력은 기기에 남아 있어요.');
  }
  if (queue.length === QUEUE_WARNING_SIZE) {
    toast.error('저장 대기 중인 변경사항이 많아요. 인터넷에 연결하면 순서대로 전송해요.');
  }
  const queuedAt = queue.reduce((latest, item) => Math.max(latest, item.queuedAt), Date.now()) + 1;
  const item: Queued = { id: newId(), ownerId, op, attempts: 0, queuedAt, ...(options?.replaces ? { replaces: options.replaces } : {}) };
  queue.push(item);
  save(item);
  if (options?.requireDurable && volatileItems.has(item.id)) {
    queue = queue.filter(q => q.id !== item.id); volatileItems.delete(item.id); changed();
    throw new Error('기기에 변경 내용을 보관하지 못했어요.');
  }
  void flush();
}

/** 계정 전환 시 전송을 중단하되, 미전송 작업은 소유 계정으로 다시 로그인할 때까지 보관한다. */
export function pauseOutbox(): void {
  generation += 1;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
}

/** Auth 이벤트가 기존 계정의 설정을 큐에 반영한 뒤 호출한다. */
export function isOutboxOwner(owner: string): boolean { return currentOwnerId === owner; }

export function setOutboxOwner(userId: string | null): void {
  if (currentOwnerId !== userId) pauseOutbox();
  currentOwnerId = userId;
}

/** 계정 삭제 시 해당 계정의 작업만 제거한다. 인자가 없으면 전체 초기화(테스트용). */
export function clearOutbox(ownerId?: string): void {
  refreshQueue();
  if (!ownerId || ownerId === currentOwnerId) pauseOutbox();
  for (const item of [...queue]) if (!ownerId || item.ownerId === ownerId) remove(item);
}

/** 대기 중인 쓰기 개수 (동기화 상태 표시·테스트용). */
export function pendingCount(ownerId = currentOwnerId): number {
  return effectiveQueue().filter(item => item.ownerId === ownerId && !blocked(item)).length;
}

/** The comparison must cover exactly the same held inputs, including other tabs. */
export function resolveGoalEntries(owner: string, signature: string, gid: string, op: WriteOp) {
  refreshQueue();
  const entries = goalSyncEntries(owner).filter(q => q.goalId === gid);
  if (!storageReadable || currentOwnerId !== owner || !entries.length || JSON.stringify(entries) !== signature) {
    throw new Error('저장 대기 내용이 바뀌었어요. 다시 확인해주세요.');
  }
  replaceEntries(entries.map(q => q.id), owner, op);
}
export function resolvePracticeEntries(owner: string, signature: string, key: string, op: WriteOp) {
  refreshQueue();
  const entries = practiceSyncEntries(owner).filter(q => q.key === key);
  if (!storageReadable || currentOwnerId !== owner || !entries.length || JSON.stringify(entries) !== signature) throw new Error('보관된 입력이 바뀌었어요. 다시 확인해주세요.');
  replaceEntries(entries.map(q => q.requestId), owner, op);
}
export function resolvePlanEntries(owner: string, signature: string, key: string, op: WriteOp) {
  refreshQueue();
  const entries = planSyncEntries(owner).filter(q => q.key === key);
  if (!storageReadable || currentOwnerId !== owner || !entries.length || JSON.stringify(entries) !== signature) throw new Error('보관된 입력이 바뀌었어요. 다시 확인해주세요.');
  replaceEntries(entries.map(q => q.requestId), owner, op);
}
function replaceEntries(ids: string[], owner: string, op: WriteOp) {
  const replaced = new Set(ids);
  for (let size = -1; size !== replaced.size;) {
    size = replaced.size;
    for (const q of queue) if (q.ownerId === owner && replaced.has(q.id)) for (const id of q.replaces ?? []) replaced.add(id);
  }
  enqueue(op, { requireDurable: true, replaces: [...replaced] });
}

/** 구버전의 가입·탈퇴 요청은 자동 재전송하지 않고 사용자의 확인까지 그대로 보관한다. */
export function heldMembershipRequests(ownerId: string) {
  refreshQueue();
  return queue.filter(item => item.ownerId === ownerId).flatMap(item => {
    const request = membershipRequest(item.op);
    return request ? [{ id: item.id, ...request }] : [];
  });
}

/** 사용자가 이전 요청 취소를 선택한 경우에만 해당 계정·모임의 보류 요청을 지운다. */
export function cancelHeldMembershipRequests(ownerId: string, groupId: string) {
  refreshQueue();
  if (!storageReadable || currentOwnerId !== ownerId) return false;
  const held = queue.filter(item => item.ownerId === ownerId && membershipRequest(item.op)?.groupId === groupId);
  return held.every(item => remove(item));
}

/** 구버전의 모임 생성/방장 등록은 한 번의 복구 요청으로 사용자가 재시도한다. */
export function heldGroupCreations(owner: string) {
  refreshQueue();
  const grouped = new Map<string, { groupId: string; details?: Row }>();
  for (const item of queue) {
    if (item.ownerId !== owner) continue;
    const request = creationRequest(item.op);
    if (request) grouped.set(request.groupId, { ...grouped.get(request.groupId), ...request });
  }
  return [...grouped.values()];
}
/** 서버에서 모임과 방장 등록을 확인한 뒤에만 호출한다. */
export function completeHeldGroupCreation(owner: string, id: string) {
  refreshQueue();
  if (!storageReadable || currentOwnerId !== owner) return false;
  return queue.filter(item => item.ownerId === owner && creationRequest(item.op)?.groupId === id).every(remove);
}

/** 상태 변경은 자동 전송하지 않는다. 구버전 요청과 결과 미확인 요청 모두 조회로 복구한다. */
export function heldGroupStatusRequests(owner: string) {
  refreshQueue();
  return queue.filter(item => item.ownerId === owner).flatMap(item => {
    const request = groupStatusRequest(item.op);
    return request ? [{ id: item.id, ...request }] : [];
  });
}

/** 서버 요청 전에 보관한다. 보관 실패 시 호출자는 RPC를 보내지 않는다. */
export function holdGroupStatusRequest(owner: string, groupId: string, next: string, expected: string): string | undefined {
  refreshQueue();
  if (!storageReadable || currentOwnerId !== owner || heldGroupStatusRequests(owner).some(r => r.groupId === groupId)) return;
  const item: Queued = { id: newId(), ownerId: owner, attempts: 0, queuedAt: Date.now(),
    op: { type: 'rpc', fn: 'change_group_status', args: { gid: groupId, next_status: next, expected_status: expected } } };
  queue.push(item);
  save(item);
  return volatileItems.has(item.id) ? undefined : item.id;
}

/** 조회 시작 때 잡은 요청만 정리한다. 다른 탭에서 새로 추가한 요청은 보존한다. */
export function resolveGroupStatusRequests(owner: string, requestIds: string[]): boolean {
  refreshQueue();
  if (!storageReadable || currentOwnerId !== owner) return false;
  return queue.filter(item => item.ownerId === owner && requestIds.includes(item.id) && groupStatusRequest(item.op)).every(remove);
}

export function unpersistedCount(ownerId: string): number {
  return queue.filter(item => item.ownerId === ownerId && volatileItems.has(item.id)).length;
}

function scheduleRetry(attempts: number): void {
  if (retryTimer) return; // 이미 예약됨
  const delay = Math.min(60_000, 2_000 * 2 ** Math.min(6, attempts - 1)); // 2s,4s,8s… 최대 60s
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    void flush();
  }, delay);
}

async function runOp(op: WriteOp, client: ReturnType<typeof supabaseForSession>): Promise<{ data?: unknown; error: { code?: string; message: string } | null }> {
  switch (op.type) {
    case 'record-accept': return {data:{status:'saved',current:op.current},error:null};
    case 'plan-accept': return { data: { status: 'saved', current: op.current }, error: null };
    case 'practice-accept': return { data: { status: 'saved', current: op.current }, error: null };
    case 'goal-accept': return { data: { status: 'saved', current: op.current }, error: null };
    case 'upsert':
      return client
        .from(op.table)
        .upsert(op.values, op.onConflict ? { onConflict: op.onConflict } : undefined);
    case 'insert':
      return client.from(op.table).insert(op.values);
    case 'update': {
      let q = client.from(op.table).update(op.values);
      for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v);
      return q;
    }
    case 'delete': {
      let q = client.from(op.table).delete();
      for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v);
      return q;
    }
    case 'rpc':
      return client.rpc(op.fn, op.args);
  }
}

async function attempt(item: Queued, client: ReturnType<typeof supabaseForSession>, version: number): Promise<'done' | 'retry' | 'held'> {
  try {
    const { error, data } = await runOp(item.op, client);
    if (item.op.type==='rpc' && item.op.fn==='save_record') {
      const result=data as {status?:string;current:Row|null}|null;
      if(error && item.op.args.item_kind!=='check' && ['P0001','23505','23514','23503','22P02','22007','22008'].includes(error.code??'')) {
        item.recordConflict={status:'conflict',current:null,reason:error.message};return 'held';
      }
      if(!error) {
        if(!result || !['saved','conflict','deleted'].includes(result.status??'') || !('current' in result)) throw new Error('기록 저장 결과를 확인하지 못했어요.');
        if(version!==generation)return 'retry';
        refreshQueue();if(!effectiveQueue().some(q=>q.id===item.id))return 'retry';
        if(result.status!=='saved'){item.recordConflict={status:result.status as 'conflict'|'deleted',current:result.current};return 'held';}
        window.dispatchEvent(new CustomEvent('onju-record-saved',{detail:{ownerId:item.ownerId,kind:item.op.args.item_kind,id:item.op.args.item_key,
          revision:item.op.args.mode==='delete'?item.op.args.expected_revision:item.op.args.request_id, current:result.current}}));
      }
    }
    if (item.op.type === 'rpc' && item.op.fn === 'save_plan') {
      const result = data as { status?: string; current: Row | null } | null;
      if (error && ['P0001','23505','23514','23503','22P02'].includes(error.code ?? '')) {
        item.planConflict = { status: 'conflict', current: null, reason: error.message }; return 'held';
      }
      if (!error) {
        if (!result || !['saved','conflict','deleted'].includes(result.status ?? '') || !('current' in result)) throw new Error('묶음·주간 목표 저장 결과를 확인하지 못했어요.');
        if (version !== generation) return 'retry';
        refreshQueue();
        if (!effectiveQueue().some(q => q.id === item.id)) return 'retry';
        if (result.status !== 'saved') { item.planConflict = { status: result.status as 'conflict' | 'deleted', current: result.current }; return 'held'; }
        window.dispatchEvent(new CustomEvent('onju-plan-saved', { detail: { ownerId: item.ownerId, ...planRef(item.op),
          revision: item.op.args.deleting ? item.op.args.expected_revision : item.op.args.request_id, current: result.current } }));
      }
    }
    if (!error && item.op.type === 'rpc' && item.op.fn === 'save_practice') {
      const result = data as { status?: string; current: Row | null } | null;
      if (!result || !['saved','conflict','deleted'].includes(result.status ?? '') || !('current' in result)) throw new Error('실천 저장 결과를 확인하지 못했어요.');
      if (version !== generation) return 'retry';
      refreshQueue();
      if (!effectiveQueue().some(q => q.id === item.id)) return 'retry';
      if (result.status !== 'saved') { item.practiceConflict = { status: result.status as 'conflict' | 'deleted', current: result.current }; return 'held'; }
      window.dispatchEvent(new CustomEvent('onju-practice-saved', { detail: { ownerId: item.ownerId, ...practiceRef(item.op), revision: item.op.args.request_id, current: result.current } }));
    }
    if (!error && item.op.type === 'rpc' && ['save_monthly_goal', 'delete_monthly_goal_checked'].includes(item.op.fn)) {
      const deleting = item.op.fn === 'delete_monthly_goal_checked';
      const result = data as { status?: string; current: Row | null; effective_date?: string | null } | null;
      if (!result || !(deleting ? ['deleted', 'conflict'] : ['saved', 'conflict', 'deleted']).includes(result.status ?? '')
        || (deleting && result.status === 'deleted' && (result.current !== null || !('effective_date' in result)))) throw new Error('목표 요청 결과를 확인하지 못했어요.');
      if (version !== generation) return 'retry';
      refreshQueue();
      if (!effectiveQueue().some(q => q.id === item.id)) return 'retry';
      if (result.status !== (deleting ? 'deleted' : 'saved')) {
        item.goalConflict = { status: result.status as 'conflict' | 'deleted', current: result.current };
        return 'held';
      }
      window.dispatchEvent(new CustomEvent(deleting ? 'onju-goal-deleted' : 'onju-goal-saved', { detail: {
        ownerId: item.ownerId, goalId: goalId(item.op), revision: deleting ? item.op.args.expected_revision : item.op.args.request_id,
        current: result.current, effectiveDate: result.effective_date, timeZone: deleting ? item.op.args.p_timezone : undefined,
      } }));
    }
    if (!error) return 'done';
    // 23505 = unique_violation: insert 재시도가 이미 반영된 행과 충돌 → 멱등 성공으로 간주
    if (error.code === '23505' && item.op.type === 'insert') return 'done';
    item.lastError = error.message;
    return 'retry';
  } catch (e) {
    item.lastError = e instanceof Error ? e.message : String(e);
    return 'retry';
  }
}

/** 큐를 FIFO로 비운다. 실패 항목은 순서 보존을 위해 그 자리에서 멈추고 나중에 재시도. */
export async function flush(): Promise<void> {
  if (inFlight && inFlightGeneration === generation) {
    const version = inFlightGeneration;
    await inFlight;
    if (generation === version) return;
    return flush();
  }
  if (queue.length === 0) refreshQueue();
  if (queue.length === 0) return;
  const task = performFlush(generation);
  inFlightGeneration = generation;
  inFlight = task;
  try { await task; } finally {
    if (inFlight === task) inFlight = null;
  }
}

async function performFlush(version: number): Promise<void> {
  let userId: string;
  let client: ReturnType<typeof supabaseForSession>;

  // 세션이 없으면 RLS로 막히므로 보류 (로그인 시 다시 호출됨)
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session || version !== generation) return;
    userId = data.session.user.id;
    client = supabaseForSession(data.session.access_token);
  } catch {
    return;
  }

  refreshQueue();
  const hadOwnWork = effectiveQueue().some(item => item.ownerId === userId && !blocked(item));
  while (version === generation) {
    if (currentOwnerId !== userId) return;
    const item = effectiveQueue().find(candidate => candidate.ownerId === userId && !blocked(candidate));
    if (!item) break;
    const result = await attempt(item, client, version);
    // 계정 변경 중 완료된 이전 요청이 새 큐의 첫 항목을 제거하지 않게 한다.
    if (version !== generation || !queue.some(candidate => candidate.id === item.id)) return;
    if (result === 'done') {
      for (const old of queue.filter(q => item.replaces?.includes(q.id))) {
        if (!remove(old)) { scheduleRetry(6); return; }
      }
      if (!remove(item)) { scheduleRetry(6); return; }
      continue;
    }
    if (result === 'held') {
      // A different tab may already have resolved this record while the RPC ran.
      if (!volatileItems.has(item.id) && !localStorage.getItem(queueKey(item))) { refreshQueue(); continue; }
      save(item);
      toast.error(recordRef(item.op) ? '할 일·일기·메모의 저장을 멈췄어요. 기록 충돌 안내에서 비교해주세요.' : planRef(item.op) ? '묶음·주간 목표의 저장을 멈췄어요. 충돌 안내에서 비교해주세요.' : practiceRef(item.op) ? '습관·루틴의 서버 내용이 달라 저장을 멈췄어요. 실천 충돌 안내에서 확인해주세요.' : '목표의 서버 내용이 달라 요청을 멈췄어요. 목표 충돌 안내에서 확인해주세요.');
      continue;
    }
    item.attempts += 1;
    if (item.attempts === WARN_AFTER_ATTEMPTS) {
      console.error(`[outbox] ${describe(item.op)} 전송 지연:`, item.lastError);
      toast.error('일부 변경사항의 전송이 지연되고 있어요. 기기에 보관하고 다시 연결되면 재시도해요.');
    }
    // 다른 탭이 이미 전송 완료한 작업을 실패 응답으로 되살리지 않는다.
    if (!volatileItems.has(item.id) && !localStorage.getItem(queueKey(item))) {
      queue = queue.filter(candidate => candidate.id !== item.id);
      continue;
    }
    save(item);
    scheduleRetry(item.attempts);
    break; // 순서 보존: 이 항목이 성공할 때까지 뒤 항목은 대기
  }
  if (hadOwnWork && version === generation && pendingCount(userId) === 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('onju-outbox-drained'));
  }
}

// 재연결·포커스 복귀 시 자동 재시도
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key && (event.key.startsWith(ITEM_PREFIX) || event.key.startsWith(RECORD_PREFIX) || event.key === STORAGE_KEY)) {
      refreshQueue(); changed(); void flush();
    }
  });
  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush();
  });
}
