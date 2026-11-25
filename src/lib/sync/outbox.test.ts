import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// supabase를 목으로 대체 — outcome()을 바꿔 각 쓰기의 성공/실패를 제어한다.
type Result = { data?: unknown; error: { code?: string; message: string } | null };
let outcome: () => Result | Promise<Result> = () => ({ error: null });
let sessionUser = 'u1';
let writes = 0;

function makeThenable() {
  writes += 1;
  const builder: Record<string, unknown> = {
    eq: () => builder,
    then: (res: (v: { error: unknown }) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve()
        .then(() => outcome())
        .then(res, rej),
  };
  return builder;
}

vi.mock('../supabase', () => {
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: sessionUser }, access_token: `token-${sessionUser}` } } }) },
    from: () => ({
      upsert: () => makeThenable(),
      insert: () => makeThenable(),
      update: () => makeThenable(),
      delete: () => makeThenable(),
    }),
    rpc: () => makeThenable(),
  };
  return { supabase: client, supabaseForSession: () => client };
});

import { enqueue, flush, clearOutbox, pauseOutbox, setOutboxOwner, pendingCount, heldMembershipRequests, cancelHeldMembershipRequests, heldGroupCreations, completeHeldGroupCreation, heldGroupStatusRequests, holdGroupStatusRequest, resolveGroupStatusRequests, goalSyncEntries, resolveGoalEntries, pendingGoalIds, practiceSyncEntries, resolvePracticeEntries, pendingPracticeIds, planSyncEntries, resolvePlanEntries, pendingPlanIds, recordSyncEntries, resolveRecordEntries, pendingRecordIds, type WriteOp } from './outbox';
const notifications = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('../../store/toastStore', () => ({ toast: notifications }));

const STORAGE_KEY = 'onju-outbox';
const op: WriteOp = { type: 'upsert', table: 'unrelated_records', values: { id: 't1', title: 'x' } };

test.each(['PGRST202', '42703'])('서버 저장 규격이 없는 %s 오류는 계정 전환·재시도 후에도 원래 기록을 보존한다', async code => {
  const request: WriteOp = { type:'rpc',fn:'save_record',args:{item_kind:'todo',item_key:'live-schema-check',
    expected_revision:null,mode:'create',request_id:'original-request',item_values:{title:'보존할 오프라인 입력',date:'2026-10-29'}} };
  const drained=vi.fn();
  window.addEventListener('onju-outbox-drained',drained);
  try {
    outcome=()=>({error:{code,message:code==='42703'?'column todos.revision does not exist':'Could not find the function public.save_record'}});
    enqueue(request,{requireDurable:true});await flush();
    expect(stored().map(i=>i.op)).toEqual([request]);expect(pendingCount('u1')).toBe(1);expect(drained).not.toHaveBeenCalled();
    pauseOutbox();setOutboxOwner('u2');sessionUser='u2';const before=writes;
    window.dispatchEvent(new StorageEvent('storage',{key:'onju-record-outbox:item:reload'}));await flush();
    expect(writes).toBe(before);expect(pendingCount('u2')).toBe(0);expect(stored().map(i=>i.op)).toEqual([request]);
    setOutboxOwner('u1');sessionUser='u1';await flush();
    expect(stored().map(i=>i.op)).toEqual([request]);expect(recordSyncEntries('u1')).toEqual([]);expect(drained).not.toHaveBeenCalled();
    outcome=()=>({error:null,data:{status:'saved',current:{id:'live-schema-check',revision:'original-request'}}});
    await flush();expect(stored()).toEqual([]);expect(drained).toHaveBeenCalledTimes(1);
  } finally { window.removeEventListener('onju-outbox-drained',drained); }
});

test('목표 삭제 원자 요청은 실패·계정 전환 후에도 원래 적용일과 순서를 유지해 재전송한다', async () => {
  const deletion: WriteOp = {type:'rpc',fn:'delete_monthly_goal_checked',args:{gid:'goal',request_id:'delete-r',expected_revision:'base',effective_date:'2026-10-27',p_timezone:'Asia/Seoul'}};
  outcome=()=>({error:{message:'offline'}});enqueue(deletion);await flush();enqueue(op);await flush();
  expect(stored().map(i=>i.op)).toEqual([deletion,op]);
  setOutboxOwner('u2');sessionUser='u2';outcome=()=>({error:null});const previous=writes;await flush();expect(writes).toBe(previous);expect(stored()).toHaveLength(2);
  setOutboxOwner('u1');sessionUser='u1';outcome=()=>({error:null,data:{status:'deleted',current:null,effective_date:'2026-10-27'}});await flush();expect(stored()).toEqual([]);expect(writes).toBe(previous+2);
});

test('목표 분류·기간 수정은 실패 뒤 새 큐 읽기와 계정 복귀에서도 동일한 변경으로 재전송한다',async()=>{
  const edit:WriteOp={type:'rpc',fn:'save_monthly_goal',args:{gid:'g',request_id:'r1',expected_revision:'r0',creating:false,goal_values:{category:'faith',start_date:'2026-11-01',end_date:'2026-11-30'}}};
  outcome=()=>({error:{message:'offline'}});enqueue(edit);await flush();expect(stored().map(item=>item.op)).toEqual([edit]);
  setOutboxOwner('u2');sessionUser='u2';outcome=()=>({error:null,data:{status:'saved',current:null}});const before=writes;await flush();expect(writes).toBe(before);
  setOutboxOwner('u1');sessionUser='u1';await flush();expect(stored()).toEqual([]);expect(writes).toBe(before+1);
});

const goalEdit = (revision='r1',base='r0'): WriteOp => ({type:'rpc',fn:'save_monthly_goal',args:{gid:'g',request_id:revision,expected_revision:base,creating:false,goal_values:{id:'g',title:revision}}});
test('충돌은 같은 목표의 뒤 편집만 보류하고 다른 기록은 저장한다',async()=>{
  outcome=()=>({error:{message:'offline'}});enqueue(goalEdit());enqueue(goalEdit('r2','r1'));enqueue(op);await flush();
  outcome=()=>({error:null,data:{status:'conflict',current:{id:'g',revision:'remote',title:'서버'}}});const before=writes;await flush();
  expect(writes).toBe(before+2);expect(pendingCount()).toBe(0);expect(goalSyncEntries('u1')).toHaveLength(2);expect(goalSyncEntries('u2')).toEqual([]);expect(pendingGoalIds('u1')).toEqual(['g']);
  const requests=goalSyncEntries('u1');expect(requests[0].conflict?.current).toMatchObject({title:'서버'});
  expect(()=>enqueue(goalEdit('r3'),{requireDurable:true})).toThrow('충돌');expect(stored()).toHaveLength(2);
});
test('구버전 목표 upsert는 자동 전송하지 않고 수동 비교까지 보존한다',async()=>{
  enqueue({type:'upsert',table:'monthly_goals',values:{id:'g',title:'구버전 입력'}});enqueue(op);await flush();
  expect(writes).toBe(1);expect(goalSyncEntries('u1')).toHaveLength(1);expect(pendingCount()).toBe(0);
});
test('복구는 비교한 계정·입력 목록에만 적용하고 다른 탭의 후속 요청을 지우지 않는다',async()=>{
  enqueue({type:'upsert',table:'monthly_goals',values:{id:'g',title:'원래 입력'}});await flush();
  const signature=JSON.stringify(goalSyncEntries('u1'));setOutboxOwner('u2');expect(()=>resolveGoalEntries('u1',signature,'g',goalEdit())).toThrow();
  setOutboxOwner('u1');enqueue({type:'upsert',table:'monthly_goals',values:{id:'g',title:'다른 탭 입력'}});await flush();
  expect(()=>resolveGoalEntries('u1',signature,'g',goalEdit())).toThrow();expect(stored()).toHaveLength(2);
});
test('복구 교체 보관이 실패하면 원래 입력을 유지하고 서버로 보내지 않는다',async()=>{
  enqueue({type:'upsert',table:'monthly_goals',values:{id:'g',title:'남길 내용'}});await flush();const signature=JSON.stringify(goalSyncEntries('u1'));
  const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
  expect(()=>resolveGoalEntries('u1',signature,'g',goalEdit())).toThrow('보관');spy.mockRestore();
  expect(stored()).toHaveLength(1);expect(goalSyncEntries('u1')).toHaveLength(1);expect(writes).toBe(0);
});
test('복구 정리 실패·재시작·다시 충돌 후에도 이전 요청이 되살아나지 않는다',async()=>{
  enqueue({type:'upsert',table:'monthly_goals',values:{id:'g',title:'옛 입력'}});await flush();
  outcome=()=>({error:null,data:{status:'conflict',current:{id:'g',revision:'remote'}}});
  resolveGoalEntries('u1',JSON.stringify(goalSyncEntries('u1')),'g',goalEdit());await flush();expect(goalSyncEntries('u1')).toHaveLength(1);
  const signature=JSON.stringify(goalSyncEntries('u1'));
  outcome=()=>({error:null,data:{status:'saved',current:{id:'g',revision:'r2'}}});
  const spy=vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw new Error('locked');});
  resolveGoalEntries('u1',signature,'g',goalEdit('r2','remote'));await flush();expect(stored()).toHaveLength(3);expect(goalSyncEntries('u1')).toHaveLength(0);
  spy.mockRestore();window.dispatchEvent(new StorageEvent('storage',{key:'onju-outbox:item:reload'}));await flush();expect(stored()).toEqual([]);
});
test('서버 내용 채택은 원격 쓰기 없이 해당 목표 입력만 정리한다',async()=>{
  enqueue({type:'upsert',table:'monthly_goals',values:{id:'g',title:'입력'}});await flush();
  resolveGoalEntries('u1',JSON.stringify(goalSyncEntries('u1')),'g',{type:'goal-accept',goalId:'g',current:null});await flush();expect(stored()).toEqual([]);expect(writes).toBe(0);
});
test('계정 전환 중 도착한 저장 응답은 화면·보류 상태에 적용하지 않는다',async()=>{
  let finish!:(result:Result)=>void;outcome=()=>new Promise<Result>(resolve=>{finish=resolve;});const saved=vi.fn();window.addEventListener('onju-goal-saved',saved);
  enqueue(goalEdit());const task=flush();await new Promise(resolve=>setTimeout(resolve,0));setOutboxOwner('u2');sessionUser='u2';finish({error:null,data:{status:'saved',current:{id:'g'}}});await task;
  expect(saved).not.toHaveBeenCalled();expect(stored()).toHaveLength(1);window.removeEventListener('onju-goal-saved',saved);
});

test('구버전 상태 변경·새 확인 대기는 자동 실행하지 않고 다른 기록 큐를 막지 않는다',async()=>{
  enqueue({type:'update',table:'small_groups',match:{id:'old'},values:{status:'completed'}});
  const id=holdGroupStatusRequest('u1','new','active','recruiting');expect(id).toBeTruthy();
  enqueue(op);await flush();expect(writes).toBe(1);expect(pendingCount()).toBe(0);expect(heldGroupStatusRequests('u1')).toHaveLength(2);
  expect(holdGroupStatusRequest('u1','new','completed','active')).toBeUndefined();
  const snapshot=heldGroupStatusRequests('u1').map(r=>r.id);const later=holdGroupStatusRequest('u1','later','active','recruiting');
  expect(resolveGroupStatusRequests('u1',snapshot)).toBe(true);expect(heldGroupStatusRequests('u1')).toEqual([{id:later,groupId:'later'}]);
});

test('다른 계정의 상태 요청과 읽기·정리 실패한 요청은 보존한다',async()=>{
  const id=holdGroupStatusRequest('u1','g','active','recruiting')!;setOutboxOwner('u2');
  expect(resolveGroupStatusRequests('u1',[id])).toBe(false);expect(holdGroupStatusRequest('u1','g2','active','recruiting')).toBeUndefined();expect(heldGroupStatusRequests('u2')).toEqual([]);
  setOutboxOwner('u1');const spy=vi.spyOn(Storage.prototype,'removeItem').mockImplementation(()=>{throw new Error('denied');});
  expect(resolveGroupStatusRequests('u1',[id])).toBe(false);spy.mockRestore();expect(heldGroupStatusRequests('u1')).toHaveLength(1);
});

function stored(): Array<{ op: WriteOp; attempts: number }> {
  const items: Array<{ op: WriteOp; attempts: number; queuedAt: number }> = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!;
    if (key.startsWith(`${STORAGE_KEY}:item:`) || key.startsWith('onju-record-outbox:item:')) items.push(JSON.parse(localStorage.getItem(key)!));
  }
  return items.sort((a, b) => a.queuedAt - b.queuedAt);
}

beforeEach(() => {
  localStorage.clear();
  clearOutbox();
  setOutboxOwner('u1'); localStorage.setItem('onju_last_uid', 'u1');
  sessionUser = 'u1';
  writes = 0;
  notifications.error.mockClear();
  outcome = () => ({ error: null });
});

afterEach(() => {
  clearOutbox();
});

describe('outbox', () => {
  test('동시 flush는 같은 전송 완료를 기다리고 쓰기를 중복 실행하지 않는다', async () => {
    let finish!: (result: Result) => void;
    outcome = () => new Promise(resolve => { finish = resolve; });
    enqueue(op);
    await vi.waitFor(() => expect(writes).toBe(1));
    let finished = false;
    const waiting = flush().then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(writes).toBe(1);
    finish({ error: null });
    await waiting;
    expect(pendingCount()).toBe(0);
    expect(writes).toBe(1);
  });

  test('이전 계정의 지연 응답은 새 계정의 큐 항목을 제거하지 않는다', async () => {
    let finish!: (result: Result) => void;
    outcome = () => new Promise(resolve => { finish = resolve; });
    enqueue(op);
    await vi.waitFor(() => expect(writes).toBe(1));
    clearOutbox();
    sessionUser = 'u2';
    setOutboxOwner('u2'); localStorage.setItem('onju_last_uid', 'u2');
    outcome = () => ({ error: { message: 'offline' } });
    enqueue({ ...op, values: { id: 't2' } });
    finish({ error: null });
    await flush();
    expect(stored()).toHaveLength(1);
    expect(stored()[0].op).toEqual({ ...op, values: { id: 't2' } });
    expect(writes).toBe(2);
  });

  test('세션 사용자가 큐 소유자와 다르면 쓰기를 실행하지 않는다', async () => {
    sessionUser = 'u2';
    enqueue(op);
    await flush();
    expect(writes).toBe(0);
    expect(pendingCount()).toBe(1);
  });

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

  test('재시도 한도를 넘겨도 작업을 버리지 않고 재연결 때 전송한다', async () => {
    outcome = () => ({ error: { message: 'permanent' } });
    enqueue(op);
    for (let i = 0; i < 12; i++) await flush();
    expect(pendingCount()).toBe(1);
    expect(stored()).toHaveLength(1);
    outcome = () => ({ error: null });
    await flush();
    expect(pendingCount()).toBe(0);
  });

  test('로그아웃과 B 계정 로그인 중 A의 작업을 보관하고 A 복귀 때만 전송한다', async () => {
    outcome = () => ({ error: { message: 'offline' } });
    enqueue(op); await flush();
    pauseOutbox();
    setOutboxOwner(null); localStorage.removeItem('onju_last_uid');
    expect(pendingCount()).toBe(0);
    expect(stored()).toHaveLength(1);
    sessionUser = 'u2'; setOutboxOwner('u2'); localStorage.setItem('onju_last_uid', 'u2');
    outcome = () => ({ error: null });
    enqueue({ ...op, values: { id: 'b' } }); await flush();
    expect(pendingCount()).toBe(0);
    expect(stored().map(item => item.op)).toEqual([op]);
    pauseOutbox(); sessionUser = 'u1'; setOutboxOwner('u1'); localStorage.setItem('onju_last_uid', 'u1');
    await flush();
    expect(stored()).toHaveLength(0);
  });

  test('이전 계정의 응답이 멈춰 있어도 새 계정 전송을 막지 않는다', async () => {
    let finish!: (result: Result) => void;
    outcome = () => new Promise(resolve => { finish = resolve; });
    enqueue(op); await vi.waitFor(() => expect(writes).toBe(1));
    pauseOutbox(); sessionUser = 'u2'; setOutboxOwner('u2'); localStorage.setItem('onju_last_uid', 'u2');
    outcome = () => ({ error: null });
    enqueue({ ...op, values: { id: 'b' } }); await flush();
    expect(writes).toBe(2);
    expect(stored().map(item => item.op)).toEqual([op]);
    finish({ error: null }); await Promise.resolve();
    expect(stored().map(item => item.op)).toEqual([op]);
  });

  test('500개가 넘는 오프라인 편집도 가장 오래된 작업을 지우지 않는다', async () => {
    outcome = () => ({ error: { message: 'offline' } });
    for (let i = 0; i < 501; i++) enqueue({ ...op, values: { id: `todo-${i}` } });
    await flush();
    expect(stored()).toHaveLength(501);
    expect(stored()[0].op).toEqual({ ...op, values: { id: 'todo-0' } });
  });

  test('업데이트·upsert의 유일성 충돌은 저장 성공으로 간주하지 않는다', async () => {
    outcome = () => ({ error: { code: '23505', message: 'unique conflict' } });
    enqueue(op); await flush();
    expect(pendingCount()).toBe(1);
  });

  test('저장 공간 부족을 알리고 메모리의 대기 작업은 유지한다', async () => {
    outcome = () => ({ error: { message: 'offline' } });
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
    try {
      enqueue(op); await flush();
      expect(pendingCount()).toBe(1);
      expect(notifications.error).toHaveBeenCalledWith(expect.stringContaining('저장 공간'));
    } finally { spy.mockRestore(); }
  });

  test('계정 삭제는 그 계정의 작업만 지우고 다른 계정 작업은 남긴다', async () => {
    outcome = () => ({ error: { message: 'offline' } });
    enqueue(op); await flush();
    pauseOutbox(); sessionUser = 'u2'; setOutboxOwner('u2'); localStorage.setItem('onju_last_uid', 'u2');
    enqueue({ ...op, values: { id: 'b' } }); await flush();
    clearOutbox('u1');
    expect(stored().map(item => item.op)).toEqual([{ ...op, values: { id: 'b' } }]);
  });

  test('A 탈퇴 정리가 B의 진행 중인 전송 완료를 무효화하지 않는다', async () => {
    outcome = () => ({ error: { message: 'offline' } });
    enqueue(op); await flush();
    pauseOutbox(); sessionUser = 'u2'; setOutboxOwner('u2'); localStorage.setItem('onju_last_uid', 'u2');
    let finish!: (value: Result) => void;
    outcome = () => new Promise(resolve => { finish = resolve; });
    enqueue({ ...op, values: { id: 'b' } });
    await vi.waitFor(() => expect(writes).toBe(2));
    clearOutbox('u1'); finish({ error: null }); await flush();
    expect(stored()).toHaveLength(0);
  });

  test('기존 배열 큐를 작업별 저장으로 옮기고 FIFO 순서대로 전송한다', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([
      { id: 'legacy-a', ownerId: 'u1', op, attempts: 0 },
      { id: 'legacy-b', ownerId: 'u1', op: { ...op, values: { id: 'second' } }, attempts: 0 },
    ]));
    outcome = () => ({ error: { message: 'offline' } });
    await flush();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(stored().map(item => item.op)).toEqual([op, { ...op, values: { id: 'second' } }]);
    outcome = () => ({ error: null }); await flush();
    expect(stored()).toHaveLength(0);
  });

  test('다른 탭이 보관한 A의 작업을 B의 새 저장으로 덮어쓰지 않는다', async () => {
    localStorage.setItem(`${STORAGE_KEY}:item:external-a`, JSON.stringify({ id: 'external-a', ownerId: 'u1', op, attempts: 0, queuedAt: 1 }));
    sessionUser = 'u2'; setOutboxOwner('u2'); localStorage.setItem('onju_last_uid', 'u2');
    outcome = () => ({ error: { message: 'offline' } });
    enqueue({ ...op, values: { id: 'b' } }); await flush();
    expect(stored()).toHaveLength(2);
    expect(stored()[0].op).toEqual(op);
  });

  test('다른 계정의 보관 작업만 있으면 빈 계정의 전송 완료 이벤트를 반복하지 않는다', async () => {
    outcome = () => ({ error: { message: 'offline' } });
    enqueue(op); await flush();
    pauseOutbox(); sessionUser = 'u2'; setOutboxOwner('u2'); localStorage.setItem('onju_last_uid', 'u2');
    const drained = vi.fn(); window.addEventListener('onju-outbox-drained', drained);
    try {
      await flush(); await flush();
      expect(drained).not.toHaveBeenCalled();
      expect(stored()).toHaveLength(1);
    } finally { window.removeEventListener('onju-outbox-drained', drained); }
  });

  test('다른 탭이 마지막 UID를 바꿔도 아직 A 화면에서 작성한 작업을 B 소유로 보관하지 않는다', async () => {
    localStorage.setItem('onju_last_uid', 'u2');
    sessionUser = 'u2'; // 공유 Auth 저장소는 이미 B, 이 탭의 Auth 이벤트는 아직 도착하지 않은 상태
    enqueue(op); await flush();
    expect(stored()[0]).toMatchObject({ ownerId: 'u1' });
    expect(pendingCount('u1')).toBe(1);
    expect(pendingCount('u2')).toBe(0);
    expect(writes).toBe(0);
  });

  test('다른 탭이 완료한 작업을 이전 요청의 실패 응답으로 되살리지 않는다', async () => {
    let finish!: (value: Result) => void;
    outcome = () => new Promise(resolve => { finish = resolve; });
    enqueue(op); await vi.waitFor(() => expect(writes).toBe(1));
    const key = [...Array(localStorage.length)].map((_, i) => localStorage.key(i)!).find(key => key.startsWith(`${STORAGE_KEY}:item:`))!;
    localStorage.removeItem(key);
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: null }));
    finish({ error: { message: 'late network failure' } }); await flush();
    expect(stored()).toHaveLength(0);
  });

  test('FIFO: 선두 항목이 실패하면 뒤 항목까지 순서가 보존된다', async () => {
    outcome = () => ({ error: { message: 'offline' } });
    const a: WriteOp = { type: 'upsert', table: 'unrelated_records', values: { id: 'a' } };
    const b: WriteOp = { type: 'upsert', table: 'unrelated_records', values: { id: 'b' } };
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


test('구버전 가입·탈퇴는 계정별 확인 대기로 남기고 일반 저장을 막거나 자동 재전송하지 않는다', async()=>{
  enqueue({type:'rpc',fn:'join_group',args:{gid:'g1'}});
  enqueue({type:'delete',table:'group_members',match:{group_id:'g2',user_id:'u1'}});
  enqueue(op);await flush();
  expect(writes).toBe(1);expect(pendingCount()).toBe(0);expect(stored()).toHaveLength(2);
  expect(heldMembershipRequests('u1').map(r=>r.action)).toEqual(['join','leave']);
  expect(heldMembershipRequests('u2')).toEqual([]);
  expect(cancelHeldMembershipRequests('u2','g1')).toBe(false);expect(stored()).toHaveLength(2);
  expect(cancelHeldMembershipRequests('u1','g1')).toBe(true);expect(heldMembershipRequests('u1')).toEqual([expect.objectContaining({groupId:'g2'})]);
});


test('구버전 생성의 두 작업을 같은 ID로 묶어 보관하고 복구 확인 전에는 삭제하지 않는다',async()=>{
  enqueue({type:'insert',table:'small_groups',values:{id:'g',title:'보관된 이름',creator_id:'u1'}});
  enqueue({type:'insert',table:'group_members',values:{group_id:'g',user_id:'u1',role:'creator'}});
  enqueue(op);await flush();expect(writes).toBe(1);expect(pendingCount()).toBe(0);expect(stored()).toHaveLength(2);
  expect(heldGroupCreations('u1')).toEqual([{groupId:'g',details:{id:'g',title:'보관된 이름',creator_id:'u1'}}]);expect(heldGroupCreations('u2')).toEqual([]);
  expect(completeHeldGroupCreation('u2','g')).toBe(false);expect(stored()).toHaveLength(2);expect(completeHeldGroupCreation('u1','g')).toBe(true);expect(stored()).toHaveLength(0);
});

test('구버전 RPC와 직접 목표 DELETE는 자동 전송 없이 비교 대기로 남긴다',async()=>{
  enqueue({type:'rpc',fn:'delete_monthly_goal_preserving_history',args:{gid:'old',effective_date:'2020-01-01'}});
  enqueue({type:'delete',table:'monthly_goals',match:{id:'direct'}});enqueue(op);await flush();
  expect(writes).toBe(1);expect(goalSyncEntries('u1')).toHaveLength(2);expect(pendingCount()).toBe(0);
});
const checkedDeletion:WriteOp={type:'rpc',fn:'delete_monthly_goal_checked',args:{gid:'g',request_id:'delete',expected_revision:'r0',effective_date:'2020-01-01',p_timezone:'Asia/Seoul'},goalSnapshot:{id:'g',title:'원래 삭제 대상'}};
test('삭제 대기 중에는 중복 삭제와 편집을 막고 충돌 후에는 다른 기록을 계속 저장한다',async()=>{
  outcome=()=>({error:{message:'offline'}});enqueue(checkedDeletion,{requireDurable:true});await flush();
  expect(()=>enqueue(checkedDeletion,{requireDurable:true})).toThrow('삭제 결과');expect(()=>enqueue(goalEdit(),{requireDurable:true})).toThrow('삭제 결과');
  enqueue(op);outcome=()=>({error:null,data:{status:'conflict',current:{id:'g',revision:'new',title:'새 수정'}}});await flush();
  expect(goalSyncEntries('u1')[0]).toMatchObject({op:checkedDeletion,conflict:{status:'conflict',current:{title:'새 수정'}}});expect(pendingCount()).toBe(0);
});
test('삭제 재확인도 새 버전과 충돌하면 다시 보류하고 취소는 원격 쓰기 없이 정리한다',async()=>{
  outcome=()=>({error:null,data:{status:'conflict',current:{id:'g',revision:'new'}}});enqueue(checkedDeletion);await flush();
  resolveGoalEntries('u1',JSON.stringify(goalSyncEntries('u1')),'g',{...checkedDeletion,args:{...checkedDeletion.args,request_id:'again',expected_revision:'new'}});await flush();
  expect(goalSyncEntries('u1')).toHaveLength(1);const before=writes;
  resolveGoalEntries('u1',JSON.stringify(goalSyncEntries('u1')),'g',{type:'goal-accept',goalId:'g',current:{id:'g',revision:'latest'}});await flush();
  expect(writes).toBe(before);expect(stored()).toEqual([]);
});
test('계정 전환 후 늦은 삭제 응답은 새 화면에 적용하지 않고 원래 계정 요청을 보관한다',async()=>{
  let finish!:(result:Result)=>void;outcome=()=>new Promise<Result>(resolve=>{finish=resolve;});const deleted=vi.fn();window.addEventListener('onju-goal-deleted',deleted);
  enqueue(checkedDeletion);const task=flush();await new Promise(resolve=>setTimeout(resolve,0));setOutboxOwner('u2');sessionUser='u2';finish({error:null,data:{status:'deleted',current:null,effective_date:'2020-01-01'}});await task;
  expect(deleted).not.toHaveBeenCalled();expect(stored()).toHaveLength(1);window.removeEventListener('onju-goal-deleted',deleted);
});
test('불완전한 삭제 응답은 성공으로 정리하지 않고 동일 요청을 남긴다',async()=>{
  outcome=()=>({error:null,data:{status:'deleted',current:null}});enqueue(checkedDeletion);await flush();expect(stored()[0].op).toEqual(checkedDeletion);expect(pendingCount()).toBe(1);
});

const practiceEdit=(kind='habit',id='h',revision='r1',base='r0'):WriteOp=>({type:'rpc',fn:'save_practice',args:{item_kind:kind,item_id:id,request_id:revision,expected_revision:base,creating:false,item_values:{title:revision},effective_date:'2026-10-27',p_timezone:'Asia/Seoul'}});
test('실천 충돌은 같은 종류·ID만 보류하고 수행 체크와 다른 실천은 저장한다',async()=>{
  outcome=()=>({error:{message:'offline'}});enqueue(practiceEdit());enqueue(practiceEdit('habit','h','r2','r1'));enqueue(practiceEdit('routine','h'));enqueue({type:'upsert',table:'habit_logs',values:{habit_id:'h',date:'2026-10-27',completed:true}});await flush();
  let n=0;outcome=()=>({error:null,data:n++===0?{status:'conflict',current:{title:'서버',revision:'remote'}}:{status:'saved',current:{}}});await flush();
  expect(practiceSyncEntries('u1')).toHaveLength(2);expect(practiceSyncEntries('u2')).toEqual([]);expect(pendingPracticeIds('u1')).toEqual(['habit:h']);expect(pendingCount()).toBe(0);
  expect(()=>enqueue(practiceEdit(),{requireDurable:true})).toThrow('충돌');expect(n).toBe(3);
});
test('구버전 실천 삭제·덮어쓰기와 계정 전환은 자동 전송하지 않고 비교한 요청만 정리한다',async()=>{
  enqueue({type:'delete',table:'habits',match:{id:'h'}});enqueue({type:'upsert',table:'daily_routines',values:{id:'h',title:'기도'}});await flush();expect(writes).toBe(0);
  const signature=JSON.stringify(practiceSyncEntries('u1').filter(e=>e.key==='habit:h'));
  setOutboxOwner('u2');expect(()=>resolvePracticeEntries('u1',signature,'habit:h',practiceEdit())).toThrow();setOutboxOwner('u1');
  const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});expect(()=>resolvePracticeEntries('u1',signature,'habit:h',practiceEdit())).toThrow('보관');spy.mockRestore();expect(stored()).toHaveLength(2);
  resolvePracticeEntries('u1',signature,'habit:h',{type:'practice-accept',kind:'habit',itemId:'h',current:null});await flush();
  expect(practiceSyncEntries('u1')).toHaveLength(1);expect(practiceSyncEntries('u1')[0].kind).toBe('routine');expect(writes).toBe(0);
});
test('다른 탭에서 바꾼 실천 요청과 계정 변경 중 늦게 온 응답은 새 입력을 건드리지 않는다',async()=>{
  enqueue({type:'upsert',table:'habits',values:{id:'h',title:'초안'}});await flush();const signature=JSON.stringify(practiceSyncEntries('u1'));
  enqueue({type:'update',table:'habits',values:{title:'다른 탭'},match:{id:'h'}});await flush();expect(()=>resolvePracticeEntries('u1',signature,'habit:h',practiceEdit())).toThrow('바뀌');
  clearOutbox();let finish!:(v:Result)=>void;outcome=()=>new Promise(resolve=>{finish=resolve;});const event=vi.fn();window.addEventListener('onju-practice-saved',event);
  enqueue(practiceEdit());await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));setOutboxOwner('u2');sessionUser='u2';finish({error:null,data:{status:'saved',current:{}}});await flush();
  expect(event).not.toHaveBeenCalled();expect(stored()).toHaveLength(1);window.removeEventListener('onju-practice-saved',event);
});

const planEdit=(kind='bundle',id='p',revision='r1',base='r0',deleting=false):WriteOp=>({type:'rpc',fn:'save_plan',args:{item_kind:kind,item_id:id,request_id:revision,expected_revision:base,creating:false,deleting,item_values:{title:revision}}});
const recordEdit=(kind='memo',key='r:2026-10-28',revision='r1',mode='edit'):WriteOp=>({type:'rpc',fn:'save_record',args:{item_kind:kind,item_key:key,request_id:revision,expected_revision:'r0',mode,item_values:{memo:'남길 메모'}}});
test('메모 충돌은 같은 기록만 보류하고 해당 루틴 수행 체크·다른 일기는 계속 전송한다',async()=>{
  outcome=()=>({error:{message:'offline'}});enqueue(recordEdit());enqueue(recordEdit('memo','r:2026-10-28','r2'));enqueue(recordEdit('check','r:2026-10-28','r3','complete'));enqueue(recordEdit('diary','2026-10-27','r4'));await flush();
  let n=0;outcome=()=>({error:null,data:n++===0?{status:'conflict',current:{memo:'서버'}}:{status:'saved',current:{}}});await flush();
  expect(n).toBe(3);expect(recordSyncEntries('u1')).toHaveLength(2);expect(recordSyncEntries('u2')).toEqual([]);expect(pendingRecordIds('u1')).toEqual(['memo:r:2026-10-28']);expect(pendingCount()).toBe(0);
  expect(()=>enqueue(recordEdit(),{requireDurable:true})).toThrow('충돌');
});
test('구버전 할 일·일기·메모 쓰기는 보류하고 복구 보관 실패·다른 계정은 원본을 정리하지 않는다',async()=>{
  for(const op of [{type:'upsert',table:'todos',values:{id:'t'}},{type:'delete',table:'diary_entries',match:{date:'2026-10-28'}},{type:'upsert',table:'routine_logs',values:{routine_id:'r',date:'2026-10-28',memo:'입력'}}] as WriteOp[])enqueue(op);
  await flush();expect(writes).toBe(0);expect(recordSyncEntries('u1')).toHaveLength(3);
  const signature=JSON.stringify(recordSyncEntries('u1').filter(e=>e.kind==='todo'));
  const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});expect(()=>resolveRecordEntries('u1',signature,'todo:t',recordEdit('todo','t'))).toThrow();spy.mockRestore();
  setOutboxOwner('u2');expect(()=>resolveRecordEntries('u1',signature,'todo:t',recordEdit('todo','t'))).toThrow();setOutboxOwner('u1');
  resolveRecordEntries('u1',signature,'todo:t',{type:'record-accept',kind:'todo',itemId:'t',current:null});await flush();expect(recordSyncEntries('u1')).toHaveLength(2);
});
test('기록 삭제 대기는 중복 삭제·편집을 막고 늦게 온 응답은 계정 전환 뒤 반영하지 않는다',async()=>{
  let finish!:(v:Result)=>void;outcome=()=>new Promise(resolve=>{finish=resolve;});const saved=vi.fn();window.addEventListener('onju-record-saved',saved);
  enqueue(recordEdit('todo','t','delete','delete'),{requireDurable:true});await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  expect(pendingRecordIds('u1',true)).toEqual(['todo:t']);expect(()=>enqueue(recordEdit('todo','t'),{requireDurable:true})).toThrow('삭제');
  setOutboxOwner('u2');sessionUser='u2';finish({error:null,data:{status:'saved',current:null}});await flush();expect(saved).not.toHaveBeenCalled();expect(stored()).toHaveLength(1);window.removeEventListener('onju-record-saved',saved);
});
test('묶음·주간 목표는 충돌한 종류와 ID의 후속 쓰기만 보류하고 다른 항목과 로그는 전송한다',async()=>{
  outcome=()=>({error:{message:'offline'}});enqueue(planEdit());enqueue(planEdit('bundle','p','r2','r1'));enqueue(planEdit('weekly'));enqueue(op);await flush();
  let n=0;outcome=()=>({error:null,data:n++===0?{status:'conflict',current:{revision:'remote'}}:{status:'saved',current:{}}});await flush();
  expect(n).toBe(3);expect(planSyncEntries('u1')).toHaveLength(2);expect(planSyncEntries('u2')).toEqual([]);expect(pendingPlanIds('u1')).toEqual(['bundle:p']);expect(pendingCount()).toBe(0);
  expect(()=>enqueue(planEdit(),{requireDurable:true})).toThrow('충돌');
});
test('구버전 묶음·주간 목표 직접 저장·삭제는 전송하지 않고 비교한 요청만 안전하게 교체한다',async()=>{
  enqueue({type:'upsert',table:'personal_routines',values:{id:'p',title:'입력'}});enqueue({type:'delete',table:'weekly_goals',match:{id:'w'}});enqueue(op);await flush();expect(writes).toBe(1);
  const entries=planSyncEntries('u1').filter(e=>e.key==='bundle:p'),signature=JSON.stringify(entries);
  setOutboxOwner('u2');expect(()=>resolvePlanEntries('u1',signature,'bundle:p',planEdit())).toThrow();setOutboxOwner('u1');
  const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});expect(()=>resolvePlanEntries('u1',signature,'bundle:p',planEdit())).toThrow('보관');spy.mockRestore();expect(planSyncEntries('u1')).toHaveLength(2);
  resolvePlanEntries('u1',signature,'bundle:p',{type:'plan-accept',kind:'bundle',itemId:'p',current:null});await flush();expect(planSyncEntries('u1').map(e=>e.key)).toEqual(['weekly:w']);expect(writes).toBe(1);
});
test('묶음 삭제 대기 중 편집·중복 삭제를 막고 응답 유실은 같은 요청으로만 재시도한다',async()=>{
  const deletion=planEdit('bundle','p','delete','r0',true);outcome=()=>({error:{message:'lost'}});enqueue(deletion,{requireDurable:true});await flush();
  expect(pendingPlanIds('u1',true)).toEqual(['bundle:p']);expect(()=>enqueue(planEdit(),{requireDurable:true})).toThrow('삭제');expect(()=>enqueue(deletion,{requireDurable:true})).toThrow();expect(stored()[0].op).toEqual(deletion);
  const saved=vi.fn();window.addEventListener('onju-plan-saved',saved);outcome=()=>({error:null,data:{status:'saved',current:null}});await flush();expect(saved).toHaveBeenCalledOnce();expect(stored()).toEqual([]);window.removeEventListener('onju-plan-saved',saved);
});
test('묶음 보관 조건 오류는 안내로 보류하고 다른 저장을 막지 않으며 계정 삭제는 소유자만 정리한다',async()=>{
  outcome=()=>({error:{code:'P0001',message:'주간 목표 칸이 가득 찼어요'}});enqueue(planEdit('weekly'));await flush();expect(planSyncEntries('u1')[0].conflict?.reason).toContain('가득');
  setOutboxOwner('u2');sessionUser='u2';enqueue({type:'delete',table:'personal_routines',match:{id:'p'}});await flush();clearOutbox('u1');expect(planSyncEntries('u1')).toEqual([]);expect(planSyncEntries('u2')).toHaveLength(1);
});
test('계정 전환 중 늦게 온 묶음 응답은 새 계정 화면이나 큐를 바꾸지 않는다',async()=>{
  let finish!:(v:Result)=>void;outcome=()=>new Promise(resolve=>{finish=resolve;});const saved=vi.fn();window.addEventListener('onju-plan-saved',saved);enqueue(planEdit());await vi.waitFor(()=>expect(finish).toBeTypeOf('function'));
  setOutboxOwner('u2');sessionUser='u2';finish({error:null,data:{status:'saved',current:{id:'p'}}});await flush();expect(saved).not.toHaveBeenCalled();expect(stored()).toHaveLength(1);window.removeEventListener('onju-plan-saved',saved);
});

test('새 기록 큐는 구버전 탭의 키 검색에 노출되지 않으며 응답 실패 시 사라지지 않는다',async()=>{
  outcome=()=>({error:{message:'lost'}});enqueue(recordEdit(),{requireDurable:true});await flush();
  const oldKeys=Object.keys(localStorage).filter(k=>k.startsWith('onju-outbox:item:'));expect(oldKeys).toEqual([]);
  expect(Object.keys(localStorage).filter(k=>k.startsWith('onju-record-outbox:item:'))).toHaveLength(1);expect(stored()).toHaveLength(1);
  outcome=()=>({error:null,data:{status:'conflict',current:{memo:'remote'}}});await flush();expect(recordSyncEntries('u1')).toHaveLength(1);
  setOutboxOwner('u2');sessionUser='u2';enqueue(recordEdit('diary','2026-10-27'),{requireDurable:true});await flush();clearOutbox('u1');expect(recordSyncEntries('u1')).toHaveLength(0);expect(recordSyncEntries('u2')).toHaveLength(1);
});
test('이전 키에 남은 새 기록 요청은 먼저 별도 큐에 보관한 뒤 원래 키를 정리한다',async()=>{
  outcome=()=>({error:{message:'offline'}});
  localStorage.setItem('onju-outbox:item:migration',JSON.stringify({id:'migration',ownerId:'u1',op:recordEdit(),attempts:0,queuedAt:1}));
  await flush();expect(localStorage.getItem('onju-outbox:item:migration')).toBeNull();expect(JSON.parse(localStorage.getItem('onju-record-outbox:item:migration')!).op).toEqual(recordEdit());
});
