/** 예약/취소를 직렬화하고 실행 중 바뀐 요청은 가장 최신 내용으로만 이어서 처리한다. */
export function createNotificationQueue<T>(run: (value: T, isCurrent: () => boolean) => Promise<void>, status: (state: 'syncing' | 'saved' | 'error') => void) {
  let revision = 0;
  let desired: T;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  const flush = async () => {
    if (running || !revision) return;
    running = true;
    try {
      for (;;) {
        const current = revision;
        status('syncing');
        try {
          await run(desired, () => current === revision);
          if (current !== revision) continue;
          attempts = 0;
          status('saved');
        } catch {
          if (current !== revision) continue;
          status('error');
          timer = setTimeout(() => { void flush(); }, Math.min(60_000, 2000 * 2 ** Math.min(attempts++, 5)));
        }
        break;
      }
    } finally { running = false; }
  };
  return {
    update(value: T) { desired = value; revision++; attempts = 0; clearTimeout(timer); void flush(); },
    retry() { clearTimeout(timer); void flush(); },
  };
}
