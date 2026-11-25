import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { acceptCommunityRules, fetchCommunityConsent } from '../../api/community';
import { useAuthStore } from '../../store/authStore';
import Button from '../ui/Button';

export default function CommunityGate({ children }: { children: ReactNode }) {
  const userId = useAuthStore(s => s.user?.id ?? '');
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState(false);
  const consent = useQuery({
    queryKey: ['community-consent', userId],
    queryFn: () => fetchCommunityConsent(userId), enabled: !!userId,
  });
  const accept = useMutation({
    mutationFn: () => acceptCommunityRules(userId),
    onSuccess: () => {
      if (useAuthStore.getState().user?.id === userId) queryClient.setQueryData(['community-consent', userId], true);
    },
  });
  if (consent.isPending) return <p className="p-6 text-center text-body2 text-label-alt">이용 안내를 확인하고 있어요…</p>;
  if (consent.isError) return (
    <div className="p-6 text-center">
      <p className="mb-3 text-body2 text-label-alt">이용 안내를 불러오지 못했어요. 네트워크를 확인해주세요.</p>
      <Button onClick={() => void consent.refetch()}>다시 시도</Button>
    </div>
  );
  if (consent.data) return children;
  return (
    <section className="m-4 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-headline1 font-bold text-label-strong">함께 지키는 소모임 약속</h2>
      <p className="mt-2 text-body2 text-label-alt">서로의 작은 실천을 응원하는 공간이에요. 참여하기 전에 이용수칙을 확인해주세요.</p>
      <ul className="my-4 list-disc space-y-2 pl-5 text-body2 text-label">
        <li>욕설·혐오·괴롭힘, 음란·폭력·불법 콘텐츠, 광고·사기 게시물은 올리지 않아요.</li>
        <li>다른 사람의 얼굴·연락처·개인 기록은 허락 없이 공유하지 않아요.</li>
        <li>문제가 있는 게시물이나 사용자는 신고하고 차단할 수 있어요.</li>
        <li>신고는 운영자가 검토하며, 위반 콘텐츠 삭제나 이용 제한 조치를 할 수 있어요.</li>
      </ul>
      <p className="text-caption1 text-label-alt">
        <a href="/terms.html" target="_blank" rel="noopener noreferrer" className="underline">이용약관</a> ·{' '}
        <a href="/privacy.html" target="_blank" rel="noopener noreferrer" className="underline">개인정보처리방침</a>
      </p>
      <label className="my-4 flex min-h-12 cursor-pointer items-start gap-3 text-body2 text-label">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} className="mt-1 size-5 shrink-0 accent-primary" />
        <span>이용약관과 위 소모임 이용수칙을 확인하고 동의해요.</span>
      </label>
      {accept.isError && <p role="alert" className="mb-3 text-caption1 text-negative">동의를 저장하지 못했어요. 다시 시도해주세요.</p>}
      <Button fullWidth disabled={!checked || accept.isPending} onClick={() => accept.mutate()}>
        {accept.isPending ? '저장 중…' : '동의하고 소모임 이용하기'}
      </Button>
    </section>
  );
}
