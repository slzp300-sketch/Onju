import { supabase } from '../supabase';
import { newId } from '../../utils/id';

/**
 * 아웃박스 큐 — 서버 쓰기를 유실 없이 보장한다.
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
  | { type: 'upsert'; table: string; values: Row; onConflict?: string }
  | { type: 'insert'; table: string; values: Row }
  | { type: 'update'; table: string; values: Row; match: Match }
  | { type: 'delete'; table: string; match: Match }
  | { type: 'rpc'; fn: string; args: Row };

interface Queued {
  id: string;
  op: WriteOp;
  attempts: number;
  lastError?: string;
}

const STORAGE_KEY = 'onju-outbox';
const MAX_ATTEMPTS = 8; // 이 횟수만큼 재시도 후에도 실패하면 폐기 (다음 hydrate가 서버 상태로 보정)
const QUEUE_LIMIT = 500; // 폭주 방지 상한

let queue: Queued[] = load();
let flushing = false;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function load(): Queued[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Queued[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    /* localStorage 용량 초과 등 — 무시 */
  }
}

function describe(op: WriteOp): string {
  return op.type === 'rpc' ? `rpc:${op.fn}` : `${op.type}:${op.table}`;
}

/** 쓰기 작업을 큐에 넣고 즉시 flush 시도. 스토어 액션이 낙관적 set() 후 호출한다. */
export function enqueue(op: WriteOp): void {
  if (queue.length >= QUEUE_LIMIT) {
    console.error('[outbox] 큐 한도 초과 — 가장 오래된 작업을 폐기합니다');
    queue.shift();
  }
  queue.push({ id: newId(), op, attempts: 0 });
  save();
  void flush();
}

/** 로그아웃 시 호출 — 남은 쓰기가 다른 사용자로 잘못 재생되지 않도록 비운다. */
export function clearOutbox(): void {
  queue = [];
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = undefined;
  }
  save();
}

/** 대기 중인 쓰기 개수 (동기화 상태 표시·테스트용). */
export function pendingCount(): number {
  return queue.length;
}

function scheduleRetry(attempts: number): void {
  if (retryTimer) return; // 이미 예약됨
  const delay = Math.min(60_000, 2_000 * 2 ** (attempts - 1)); // 2s,4s,8s… 최대 60s
  retryTimer = setTimeout(() => {
    retryTimer = undefined;
    void flush();
  }, delay);
}

async function runOp(op: WriteOp): Promise<{ error: { code?: string; message: string } | null }> {
  switch (op.type) {
    case 'upsert':
      return supabase
        .from(op.table)
        .upsert(op.values, op.onConflict ? { onConflict: op.onConflict } : undefined);
    case 'insert':
      return supabase.from(op.table).insert(op.values);
    case 'update': {
      let q = supabase.from(op.table).update(op.values);
      for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v);
      return q;
    }
    case 'delete': {
      let q = supabase.from(op.table).delete();
      for (const [k, v] of Object.entries(op.match)) q = q.eq(k, v);
      return q;
    }
    case 'rpc':
      return supabase.rpc(op.fn, op.args);
  }
}

async function attempt(item: Queued): Promise<'done' | 'retry'> {
  try {
    const { error } = await runOp(item.op);
    if (!error) return 'done';
    // 23505 = unique_violation: insert 재시도가 이미 반영된 행과 충돌 → 멱등 성공으로 간주
    if (error.code === '23505') return 'done';
    item.lastError = error.message;
    return 'retry';
  } catch (e) {
    item.lastError = e instanceof Error ? e.message : String(e);
    return 'retry';
  }
}

/** 큐를 FIFO로 비운다. 실패 항목은 순서 보존을 위해 그 자리에서 멈추고 나중에 재시도. */
export async function flush(): Promise<void> {
  if (flushing || queue.length === 0) return;

  // 세션이 없으면 RLS로 막히므로 보류 (로그인 시 다시 호출됨)
  try {
    const { data } = await supabase.auth.getSession();
    if (!data.session) return;
  } catch {
    return;
  }

  flushing = true;
  try {
    while (queue.length > 0) {
      const item = queue[0];
      const result = await attempt(item);
      if (result === 'done') {
        queue.shift();
        save();
        continue;
      }
      item.attempts += 1;
      if (item.attempts >= MAX_ATTEMPTS) {
        console.error(`[outbox] ${describe(item.op)} ${MAX_ATTEMPTS}회 실패 — 폐기:`, item.lastError);
        queue.shift();
        save();
        continue; // poison 항목은 버리고 다음으로
      }
      save();
      scheduleRetry(item.attempts);
      break; // 순서 보존: 이 항목이 성공할 때까지 뒤 항목은 대기
    }
  } finally {
    flushing = false;
  }
}

// 재연결·포커스 복귀 시 자동 재시도
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flush());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void flush();
  });
}
