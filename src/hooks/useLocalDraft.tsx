import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { readDraft, removeDraft, writeDraft } from '../lib/localDrafts';
import { toast } from '../store/toastStore';

/** Mount once per owner/document. A pending draft is never replaced before a choice. */
export function useLocalDraft<T>({ document, values, validate, restore, canDiscard = () => true }: {
  document?: string; values: T; validate: (value: unknown) => value is T; restore: (value: T) => void;
  canDiscard?: (value: T) => boolean;
}) {
  const currentOwner = useAuthStore(s => s.user?.id);
  const [owner] = useState(currentOwner);
  const initial = useRef(JSON.stringify(values));
  const [loaded] = useState(() => {
    try { return { draft: owner && document ? readDraft(owner, document, validate) : null, error: false }; }
    catch { return { draft: null, error: true }; }
  });
  const [pending, setPending] = useState(loaded.draft);
  const [readError, setReadError] = useState(loaded.error);
  const [error, setError] = useState(loaded.error);
  const [stored, setStored] = useState(false);
  const serialized = JSON.stringify(values);
  const sameOwner = owner === currentOwner && !!owner;
  // 외부 저장소의 실제 성공/실패를 접근 가능한 안내에 반영한다.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!owner || !document || !sameOwner || pending || readError) return;
    try {
      if (serialized === initial.current) { removeDraft(owner, document); setStored(false); }
      else { writeDraft(owner, document, JSON.parse(serialized)); setStored(true); }
      setError(false);
    } catch { setError(true); setStored(false); }
  }, [document, initial, readError, owner, pending, sameOwner, serialized]);

  /* eslint-enable react-hooks/set-state-in-effect */
  const clear = (next: T = values) => {
    initial.current = JSON.stringify(next);
    if (!owner || !document) return;
    try { removeDraft(owner, document); setPending(null); setStored(false); }
    catch { toast.error('기기의 초안을 지우지 못했어요. 다음에 열 때 남아 있을 수 있어요.'); }
  };
  const message = stored && !error ? '작성 내용은 이 기기에 초안으로 남아요. 다시 열어 이어 쓸 수 있어요.' : undefined;
  return { clear, awaitingChoice: !!pending || readError, leaveMessage: message,
    banner: !document || !sameOwner ? null : <div className={`mb-3 rounded-xl p-3 text-caption1 text-label-alt ${error ? 'border border-negative bg-accent-soft' : pending ? 'border border-line bg-surface' : 'bg-transparent'}`} aria-live="polite">
      {error ? <div role="alert"><p>초안을 읽거나 저장하지 못했어요. 이 화면을 닫기 전에 내용을 복사하거나 저장해주세요.</p>
        {readError && <button type="button" className="min-h-11 font-bold text-primary" onClick={() => {
          try { removeDraft(owner!, document); setReadError(false); setError(false); } catch { setError(true); }
        }}>손상된 초안 지우고 다시 작성</button>}</div> : pending ? <>
        <p className="font-bold text-label-strong">이 기기에 남겨둔 초안이 있어요</p>
        <p className="mt-1">{new Date(pending.savedAt).toLocaleString('ko-KR')} · {canDiscard(pending.values) ? '복원하거나 버린 뒤 이어서 작성해주세요.' : '초안을 복원해 이어서 확인해주세요.'}</p>
        <div className="mt-2 flex gap-2">
          <button type="button" className="min-h-11 px-3 rounded-lg bg-primary text-white font-bold" onClick={() => { restore(pending.values); setPending(null); }}>초안 복원</button>
          {canDiscard(pending.values) && <button type="button" className="min-h-11 px-3 rounded-lg text-label-alt" onClick={() => {
            try { removeDraft(owner!, document); setPending(null); } catch { setError(true); }
          }}>초안 버리기</button>}
        </div>
        {!canDiscard(pending.values) && <p>이미 전송한 요청이 있어요. 초안을 복원해 결과를 먼저 확인해주세요.</p>}
      </> : <p>{stored ? '이 기기에 초안 저장됨' : '작성 내용은 이 기기에 임시 보관돼요'}</p>}
    </div>,
  };
}
