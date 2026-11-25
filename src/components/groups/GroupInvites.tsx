import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { changeGroupInvite, listGroupInvites } from '../../data/groupInvites';
import { readDraft, writeDraft, removeDraft } from '../../lib/localDrafts';
import { useAuthStore } from '../../store/authStore';
import { useLocalNow } from '../../hooks/useLocalNow';
import { effectiveStatus } from '../../utils/groupMeta';
import { newId } from '../../utils/id';
import type { SmallGroup } from '../../types';
import Button from '../ui/Button';
import ConfirmModal from '../ui/ConfirmModal';

interface Pending { action: 'issue' | 'revoke'; id: string }
const isPending = (v: unknown): v is Pending => !!v && typeof v === 'object' && typeof (v as Pending).id === 'string' && ['issue','revoke'].includes((v as Pending).action);
export default function GroupInvites({ group }: { group: SmallGroup }) {
  const owner = useAuthStore(s => s.user?.id)!;
  const document = `group:invites:${group.id}`;
  const [loaded] = useState(() => { try { return { pending: readDraft(owner, document, isPending)?.values, error:false }; } catch { return {pending:undefined,error:true}; } });
  const [pending, setPending] = useState(loaded.pending), [readError, setReadError] = useState(loaded.error);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [revoke, setRevoke] = useState<string>();
  const mounted = useRef(true), working = useRef(false);
  useEffect(() => { mounted.current=true; return () => { mounted.current=false; }; }, []);
  const now = useLocalNow();
  const current = () => mounted.current && useAuthStore.getState().user?.id === owner;
  const list = useQuery({queryKey:['group-invites',owner,group.id],queryFn:()=>listGroupInvites(owner,group.id)});
  const locked = busy || !!pending || readError || list.isPending || list.isError;
  const canIssue = effectiveStatus(group) === 'recruiting' && group.currentMemberCount < group.maxMembers;
  const run = async (operation?: Pending, checkOnly=false) => {
    if (working.current) return;
    if (!navigator.onLine) { setMessage('인터넷에 연결한 뒤 초대 상태를 확인해주세요.'); return; }
    working.current=true;setBusy(true);setMessage('');
    try {
      if (readError) { const stored=readDraft(owner,document,isPending);setPending(stored?.values);setReadError(false);return; }
      const request=operation ?? pending;
      let failure:unknown;
      if(request && !checkOnly) {
        writeDraft(owner,document,request);setPending(request);
        try{await changeGroupInvite(owner,group.id,request.action,request.id);}catch(e){failure=e;}
      }
      const result=await list.refetch();if(!current())return;
      if(result.error || !result.data)throw new Error('read');
      if(request){
        const row=result.data.find(inv=>inv.id===request.id);
        const confirmed=request.action==='issue' ? !!row : !!row?.revoked_at;
        if(confirmed || (failure as {code?:string})?.code){
          removeDraft(owner,document);setPending(undefined);
          setMessage(confirmed ? request.action==='issue'?'초대 코드를 확인했어요. 초대할 한 사람에게 전달해주세요.':'초대를 폐기했어요. 이미 가입한 멤버는 유지돼요.'
            : '초대를 변경하지 못했어요. 모집 상태·정원·이용 수칙을 확인해주세요.');
        }else setMessage('변경 결과가 아직 확인되지 않았어요. 같은 요청으로 다시 확인할 수 있어요.');
      }else setMessage('현재 초대 상태를 확인했어요.');
    }catch{if(current())setMessage('초대 상태를 확인하지 못했어요. 연결과 기기 저장 공간을 확인한 뒤 다시 시도해주세요.');}
    finally{working.current=false;if(current())setBusy(false);}
  };
  return <section className="mx-4 rounded-2xl border border-line bg-surface p-4" aria-label="비공개 소모임 초대 관리">
    <h2 className="text-headline1 font-bold">멤버 초대</h2>
    <p className="my-2 text-caption1 text-label-alt">한 명이 사용할 수 있는 코드예요. 발급 후 7일 동안 유효하며, 코드를 받은 사람이 소모임의 ‘초대 코드로 참여’에서 입력하면 돼요. 코드를 가진 사람이 가입할 수 있으니 초대할 사람에게만 전달해주세요.</p>
    {message && <p role="status" className="my-3 text-body2">{message}</p>}
    {(pending || readError) && <div role="alert" className="my-3 rounded-xl bg-fill p-3 text-body2">
      <p>확인이 필요한 초대 요청이 있어요. 자동 재전송하지 않아요.</p>
      <Button variant="ghost" disabled={busy} onClick={()=>void run(undefined,true)}>초대 상태 다시 확인</Button>
      {pending && !readError && <Button fullWidth disabled={busy} onClick={()=>void run()}>같은 초대 요청 재시도</Button>}
      {readError && <><p className="mt-2 text-caption1">기기의 요청 표시를 읽지 못했어요. 서버 초대 목록을 확인한 뒤 이 기기의 요청 표시만 정리할 수 있어요. 발급된 초대는 유지돼요.</p>
        <Button variant="ghost" disabled={busy} onClick={async()=>{
          if(working.current)return;working.current=true;setBusy(true);
          try{const result=await list.refetch();if(!current())return;if(result.error||!result.data)throw new Error('read');
            removeDraft(owner,document);setReadError(false);setPending(undefined);setMessage('현재 초대 목록을 확인하고 기기의 요청 표시를 정리했어요.');
          }catch{if(current())setMessage('현재 초대 목록을 확인하지 못해 요청 표시를 유지했어요. 다시 시도해주세요.');}
          finally{working.current=false;if(current())setBusy(false);}
        }}>기기 요청 표시 정리</Button></>}
    </div>}
    {list.isError && <p role="alert" className="my-3 text-body2">초대를 불러오지 못했어요.<Button variant="ghost" disabled={busy} onClick={()=>void run(undefined,true)}>다시 불러오기</Button></p>}
    {list.isPending && <p className="my-3 text-body2">초대를 불러오고 있어요…</p>}
    <Button fullWidth disabled={locked || !canIssue} onClick={()=>void run({action:'issue',id:newId()})}>1인용 초대 코드 만들기</Button>
    {!canIssue && <p className="mt-2 text-caption1 text-label-alt">모집 중이고 정원이 남아 있을 때 초대할 수 있어요.</p>}
    {list.data?.map((invite,index)=>{
      const unused=!invite.revoked_at&&!invite.redeemed_at&&Date.parse(invite.expires_at)>now.getTime();
      const label=invite.revoked_at?'폐기됨':invite.redeemed_at?'사용 완료':!unused?'기간 만료':canIssue?'사용 가능':effectiveStatus(group)==='recruiting'?'대기 · 정원 마감':'사용 불가 · 모집 종료';
      return <article key={invite.id} className="mt-4 border-t border-line pt-3">
        <p className="text-body2 font-bold">초대 {list.data.length-index} · {label}</p>
        <p className="my-1 text-caption1 text-label-alt">{new Date(invite.expires_at).toLocaleString('ko-KR')}까지</p>
        {unused && <><input aria-label={`초대 ${list.data.length-index} 코드`} readOnly value={invite.code} className="input-base w-full min-w-0 font-mono text-caption1" />
          <div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outlined" disabled={locked || !canIssue} onClick={async()=>{try{await navigator.clipboard.writeText(invite.code);if(current())setMessage('초대 코드를 복사했어요.');}catch{if(current())setMessage('코드를 길게 눌러 직접 복사해주세요.');}}}>코드 복사</Button>
          <Button size="sm" variant="ghost" disabled={locked} onClick={()=>setRevoke(invite.id)}>초대 폐기</Button></div></>}
      </article>;
    })}
    <ConfirmModal isOpen={!!revoke} title="이 초대를 폐기할까요?" message="이 코드로는 새로 가입할 수 없어요. 이미 가입한 멤버는 그대로 남아요." confirmLabel="폐기하기" onCancel={()=>setRevoke(undefined)} onConfirm={()=>{if(revoke&&!locked)void run({action:'revoke',id:revoke});setRevoke(undefined);}} />
  </section>;
}
