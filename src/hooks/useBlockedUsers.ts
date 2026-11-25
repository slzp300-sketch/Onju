import { useQuery } from '@tanstack/react-query';
import { fetchBlockedUsers } from '../api/community';
import { useAuthStore } from '../store/authStore';

export function useBlockedUsers() {
  const userId = useAuthStore(s => s.user?.id ?? '');
  return useQuery({
    queryKey: ['blocked-users', userId],
    queryFn: () => fetchBlockedUsers(userId),
    enabled: !!userId,
  });
}
