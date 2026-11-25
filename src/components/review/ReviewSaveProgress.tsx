import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { supabase, supabaseForSession } from '../../lib/supabase';
import { readReviewBase, sendReviewStep } from '../../api/reviews';
import { removeDraft } from '../../lib/localDrafts';
import { flush, pendingCount } from '../../lib/sync/outbox';
import { clearReviewSubmission, readReviewSubmission, resolveReviewStep, runReviewSubmission, withReviewLock, type ReviewSubmission } from '../../lib/reviewSubmission';
import { useReviewSubmission } from '../../hooks/useReviewSubmission';
import Button from '../ui/Button';
import ConfirmModal from '../ui/ConfirmModal';
import { CheckCircle2, ChevronLeft } from '../../icons';

export default function ReviewSaveProgress({initial,autoStart=false}:{initial:ReviewSubmission;autoStart?:boolean}) {
  const {journal:stored,error:readError}=useReviewSubmission(initial.owner);
  const journal=stored??initial;
  const [busy,setBusy]=useState(false), [error,setError]=useState('');
  const [choice,setChoice]=useState<{id:string;replace:boolean}|null>(null);
  const mounted=useRef(false), started=useRef(false), active=useRef(false);
  const navigate=useNavigate(), queryClient=useQueryClient();
  const current=()=>mounted.current && useAuthStore.getState().user?.id===initial.owner;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const run=async()=>{
    if(active.current || !current()) return;
    active.current=true;setBusy(true);setError('');
    try {
      await withReviewLock(initial.owner,async()=>{
        const latest=readReviewSubmission(initial.owner);
        if(!current() || !latest || latest.id!==initial.id) throw new Error('저장 상태가 바뀌었어요. 다시 불러와주세요.');
        const {data,error:authError}=await supabase.auth.getSession();
        if(authError || !data.session || data.session.user.id!==initial.owner || !current()) throw new Error('원래 계정으로 로그인한 뒤 다시 시도해주세요.');
        // Earlier offline writes must finish before sending the frozen review changes.
        await flush();
        if(!current()) return;
        if(pendingCount(initial.owner)>0) throw new Error('먼저 저장 대기 중인 기록을 동기화해주세요. 리뷰 입력과 완료한 항목은 보관되어 있어요.');
        const client=supabaseForSession(data.session.access_token);
        const result=await runReviewSubmission(latest,{current,
          readBase:()=>readReviewBase(latest.week,latest.year,latest.owner,client),send:s=>sendReviewStep(s,client),
          onChange:()=>{},onSaved:step=>{
            window.dispatchEvent(new Event('onju-review-step-saved'));
            if(step.kind==='share') void queryClient.invalidateQueries({queryKey:['group-shares']});
          },
        });
        if(!current()) return;
        if(result.steps.every(s=>s.status==='done'||s.status==='skipped')) {
          // Keep the all-done journal if cleanup fails, so no effect is repeated.
          removeDraft(result.owner,result.draftDocument);
          clearReviewSubmission(result);
          void queryClient.invalidateQueries({queryKey:['reviews']});
          void queryClient.invalidateQueries({queryKey:['review',result.owner]});
          void queryClient.invalidateQueries({queryKey:['group-shares']});
          window.dispatchEvent(new Event('onju-review-step-saved'));
          navigate(`/review/result/${result.year}-${result.week}`,{replace:true});
        }
      });
    } catch(e) { if(current()) setError(e instanceof Error?e.message:'저장 상태를 보관하지 못했어요. 이 기기에서 다시 시도해주세요.'); }
    finally {active.current=false;if(current()) setBusy(false);}
  };
  // New submissions start once; revisits always wait for an explicit retry.
  useEffect(()=>{if(autoStart && !started.current){started.current=true;void run();}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[autoStart]);
  const decide=async()=>{
    if(!choice || busy || !current()) return;
    setBusy(true);setError('');
    try {await withReviewLock(initial.owner,async()=>{
      if(!current()) return;
      // Compare the exact screen the user confirmed, including its nonce.
      resolveReviewStep(journal,choice.id,choice.replace?'replace':'skip');
      setChoice(null);
    });} catch(e){if(current())setError(e instanceof Error?e.message:'다시 확인해주세요.');}
    finally {if(current())setBusy(false);}
  };
  const recheck=async(id:string)=>{
    if(busy || !current()) return;
    setBusy(true);setError('');
    try {
      await withReviewLock(initial.owner,async()=>{if(current())resolveReviewStep(journal,id,'retry');});
      await run();
    } catch(e){if(current())setError(e instanceof Error?e.message:'다시 확인해주세요.');}
    finally {if(current())setBusy(false);}
  };
  const done=journal.steps.filter(s=>s.status==='done').length;
  const resolved=journal.steps.filter(s=>s.status==='done'||s.status==='skipped').length;
  const conflict=journal.steps.find(s=>s.status==='conflict');
  const memo=journal.steps.find(s=>s.kind==='review')?.payload.values as Record<string,unknown>;
  return <main className="review-paper min-h-dvh px-5 pt-5 pb-28 space-y-5">
    <button onClick={()=>navigate('/')} className="min-h-11 flex items-center gap-1 text-label-alt"><ChevronLeft size={18}/>홈으로</button>
    <header><p className="text-caption1 text-label-alt">{journal.weekStart} ~ {journal.weekEnd}</p>
      <h1 className="text-title3 font-bold mt-2">주간 리뷰 저장 이어가기</h1>
      <p className="text-body2 text-label-alt mt-3 leading-relaxed">이미 저장된 내용은 유지하고 남은 항목만 이어서 저장해요. 이 화면을 닫아도 같은 계정으로 다시 열 수 있어요.</p>
    </header>
    <section className="bg-primary-soft rounded-2xl p-4" aria-live="polite">
      <p className="font-bold text-primary">{done}개 저장 완료 · {journal.steps.length-resolved}개 남음</p>
      <p className="text-caption1 text-label-alt mt-2">실천 조정은 {journal.date}부터 적용해요. 재시도해도 적용일과 과거 기록은 유지돼요.</p>
      <div className="w-full h-2 mt-3 rounded-full bg-primary/10 overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={journal.steps.length} aria-valuenow={resolved} aria-label="리뷰 저장 진행">
        <div className="h-full bg-primary rounded-full" style={{width:`${resolved/journal.steps.length*100}%`}} />
      </div>
    </section>
    <ol className="space-y-3">{journal.steps.map(step=><li key={step.id} className="bg-surface rounded-xl border border-line p-4">
      <div className="flex gap-2 items-start">{step.status==='done'?<CheckCircle2 size={18} className="shrink-0 mt-0.5 text-positive"/>:<span aria-hidden="true" className="w-[18px] h-[18px] rounded-full border border-line shrink-0 mt-0.5"/>}
        <div className="min-w-0"><p className="text-body2 font-semibold break-words">{step.label}</p>
          <p className="text-caption1 mt-1 text-label-alt">{{done:'저장 완료',pending:'저장 대기',conflict:'확인 필요',skipped:'최신 상태 유지 · 조정 제외'}[step.status]}</p>
        </div></div>
      {step.error && <p role="alert" className="mt-3 text-caption1 text-negative break-words">저장 결과를 확인하지 못했어요. 연결 후 남은 항목을 다시 저장해주세요.</p>}
      {step.status==='conflict' && <div className="text-caption1 text-label-alt mt-3 space-y-3">
        <p>{step.kind==='share'?'모임 가입·수칙 동의 또는 기존 공유 내용을 확인해주세요.':step.current?'다른 변경이 있어 자동으로 덮어쓰지 않았어요.':'항목이 없어 자동으로 다시 만들지 않았어요.'}</p>
        {step.current && <p className="break-words">현재 서버 내용: {String(step.current.title??step.current.comment??'기존 결산·연결 정보 변경')}</p>}
        <p>이번 입력: {String((step.payload.item_values as Record<string,unknown>)?.title??(step.payload.values as Record<string,unknown>)?.comment??step.label)}</p>
        <Button fullWidth variant="outlined" disabled={busy} onClick={()=>void recheck(step.id)}>현재 상태 다시 확인</Button>
        <Button fullWidth variant="assistive" disabled={busy} onClick={()=>setChoice({id:step.id,replace:false})}>{step.kind==='share'?'이 모임 공유 제외':'최신 상태 유지하고 이 항목 제외'}</Button>
        {step.kind==='review' && <Button fullWidth variant="outlined" disabled={busy} onClick={()=>setChoice({id:step.id,replace:true})}>이번 회고 본문으로 저장</Button>}
        {step.kind==='practice' && <p>제외한 조정은 홈에서 최신 내용을 확인한 뒤 다시 수정할 수 있어요.</p>}
      </div>}
    </li>)}</ol>
    <details className="rounded-xl border border-line p-4 text-body2"><summary className="cursor-pointer min-h-8">보관된 회고 내용 보기</summary><p className="whitespace-pre-wrap break-words mt-3">{String(memo?.comment??'')}</p><p className="whitespace-pre-wrap break-words mt-3">다음 주 집중: {String(memo?.intention??'')}</p></details>
    {(error||readError) && <p role="alert" className="text-body2 text-negative">{readError??error}</p>}
    <Button fullWidth disabled={busy||!!conflict||!!readError} onClick={()=>void run()}>{busy?'저장 상태 확인 중…':resolved===journal.steps.length?'저장 완료 확인':'남은 항목 저장'}</Button>
    {conflict && <p className="text-caption1 text-label-alt">확인이 필요한 항목을 먼저 선택해주세요. 이미 저장된 항목은 다시 보내지 않아요.</p>}
    <ConfirmModal isOpen={!!choice} title={choice?.replace?'이번 회고 본문으로 저장할까요?':'이 항목의 조정을 제외할까요?'} danger={false}
      message={choice?.replace?'화면에 표시한 서버 회고를 이번 입력으로 바꿔요. 그사이 다시 바뀌면 확인을 요청해요. 실천·과거 기록은 다시 변경하지 않아요.':'이 항목은 현재 서버 상태를 유지해요. 이미 저장한 다른 항목은 유지하며 남은 저장을 계속할 수 있어요.'}
      confirmLabel={choice?.replace?'본문 저장 준비':'이 항목 제외'} confirmDisabled={busy} onCancel={()=>setChoice(null)} onConfirm={()=>void decide()} />
  </main>;
}
