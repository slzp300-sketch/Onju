import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useTodoStore } from '../store/todoStore';
import { useDiaryStore } from '../store/diaryStore';
import { useRoutineStore } from '../store/routineStore';
import { recordSyncEntries, resolveRecordEntries, isRecordDeletion, type WriteOp } from '../lib/sync/outbox';
import { supabase, supabaseForSession } from '../lib/supabase';
import { todoFromRow, diaryFromRow, routineLogFromRow } from '../data/mappers';
import { recordWrite, recordToRow, recordKey, type RecordItem, type RecordKind } from '../data/recordWrites';
import { parseFaithMemo } from '../utils/faithMemo';
import { newId } from '../utils/id';
import Button from '../components/ui/Button';
import OverlayDialog from '../components/ui/OverlayDialog';
import { toast } from '../store/toastStore';

const labels={todo:'할 일',diary:'일기',memo:'메모'};
const fromRow=(kind:RecordKind,row:Record<string,unknown>):RecordItem=>kind==='todo'?todoFromRow(row):kind==='diary'?diaryFromRow(row):routineLogFromRow(row);
const revision=(item:RecordItem|null)=>item?('routineId' in item?item.memoRevision:item.revision)??null:null;
function subscribe(change:()=>void){window.addEventListener('onju-outbox-changed',change);return ()=>window.removeEventListener('onju-outbox-changed',change);}
function Content({item,label}:{item:RecordItem;label:string}) {
  const memo='routineId' in item?parseFaithMemo(item.memo):null;
  return <section aria-label={label} className="rounded-xl border border-line bg-surface p-4 space-y-2 break-words">
    <h2 className="font-bold text-primary">{label}</h2><p className="text-caption1 text-label-alt">{item.date}</p>
    {'title' in item?<><p className="font-bold">{item.emoji} {item.title}</p><p>{item.completed?'완료':'미완료'}</p></>:'content' in item?<><p>기분: {({great:'최고',good:'좋음',neutral:'보통',down:'우울',bad:'힘듦'})[item.mood??'neutral']}{item.mood===null?' (미선택)':''}</p><p className="whitespace-pre-wrap">{item.content}</p></>:<>
      <p className="whitespace-pre-wrap">{memo?.type==='prayer'?`${memo.category} · ${memo.answered?'응답받은 기도':'기도 중'}\n${memo.content}`:memo?.type==='bible'?`${memo.book} ${memo.chapter}:${memo.verse}\n${memo.reflection}`:item.memo||'메모 없음'}</p>
      <p className="text-caption1 text-label-alt">수행 상태: {item.completed?'완료':item.skipped?'쉬어감':'미완료'}</p>
    </>}
  </section>;
}
export default function RecordConflicts(){const owner=useAuthStore(s=>s.user?.id??'');return <OwnerConflicts key={owner} owner={owner}/>;}
function OwnerConflicts({owner}:{owner:string}) {
  const navigate=useNavigate();const todos=useTodoStore(s=>s.todos),diary=useDiaryStore(s=>s.entries),logs=useRoutineStore(s=>s.logs);
  const snapshot=useCallback(()=>JSON.stringify(recordSyncEntries(owner)),[owner]);
  const entries=JSON.parse(useSyncExternalStore(subscribe,snapshot)) as ReturnType<typeof recordSyncEntries>;
  const [selected,setSelected]=useState<string>();const key=entries.some(e=>e.key===selected)?selected:entries[0]?.key;
  const group=entries.filter(e=>e.key===key),signature=JSON.stringify(group),ref=group[0],kind=ref?.kind,id=ref?.itemId;
  const [remote,setRemote]=useState<{signature:string;item:RecordItem|null}>(),[error,setError]=useState(''),[reload,setReload]=useState(0);
  const [confirmation,setConfirmation]=useState<{action:'mine'|'server';signature:string;impact:string;reload:number}>();
  useEffect(()=>{if(!kind||!id)return;let active=true;
    void(async()=>{try{
      const {data,error:sessionError}=await supabase.auth.getSession();
      if(sessionError||!data.session||data.session.user.id!==owner||!navigator.onLine)throw new Error('연결 확인');
      let query=supabaseForSession(data.session.access_token).from(kind==='todo'?'todos':kind==='diary'?'diary_entries':'routine_logs').select('*').eq('user_id',owner);
      if(kind==='todo')query=query.eq('id',id);else if(kind==='diary')query=query.eq('date',id);
      else if(id.startsWith('legacy-id:'))query=query.eq('id',id.slice(10));else query=query.eq('routine_id',id.split(':')[0]).eq('date',id.split(':')[1]);
      const result=await query.maybeSingle();if(result.error)throw result.error;
      if(active&&useAuthStore.getState().user?.id===owner){setRemote({signature,item:result.data?fromRow(kind,result.data):null});setError('');}
    }catch{if(active&&useAuthStore.getState().user?.id===owner){setRemote(undefined);setError('서버 내용을 확인하지 못했어요. 입력은 보관 중이에요. 연결 후 다시 불러와주세요.');}}})();return ()=>{active=false;};
  },[owner,kind,id,signature,reload]);
  const ready=remote?.signature===signature&&!error,current=ready?remote.item:null;
  const local=kind==='todo'?todos.find(t=>t.id===id):kind==='diary'?diary.find(e=>e.date===id):logs.find(l=>recordKey(l)===id||`legacy-id:${l.id}`===id);
  const row=group.reduce((v,e)=>{
    const values=e.op.type==='rpc'?e.op.args.item_values as Record<string,unknown>:'values'in e.op?e.op.values:{};
    if(kind==='todo'&&e.op.type==='rpc'&&e.op.args.mode==='edit')return {...v,title:values.title,emoji:values.emoji};
    if(kind==='todo'&&e.op.type==='rpc'&&e.op.args.mode==='complete')return {...v,completed:values.completed,completed_at:values.completed_at};
    return {...v,...values};
  },current?recordToRow(current):local?recordToRow(local):{});
  const mine=kind&&id?fromRow(kind,{...row,...(kind==='todo'?{id}:kind==='diary'?{date:id}:id.startsWith('legacy-id:')?{}:{routine_id:id.split(':')[0],date:id.split(':')[1]})}):null;
  const deleting=group.some(e=>isRecordDeletion(e.op));
  const edits=group.some(e=>e.op.type!=='rpc'||e.op.args.mode!=='complete'),checks=group.some(e=>e.op.type!=='rpc'||e.op.args.mode==='complete'||e.op.args.mode==='resolve');
  const valid=!!mine?.date&&('title'in mine?!!mine.title?.trim(): 'content'in mine?typeof mine.content==='string':!!mine.routineId);
  const impact=JSON.stringify({current,mine,deleting,valid});const confirmed=ready&&confirmation?.signature===signature&&confirmation.impact===impact&&confirmation.reload===reload;
  const choose=(action:'mine'|'server')=>setConfirmation({action,signature,impact,reload});
  const apply=()=>{if(!confirmed||!kind||!id||!key||!mine||useAuthStore.getState().user?.id!==owner)return;
    try{
      let next=current;let op:WriteOp={type:'record-accept',kind,itemId:id,current:current?{...recordToRow(current),revision:revision(current),memo_revision:revision(current),user_id:owner}:null};
      if(confirmation.action==='mine'){
        if(deleting&&kind!=='memo'){if(!current)return;op=recordWrite(kind,current,revision(current),'delete');}
        else {
          if(!valid)return;
          if(kind==='todo'&&'title'in mine){
            const server=current&&'title'in current?current:null;
            next={...mine,...server,...(edits?{title:mine.title,emoji:mine.emoji}:{}),...(checks&&server?{completed:mine.completed,completedAt:mine.completedAt}:{}),id:server?.id??newId(),revision:newId(),...(!server?{completed:false,completedAt:undefined,createdAt:new Date().toISOString()}:{} )};
          }else if('content'in mine)next={...mine,revision:newId()};
          else if('routineId'in mine)next={...mine,...current,memo:mine.memo,memoRevision:newId()};
          if(!next)return;
          op=recordWrite(kind,next,revision(current),!current?'create':kind==='todo'&&checks?(edits?'resolve':'complete'):'edit');
        }
      }
      resolveRecordEntries(owner,signature,key,op);
      if(kind==='todo')useTodoStore.setState(s=>({todos:[...s.todos.filter(i=>i.id!==id),...(next&&'title'in next?[next]:[])]}));
      else if(kind==='diary')useDiaryStore.setState(s=>({entries:[...s.entries.filter(i=>i.date!==id),...(next&&'content'in next?[next]:[])]}));
      else useRoutineStore.setState(s=>{
        const local=s.logs.find(i=>recordKey(i)===id||`legacy-id:${i.id}`===id);
        const pendingCheck=local?.checkRequestId?{completed:local.completed,skipped:local.skipped,completedAt:local.completedAt,checkRequestId:local.checkRequestId}:{};
        const resolved=next&&'routineId'in next?{...next,...(!current?{completed:false,skipped:false,completedAt:undefined}:{}),...pendingCheck}:local?.checkRequestId?{...local,memo:undefined,memoRevision:undefined}:null;
        return {logs:[...s.logs.filter(i=>recordKey(i)!==id&&`legacy-id:${i.id}`!==id),...(resolved?[resolved]:[])]};
      });
      setConfirmation(undefined);toast.success('확인한 요청을 기기에 보관했어요.');
    }catch{toast.error('보관된 입력이 바뀌었거나 복구 요청을 저장하지 못했어요. 입력을 남겨뒀으니 다시 확인해주세요.');}
  };
  return <div className="records-paper min-h-full p-4 pb-8 space-y-4">
    <button className="min-h-11 font-bold text-primary" onClick={()=>navigate('/')}>홈으로 돌아가기</button><h1 className="text-heading2 font-bold">할 일·일기·메모 충돌 확인</h1>
    {!ref?<p>확인할 충돌이 없어요. 저장 대기 변경은 연결되면 전송해요.</p>:<>
      <p className="text-body2 text-label-alt">다른 기기의 변경을 비교한 뒤 선택해주세요. 이 기록의 입력은 기기에 남겨두고 다른 기록은 계속 저장해요.</p>
      <select aria-label="충돌 기록 선택" className="w-full min-h-11 rounded-xl border border-line bg-surface px-3" value={key} onChange={e=>{setSelected(e.target.value);setConfirmation(undefined);}}>
        {[...new Set(entries.map(e=>e.key))].map(k=>{const e=entries.find(i=>i.key===k)!;return <option key={k} value={k}>{labels[e.kind]} · {e.kind==='todo'?todos.find(t=>t.id===e.itemId)?.title??'남겨둔 할 일':e.itemId.split(':').at(-1)}</option>;})}
      </select>
      <Button variant="assistive" onClick={()=>{setRemote(undefined);setError('');setReload(n=>n+1);}}>서버 내용 다시 불러오기</Button>
      {error&&<p role="alert" className="text-negative">{error}</p>}{!ready&&!error&&<p role="status">서버 내용을 확인하고 있어요…</p>}
      {group.some(e=>e.conflict?.reason)&&<p role="alert">저장 조건 확인: {group.find(e=>e.conflict?.reason)?.conflict?.reason}</p>}
      {ready&&(current?<Content label="서버에 저장된 내용" item={current}/>:<p>서버에 이 기록이 없어요. 복원하면 {kind==='todo'?'새 할 일로 복사하고 완료 상태는 미완료로 시작해요.':'표시된 날짜에 새 기록을 만들어요.'}</p>)}
      {mine&&valid&&<Content label="이 기기에 남긴 입력" item={mine}/>}
      <p className="text-caption1 text-label-alt">{kind==='memo'?'메모만 바꾸며 서버의 수행 체크·쉬어가기·완료 시각은 유지해요. 구버전 수행 체크·삭제 요청은 다시 실행하지 않아요.':kind==='todo'?'편집한 이름·아이콘 또는 요청한 완료 상태만 적용해요. 날짜와 다른 기록은 유지해요.':'표시된 날짜의 기분과 내용만 적용해요. 다른 날의 기록은 유지해요.'} {deleting&&kind!=='memo'?'삭제는 서버가 확인할 때까지 기록을 유지해요.':''}</p>
      <Button className="w-full" disabled={!ready||(!valid)||(deleting&&kind!=='memo'&&!current)} onClick={()=>choose('mine')}>{deleting&&kind!=='memo'?'확인한 버전으로 삭제':current?'내 입력 적용':kind==='todo'?'새 할 일로 복사':'이 날짜에 기록 복원'}</Button>
      <Button className="w-full" variant="assistive" disabled={!ready} onClick={()=>choose('server')}>서버 내용 사용</Button>
    </>}
    <OverlayDialog isOpen={!!confirmation} onClose={()=>setConfirmation(undefined)} labelledBy="record-confirm-title" className="p-4">
      <h2 id="record-confirm-title" className="font-bold text-headline1">{confirmation?.action==='server'?'기기에 남긴 요청을 정리할까요?':'비교한 내용으로 적용할까요?'}</h2>
      <p className="mt-3 text-body2">{confirmation?.action==='server'?'이 기록의 대기 입력을 버리고 확인한 서버 내용을 사용해요.':'위에서 비교한 내용으로 요청해요. 서버가 다시 바뀌면 멈추고 다시 확인해요.'} 다른 날짜의 기록과 습관은 그대로 남아요.</p>
      {!confirmed&&<p role="alert">비교 내용이 바뀌었어요. 취소 후 다시 확인해주세요.</p>}
      <div className="mt-4 flex gap-2"><Button size="md" className="min-w-0 flex-1 px-1 whitespace-nowrap" variant="assistive" onClick={()=>setConfirmation(undefined)}>취소</Button><Button size="md" className="min-w-0 flex-1 px-1 whitespace-nowrap" disabled={!confirmed} onClick={apply}>확인하고 적용</Button></div>
    </OverlayDialog>
  </div>;
}
