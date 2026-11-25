import { useMutation, useQueryClient } from '@tanstack/react-query';
import { setUserBlocked } from '../../api/community';
import { useBlockedUsers } from '../../hooks/useBlockedUsers';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/toastStore';

export default function BlockedUsers() {
  const userId = useAuthStore(s => s.user?.id ?? '');
  const queryClient = useQueryClient();
  const blocked = useBlockedUsers();
  const unblock = useMutation({
    mutationFn: (target: string) => setUserBlocked(userId, target, false),
    onSuccess: (_, target) => {
      if (useAuthStore.getState().user?.id !== userId) return;
      queryClient.setQueryData<{ userId: string; name: string }[]>(['blocked-users', userId], previous => previous?.filter(user => user.userId !== target) ?? []);
      void queryClient.invalidateQueries();
      toast.success('차단을 해제했어요.');
    },
  });
  return (
    <section className="mx-4 rounded-2xl border border-line-soft bg-surface p-4">
      <h2 className="text-label2 font-bold text-label-strong">차단한 사용자</h2>
      {blocked.isPending ? <p className="mt-2 text-caption1 text-label-alt">불러오는 중…</p>
        : blocked.isError ? <button onClick={() => void blocked.refetch()} className="min-h-11 text-caption1 text-negative">불러오지 못했어요. 다시 시도</button>
        : !blocked.data?.length ? <p className="mt-2 text-caption1 text-label-alt">차단한 사용자가 없어요.</p>
        : blocked.data.map(user => (
          <div key={user.userId} className="flex items-center gap-3 border-b border-line-soft py-2 last:border-0">
            <span className="min-w-0 flex-1 truncate text-body2 text-label">{user.name}</span>
            <button onClick={() => unblock.mutate(user.userId)} disabled={unblock.isPending} className="min-h-11 px-2 text-caption1 text-primary disabled:opacity-50">차단 해제</button>
          </div>
        ))}
      {unblock.isError && <p role="alert" className="text-caption1 text-negative">해제하지 못했어요. 다시 시도해주세요.</p>}
    </section>
  );
}
