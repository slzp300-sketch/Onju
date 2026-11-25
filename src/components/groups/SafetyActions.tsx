import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reportContent, setUserBlocked, REPORT_REASONS, type CommunityTarget } from '../../api/community';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';
import OverlayDialog from '../ui/OverlayDialog';
import Button from '../ui/Button';

export default function SafetyActions({ target }: { target: CommunityTarget }) {
  const userId = useAuthStore(s => s.user?.id ?? '');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<keyof typeof REPORT_REASONS>('harassment');
  const report = useMutation({
    mutationFn: () => reportContent(userId, target, reason),
    onSuccess: () => {
      if (useAuthStore.getState().user?.id !== userId) return;
      setOpen(false); toast.success('신고를 접수했어요. 운영자가 확인할게요.');
    },
  });
  const block = useMutation({
    mutationFn: () => setUserBlocked(userId, target.userId, true),
    onSuccess: () => {
      if (useAuthStore.getState().user?.id !== userId) return;
      queryClient.setQueryData<{ userId: string; name: string }[]>(['blocked-users', userId], previous =>
        [...(previous ?? []).filter(user => user.userId !== target.userId), { userId: target.userId, name: '차단한 사용자' }]);
      void queryClient.invalidateQueries();
      setOpen(false);
      toast.success('사용자를 차단했어요. 마이페이지에서 해제할 수 있어요.');
    },
  });
  if (!userId || target.userId === userId) return null;
  const busy = report.isPending || block.isPending;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 px-2 text-caption2 text-label-alt underline underline-offset-2">
        신고·차단
      </button>
      <OverlayDialog isOpen={open} onClose={() => { if (!busy) setOpen(false); }} labelledBy={`safety-${target.type}-${target.id}`} className="p-5">
        <h2 id={`safety-${target.type}-${target.id}`} className="text-headline1 font-bold text-label-strong">신고·사용자 차단</h2>
        <label className="mt-4 block text-body2 text-label">
          신고 사유
          <select value={reason} onChange={e => setReason(e.target.value as keyof typeof REPORT_REASONS)} disabled={busy} className="input-base mt-2 w-full">
            {Object.entries(REPORT_REASONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <p className="my-3 text-caption1 text-label-alt">신고는 운영자에게 접수돼요. 차단하면 서로의 소모임 게시물과 멤버 현황이 숨겨져요. 이미 담아간 루틴은 유지돼요.</p>
        {(report.isError || block.isError) && <p role="alert" className="mb-3 text-caption1 text-negative">처리하지 못했어요. 네트워크를 확인하고 다시 시도해주세요.</p>}
        <div className="flex flex-col gap-2">
          <Button fullWidth disabled={busy} onClick={() => report.mutate()}>신고 접수하기</Button>
          <Button fullWidth variant="danger" disabled={busy} onClick={() => block.mutate()}>이 사용자 차단하기</Button>
          <Button fullWidth variant="assistive" disabled={busy} onClick={() => setOpen(false)}>취소</Button>
        </div>
      </OverlayDialog>
    </>
  );
}
