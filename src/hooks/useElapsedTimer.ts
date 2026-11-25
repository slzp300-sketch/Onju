import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';

/** 화면이 잠시 멈추어도 실제 경과 시간으로 복원하고, 정지한 시간은 제외한다. */
export function useElapsedTimer(durationSeconds: number, running: boolean, onComplete: (seconds: number) => void, step = 0) {
  const clock = useRef({ started: null as number | null, accumulated: 0, finished: false, step });
  const [display, setDisplay] = useState({ step, seconds: 0 });
  const complete = useEffectEvent(onComplete);
  const read = useCallback(() => {
    const value = clock.current;
    return Math.max(0, (value.accumulated + (value.started === null ? 0 : Date.now() - value.started)) / 1000);
  }, []);

  useEffect(() => {
    if (clock.current.step !== step) clock.current = { started: null, accumulated: 0, finished: false, step };
    if (!running || clock.current.finished) return;
    clock.current.started = Date.now();
    const tick = () => {
      if (clock.current.finished) return;
      const seconds = Math.floor(read());
      if (durationSeconds > 0 && seconds >= durationSeconds) {
        clock.current = { started: null, accumulated: durationSeconds * 1000, finished: true, step };
        setDisplay({ step, seconds: durationSeconds });
        complete(durationSeconds);
      } else setDisplay({ step, seconds });
    };
    const timer = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      const value = clock.current;
      if (value.started !== null) {
        value.accumulated += Math.max(0, Date.now() - value.started);
        value.started = null;
      }
    };
  }, [durationSeconds, running, read, step]);

  const stop = useCallback(() => {
    const seconds = Math.round(read());
    clock.current = { ...clock.current, started: null, accumulated: seconds * 1000, finished: true };
    return seconds;
  }, [read]);
  return { elapsed: display.step === step ? display.seconds : 0, stop };
}
