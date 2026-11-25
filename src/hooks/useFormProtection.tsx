import { useContext, useEffect, useRef, useState } from 'react';
import { UNSAFE_DataRouterContext } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import FormRouteGuard from '../components/FormRouteGuard';
import ConfirmModal from '../components/ui/ConfirmModal';
import { toast } from '../store/toastStore';

/** 폼의 첫 값과 비교한다. 저장 및 계정 전환은 이탈 확인에 막히지 않는다. */
export function useFormProtection(values: unknown, leaveMessage?: string) {
  const [initial, setInitial] = useState(() => JSON.stringify(values));
  const [ownerId] = useState(() => useAuthStore.getState().user?.id);
  const [pending, setPending] = useState<(() => void) | null>(null);
  const bypass = useRef(false);
  const submitted = useRef(false);
  const router = useContext(UNSAFE_DataRouterContext);
  const serialized = JSON.stringify(values);
  const dirty = serialized !== initial;
  useEffect(() => { bypass.current = false; }, [serialized]);
  const sameOwner = () => useAuthStore.getState().user?.id === ownerId;
  const shouldBlock = () => dirty && sameOwner() && !bypass.current && !submitted.current;

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (event: BeforeUnloadEvent) => {
      if (useAuthStore.getState().user?.id !== ownerId || submitted.current) return;
      event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty, ownerId]);

  return {
    // 저장 성공 뒤에만 이탈 확인을 해제한다. 연속 클릭과 이전 계정 저장도 차단한다.
    save(action: () => void) {
      if (!sameOwner() || submitted.current) return false;
      try { action(); submitted.current = true; return true; }
      catch { toast.error('저장하지 못했어요. 작성 내용은 그대로예요. 다시 시도해주세요.'); return false; }
    },
    reset(next: unknown) { setInitial(JSON.stringify(next)); submitted.current = false; },
    requestLeave(action: () => void) { if (shouldBlock()) setPending(() => action); else action(); },
    guard: <>
      {router && <FormRouteGuard shouldBlock={shouldBlock} message={leaveMessage} />}
      <ConfirmModal isOpen={pending !== null} title="저장하지 않고 이동할까요?"
        message={leaveMessage ?? "작성 중인 내용이 있어요. 남겨두려면 취소한 뒤 저장해주세요."} danger={false} confirmLabel="이동하기"
        onCancel={() => setPending(null)} onConfirm={() => {
          const next = pending; setPending(null); bypass.current = true;
          // POP(뒤로 가기)는 다음 이벤트에서 차단기를 검사하므로 승인 상태를 유지한다.
          next?.();
        }} />
    </>,
  };
}
