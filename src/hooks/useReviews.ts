import { useQuery } from '@tanstack/react-query';
import { fetchReviews } from '../api/reviews';
import { useAuthStore } from '../store/authStore';

/** 개인 리뷰 캐시는 사용자 ID로 분리하고 로그아웃 상태에서는 조회하지 않는다. */
export function useReviews() {
  const userId = useAuthStore(state => state.user?.id);
  return useQuery({
    queryKey: ['reviews', userId],
    queryFn: ({ signal }) => userId ? fetchReviews(userId, signal) : Promise.resolve([]),
    enabled: !!userId,
  });
}
