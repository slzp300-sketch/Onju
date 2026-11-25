import { format } from 'date-fns';
import type { ReminderSpec } from './reminderSpecs';

/** 오늘 남은 예약만 실행한다. 절전 복귀로 1분 이상 늦어진 예약은 건너뛴다. */
export function scheduleBrowserReminders(ownerId: string, specs: ReminderSpec[], deliver: (spec: ReminderSpec) => void, failed: () => void) {
  let stopped = false;
  let timers: ReturnType<typeof setTimeout>[] = [];
  const memory = new Set<string>();
  const rebuild = () => {
    timers.forEach(clearTimeout);
    if (stopped) return;
    const now = new Date();
    timers = specs.filter(s => !s.weekdays || s.weekdays.includes(now.getDay() + 1)).flatMap(spec => {
      const at = new Date(now); at.setHours(spec.hour, spec.minute, 0, 0);
      if (at < now) return [];
      return [setTimeout(() => {
        if (stopped || Date.now() - at.getTime() >= 60_000) return;
        const key = `onju-notification:${ownerId}:${spec.key}:${spec.hour}:${spec.minute}`;
        const day = format(at, 'yyyy-MM-dd');
        const send = () => {
          if (stopped || Date.now() - at.getTime() >= 60_000) return;
          if (memory.has(`${key}:${day}`) || localStorage.getItem(key) === day) return;
          deliver(spec);
          memory.add(`${key}:${day}`);
          localStorage.setItem(key, day);
        };
        // 여러 탭이 같은 분에 깨어나도 발송 기록 확인과 기록을 함께 잠근다.
        if (navigator.locks?.request) void navigator.locks.request(key, send).catch(failed);
        else { try { send(); } catch { failed(); } }
      }, at.getTime() - now.getTime())];
    });
    const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
    timers.push(setTimeout(rebuild, midnight.getTime() - now.getTime()));
  };
  rebuild();
  const onVisible = () => { if (document.visibilityState === 'visible') rebuild(); };
  document.addEventListener('visibilitychange', onVisible);
  return () => { stopped = true; timers.forEach(clearTimeout); document.removeEventListener('visibilitychange', onVisible); };
}
