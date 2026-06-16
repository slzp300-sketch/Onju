import { QueryClient, QueryCache, MutationCache } from '@tanstack/react-query';
import { toast } from '../store/toastStore';

/** 앱 전역 단일 QueryClient. React 밖(위젯 스냅샷 빌더 등)에서도 캐시를 읽을 수 있도록 분리. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 30 } },
  // 읽기/쓰기 실패를 조용히 삼키지 않고 토스트로 노출 (동일 메시지는 toastStore가 디듀프)
  queryCache: new QueryCache({
    onError: () => toast.error('불러오기에 실패했어요. 네트워크를 확인해주세요.'),
  }),
  mutationCache: new MutationCache({
    onError: () => toast.error('저장에 실패했어요. 잠시 후 다시 시도해주세요.'),
  }),
});
