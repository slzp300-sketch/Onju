import { act, createElement as h } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
const api=vi.hoisted(()=>({owner:'A',row:null as Record<string,unknown>|null,save:vi.fn(),read:vi.fn(),receipts:new Map<string,string>(),lost:false,fail:false}));
vi.mock('../lib/supabase',()=>{const c={auth:{getSession:async()=>({data:{session:{user:{id:api.owner},access_token:api.owner}},error:null})},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:()=>api.read()};return q;},rpc:api.save};return {supabase:c,supabaseForSession:()=>c};});
vi.mock('../store/authStore',async()=>{const {create}=await import('zustand');return {useAuthStore:create(()=>({user:{id:'A'}}))};});
import { useAuthStore } from '../store/authStore';
import { useUIStore } from '../store/uiStore';
import { useTodoStore } from '../store/todoStore';
import { useDiaryStore } from '../store/diaryStore';
import { useRoutineStore } from '../store/routineStore';
import { todoFromRow,diaryFromRow,routineLogFromRow } from '../data/mappers';
import { clearOutbox,enqueue,flush,recordSyncEntries,setOutboxOwner } from '../lib/sync/outbox';
import { recordWrite } from '../data/recordWrites';
import TodoNew from './TodoNew';
import Diary from './Diary';
import FaithNotes from './FaithNotes';
import { writeDraft } from '../lib/localDrafts';
import RecordConflicts from './RecordConflicts';
import PrayerMemo from '../components/routines/PrayerMemo';
import BibleInput from '../components/routines/BibleInput';
import type { User } from '../types';
const id='11111111-1111-4111-8111-111111111111',r0='22222222-2222-4222-8222-222222222222',r1='33333333-3333-4333-8333-333333333333',day='2026-10-28';
let host:HTMLDivElement,root:Root,router:ReturnType<typeof createMemoryRouter>,activeKind='todo';
const prayer=(text:string)=>JSON.stringify({type:'prayer',category:'직장',content:text,answered:false});
function MemoForm(){const log=useRoutineStore(s=>s.logs[0]);return h(activeKind==='bible'?BibleInput:PrayerMemo,{isOpen:true,onClose:()=>{},baseLog:log,initialMemo:log?.memo,draftKey:`faith:${id}:${day}:${activeKind==='bible'?'bible':'prayer'}`,onSave:(memo,base)=>useRoutineStore.getState().updateLogMemo(id,day,memo,base)});}
const cases=[['todo','할 일 이름','수정 완료'],['diary','오늘 하루 기록','저장하기'],['memo','기도 내용','저장'],['bible','말씀 묵상','저장']] as const;
function seed(kind:string){activeKind=kind;api.row=kind==='todo'?{id,user_id:'A',title:'원래 내용',emoji:'',date:day,completed:false,created_at:day,revision:r0}:kind==='diary'?{date:day,content:'원래 내용',mood:'good',updated_at:day,revision:r0}:{id,routine_id:id,date:day,completed:true,skipped:false,memo:kind==='bible'?JSON.stringify({type:'bible',book:'빌립보서',chapter:4,verse:13,reflection:'원래 내용'}):prayer('원래 내용'),memo_revision:r0};hydrate();}
function hydrate(){if(!api.row)return;if(activeKind==='todo')useTodoStore.setState({todos:[todoFromRow(api.row)]});else if(activeKind==='diary')useDiaryStore.setState({entries:[diaryFromRow(api.row)]});else useRoutineStore.setState({logs:[routineLogFromRow(api.row)]});}
async function mount(){router=createMemoryRouter([{path:'/form/:id?',element:h(activeKind==='todo'?TodoNew:activeKind==='diary'?Diary:MemoForm)},{path:'/',element:h('p',null,'홈')},{path:'/records/conflicts',element:h(RecordConflicts)}],{initialEntries:['/',activeKind==='todo'?`/form/${id}`:'/form']});await act(async()=>root.render(h(RouterProvider,{router})));}
async function reopen(){await act(async()=>root.unmount());router.dispose();root=createRoot(host);await mount();}
async function click(label:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===label);expect(b,`${label}: ${host.textContent}`).toBeDefined();await act(async()=>b!.click());}
async function fill(label:string,value:string){const el=host.querySelector<HTMLInputElement|HTMLTextAreaElement>(`[aria-label="${label}"]`)!;expect(el).not.toBeNull();await act(async()=>{Object.getOwnPropertyDescriptor(el instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date('2026-10-28T12:00:00'));vi.clearAllMocks();vi.spyOn(window,'scrollTo').mockImplementation(()=>{});Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  localStorage.clear();clearOutbox();setOutboxOwner('A');api.owner='A';api.receipts.clear();api.lost=false;api.fail=false;useAuthStore.setState({user:{id:'A'} as User});useUIStore.setState({dataHydrated:true});
  useTodoStore.setState({todos:[]});useDiaryStore.setState({entries:[]});useRoutineStore.setState({logs:[],personalRoutines:[],faithRoutines:[]});
  api.read.mockImplementation(async()=>({data:api.row,error:null}));api.save.mockImplementation(async(_fn:string,args:Record<string,unknown>)=>{
    if(api.fail)return {error:{message:'offline'}};
    const rid=String(args.request_id),field=args.item_kind==='memo'?'memo_revision':'revision';
    if(api.receipts.has(rid))return {data:{status:'saved',current:api.row},error:null};
    if((api.row&&(args.mode==='create'||api.row[field]!==args.expected_revision))||(!api.row&&args.mode!=='create'&&args.mode!=='delete'))return {data:{status:api.row?'conflict':'deleted',current:api.row},error:null};
    const v=args.item_values as Record<string,unknown>;
    api.row=args.mode==='delete'?null:{...api.row,...(args.item_kind==='memo'?{memo:v.memo}:args.item_kind==='todo'&&args.mode==='edit'?{title:v.title,emoji:v.emoji}:v),[field]:rid};api.receipts.set(rid,JSON.stringify(args));
    if(api.lost){api.lost=false;return {error:{message:'response lost'}};}return {data:{status:'saved',current:api.row},error:null};
  });host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(async()=>{await act(async()=>root.unmount());router?.dispose();host.remove();clearOutbox();vi.useRealTimers();vi.restoreAllMocks();});

test.each(cases)('%s: 초안 복원은 원래 버전을 유지해 충돌하고 비교 저장의 응답 유실을 중복 없이 재시도한다',async(kind,label,submit)=>{
  seed(kind);await mount();await fill(label,'기기에 남긴 입력');
  api.row={...api.row,revision:r1,memo_revision:r1,title:'다른 기기 입력',content:'다른 기기 입력',memo:kind==='bible'?JSON.stringify({type:'bible',book:'빌립보서',chapter:4,verse:13,reflection:'다른 기기 입력'}):prayer('다른 기기 입력')};hydrate();
  await reopen();expect(host.textContent).toContain('초안 복원');await click('초안 복원');await click(submit);await act(async()=>flush());
  expect(api.save.mock.calls[0][1].expected_revision).toBe(r0);expect(recordSyncEntries('A')).toHaveLength(1);
  await act(async()=>router.navigate('/records/conflicts'));expect(host.textContent).toContain('다른 기기 입력');expect(host.textContent).toContain('기기에 남긴 입력');
  api.lost=true;await click('내 입력 적용');await click('확인하고 적용');await act(async()=>flush());await act(async()=>flush());
  const requests=api.save.mock.calls.map(c=>c[1]);expect(requests.at(-1).request_id).toBe(requests.at(-2).request_id);expect(api.receipts.size).toBe(1);expect(recordSyncEntries('A')).toEqual([]);
  expect(JSON.stringify(api.row)).toContain('기기에 남긴 입력');if(kind==='memo'||kind==='bible')expect(api.row?.completed).toBe(true);
});
test.each(cases)('%s: 기기 저장 실패는 입력·초안을 유지하고 재시도 때만 큐에 남긴다',async(kind,label,submit)=>{
  seed(kind);await mount();await fill(label,'보존할 입력');const drafts=Object.keys(localStorage).filter(k=>k.startsWith('onju-draft'));expect(drafts).toHaveLength(1);
  const original=Storage.prototype.setItem;const spy=vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,k,v){if(k.startsWith('onju-record-outbox:item:'))throw new Error('quota');return original.call(this,k,v);});
  await click(submit);expect(host.querySelector<HTMLInputElement>(`[aria-label="${label}"]`)?.value).toBe('보존할 입력');expect(localStorage.getItem(drafts[0])).not.toBeNull();expect(api.save).not.toHaveBeenCalled();spy.mockRestore();
  api.fail=true;await click(submit);await act(async()=>flush());expect(localStorage.getItem(drafts[0])).toBeNull();const request=api.save.mock.calls.at(-1)![1];expect(Object.keys(localStorage).some(k=>k.startsWith('onju-record-outbox:item:'))).toBe(true);
  api.fail=false;await act(async()=>flush());expect(api.save.mock.calls.at(-1)![1]).toEqual(request);expect(JSON.stringify(api.row)).toContain('보존할 입력');
});
test('다른 탭의 입력·계정 전환·재충돌·복구 보관 실패는 비교한 입력을 잃지 않는다',async()=>{
  seed('diary');enqueue({type:'upsert',table:'diary_entries',values:{date:day,content:'내 기록',mood:'good'}});await flush();await mount();await act(async()=>router.navigate('/records/conflicts'));
  await click('내 입력 적용');const storage=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});await click('확인하고 적용');storage.mockRestore();expect(recordSyncEntries('A')).toHaveLength(1);expect(api.save).not.toHaveBeenCalled();
  api.row={...api.row,revision:r1};await click('확인하고 적용');await act(async()=>flush());expect(recordSyncEntries('A')).toHaveLength(1);
  await click('내 입력 적용');await act(async()=>{enqueue({type:'update',table:'diary_entries',match:{date:day},values:{content:'다른 탭'}});await flush();});await click('확인하고 적용');expect(recordSyncEntries('A')).toHaveLength(2);
  await act(async()=>{api.owner='B';setOutboxOwner('B');useAuthStore.setState({user:{id:'B'} as User});});expect(host.textContent).not.toContain('내 기록');expect(recordSyncEntries('A')).toHaveLength(2);
});
test('삭제된 할 일은 새 ID로 복사하고 삭제 확인 응답 전에는 기존 항목을 유지한다',async()=>{
  seed('todo');const base=useTodoStore.getState().todos[0];api.row=null;enqueue(recordWrite('todo',{...base,title:'보존할 제목',revision:r1},r0));await flush();await mount();await act(async()=>router.navigate('/records/conflicts'));await click('새 할 일로 복사');await click('확인하고 적용');await act(async()=>flush());
  expect(useTodoStore.getState().todos[0].id).not.toBe(id);expect(useTodoStore.getState().todos[0].completed).toBe(false);
  const item=useTodoStore.getState().todos[0];api.fail=true;await act(async()=>useTodoStore.getState().removeTodo(item.id,item));expect(useTodoStore.getState().todos).toHaveLength(1);api.fail=false;await act(async()=>flush());expect(useTodoStore.getState().todos).toEqual([]);
});
test('메모 응답은 최신 수행 상태를 가져오되 아직 전송 중인 체크와 후속 메모 입력은 보존한다',()=>{
  seed('memo');const event=(kind:string,revision:string,current:unknown)=>window.dispatchEvent(new CustomEvent('onju-record-saved',{detail:{ownerId:'A',kind,id:`${id}:${day}`,revision,current}}));
  event('memo',r0,{...api.row,completed:false,skipped:true,memo:'서버 확정',memo_revision:r1});
  expect(useRoutineStore.getState().logs[0]).toMatchObject({completed:false,skipped:true,memo:'서버 확정'});
  useRoutineStore.setState({logs:[{...useRoutineStore.getState().logs[0],completed:true,skipped:false,checkRequestId:r0}]});
  event('memo',r1,{...api.row,completed:false,skipped:true,memo:'다시 저장한 메모',memo_revision:r1});
  expect(useRoutineStore.getState().logs[0]).toMatchObject({completed:true,checkRequestId:r0,memo:'다시 저장한 메모'});
  event('check',r0,{...api.row,completed:true,skipped:false});expect(useRoutineStore.getState().logs[0]).toMatchObject({memo:'다시 저장한 메모',memoRevision:r1});expect(useRoutineStore.getState().logs[0].checkRequestId).toBeUndefined();
});

test.each([true,false])('구버전 메모 초안은 원래 로그 존재 여부(%s)와 무관하게 목록에서 복원하고 기준 버전을 추측하지 않는다',async exists=>{
  seed('memo');if(!exists){api.row=null;useRoutineStore.setState({logs:[]});}
  writeDraft('A',`faith:${id}:${day}:prayer`,{category:'직장',content:'구버전에서 남긴 기도'});
  router=createMemoryRouter([{path:'/notes',element:h(FaithNotes)}],{initialEntries:['/notes']});await act(async()=>root.render(h(RouterProvider,{router})));
  expect(host.textContent).not.toContain('초안을 읽지 못했어요');expect(host.textContent).toContain('남겨둔 메모 초안 1개');
  await act(async()=>host.querySelector('summary')!.click());await click(`${day} · 기도 초안 이어 쓰기`);await click('초안 복원');await click('저장');await act(async()=>flush());
  expect(api.save).toHaveBeenCalledWith('save_record',expect.objectContaining({expected_revision:null,mode:'edit',item_values:expect.objectContaining({memo:expect.stringContaining('구버전에서 남긴 기도')})}));expect(recordSyncEntries('A')).toHaveLength(1);
});
