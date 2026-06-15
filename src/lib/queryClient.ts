import { QueryClient } from '@tanstack/react-query';

/** 앱 전역 단일 QueryClient. React 밖(위젯 스냅샷 빌더 등)에서도 캐시를 읽을 수 있도록 분리. */
export const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 1000 * 30 } },
});
