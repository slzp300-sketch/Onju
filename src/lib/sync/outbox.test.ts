import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// supabase를 목으로 대체 — outcome()을 바꿔 각 쓰기의 성공/실패를 제어한다.
let outcome: () => { error: { code?: string; message: string } | null } = () => ({ error: null });

function makeThenable() {
  const builder: Record<string, unknown> = {
    eq: () => builder,
    then: (res: (v: { error: unknown }) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => outcome())
        .then(res, rej),
  };
  return builder;
}

vi.mock('../supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
    from: () => ({
      upsert: () => makeThenable(),
      insert: () => makeThenable(),
      update: () => makeThenable(),
      delete: () => makeThenable(),
    }),
    rpc: () => makeThenable(),
  },
}));

import { enqueue, flush, clearOutbox, pendingCount, type WriteOp } from './outbox';

const STORAGE_KEY = 'onju-outbox';
const op: WriteOp = { type: 'upsert', table: 'todos', values: { id: 't1', title: 'x' } };

function stored(): Array<{ op: WriteOp; attempts: number }> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
}

beforeEach(() => {
  localStorage.clear();
  clearOutbox();
  outcome = () => ({ error: null });
});

afterEach(() => {
  clearOutbox();
});

describe('outbox', () => {
  test('enqueue가 큐를 localStorage에 영속화한다', async () => {
    outcome = () => ({ error: { message: 'offline' } }); // 남아있게 실패시킴
    enqueue(op);
    await vi.waitFor(() => expect(pendingCount()).toBe(1));
    expect(stored()).toHaveLength(1);
    expect(stored()[0].op).toEqual(op);
  });

  test('성공한 쓰기는 큐에서 제거된다', async () => {
    enqueue(op);
    await vi.waitFor(() => expect(pendingCount()).toBe(0));
    expect(stored()).toHaveLength(0);
  });

  test('insert의 23505(unique 충돌)은 이미 반영됨=성공으로 처리(멱등)', async () => {
    outcome = () => ({ error: { code: '23505', message: 'duplicate key' } });
    enqueue({ type: 'insert', table: 'cheers', values: { share_id: 's1', type: 'heart' } });
    await vi.waitFor(() => expect(pendingCount()).toBe(0));
  });

  test('네트워크 실패는 큐에 남고 attempts가 증가한다', async () => {
    outcome = () => ({ error: { message: 'network error' } });
    enqueue(op);
    await vi.waitFor(() => expect(stored()[0]?.attempts).toBeGreaterThanOrEqual(1));
    const before = stored()[0].attempts;
    // 자동 flush와의 레이스를 피해 한 번이라도 더 시도가 반영될 때까지 구동
    for (let i = 0; i < 5 && stored()[0]?.attempts === before; i++) await flush();
    expect(stored()[0].attempts).toBeGreaterThan(before);
  });

  test('MAX_ATTEMPTS 초과 시 폐기된다', async () => {
    outcome = () => ({ error: { message: 'permanent' } });
    enqueue(op);
    // 8회 시도 후 폐기 — 자동 flush와 겹쳐도 안전하도록 넉넉히 구동
    for (let i = 0; i < 30 && pendingCount() > 0; i++) await flush();
    expect(pendingCount()).toBe(0);
  });

  test('FIFO: 선두 항목이 실패하면 뒤 항목까지 순서가 보존된다', async () => {
    outcome = () => ({ error: { message: 'offline' } });
    const a: WriteOp = { type: 'upsert', table: 'todos', values: { id: 'a' } };
    const b: WriteOp = { type: 'upsert', table: 'todos', values: { id: 'b' } };
    enqueue(a);
    enqueue(b);
    await vi.waitFor(() => expect(pendingCount()).toBe(2));
    const ops = stored().map(q => q.op);
    expect(ops[0]).toEqual(a);
    expect(ops[1]).toEqual(b);
  });

  test('clearOutbox가 큐와 저장소를 비운다', async () => {
    outcome = () => ({ error: { message: 'offline' } });
    enqueue(op);
    await vi.waitFor(() => expect(pendingCount()).toBe(1));
    clearOutbox();
    expect(pendingCount()).toBe(0);
    expect(stored()).toHaveLength(0);
  });
});
