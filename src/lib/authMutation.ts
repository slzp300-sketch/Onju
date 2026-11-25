const lockName = `onju-auth:${import.meta.env.VITE_SUPABASE_URL ?? 'local'}`;
let tail: Promise<unknown> = Promise.resolve();

/** SDK는 로그인/로그아웃 전체를 직렬화하지 않는다. PKCE 초기 복원도 같은 잠금을 사용한다. */
export function runAuthMutation<T>(action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    const controller = new AbortController();
    // 다른 탭이 응답하지 않아도 이 화면에서 다시 시도할 수 있다. 요청 실행 중에는 잠금을 유지한다.
    const timer = setTimeout(() => controller.abort(), 15_000);
    return navigator.locks.request(lockName, { signal: controller.signal }, () => {
      clearTimeout(timer);
      return action();
    }).finally(() => clearTimeout(timer));
  }
  // Web Locks가 없는 WebView에서는 같은 앱 인스턴스의 인증 요청을 직렬화한다.
  const result = tail.then(action, action);
  tail = result.catch(() => {});
  return result;
}
