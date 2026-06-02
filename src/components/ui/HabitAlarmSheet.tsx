import { useRef, useEffect, useCallback, useMemo } from 'react';
import { X, Lock, BellRing, Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { to12h, to24h } from '../../utils/alarmTime';

/* ══════════════════════════════════════
   드럼롤 컬럼
══════════════════════════════════════ */
const ITEM_H = 44;
const PAD = 3; // 위아래 3개씩 여백 → 총 7개 표시

interface DrumColProps {
  items: string[];
  selectedIdx: number;
  onChange: (idx: number) => void;
}

function DrumCol({ items, selectedIdx, onChange }: DrumColProps) {
  const ref = useRef<HTMLDivElement>(null);

  const allItems = useMemo(
    () => [...Array(PAD).fill(null), ...items, ...Array(PAD).fill(null)],
    [items],
  );

  // 마운트 시 선택 위치로 스크롤
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = selectedIdx * ITEM_H;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const idx = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
    if (idx !== selectedIdx) onChange(idx);
  }, [items.length, selectedIdx, onChange]);

  const containerH = ITEM_H * (PAD * 2 + 1);

  return (
    <div className="relative flex-1" style={{ height: containerH }}>
      {/* 선택 하이라이트 */}
      <div
        className="absolute inset-x-1 bg-fill rounded-xl pointer-events-none z-10"
        style={{ top: PAD * ITEM_H, height: ITEM_H }}
      />

      {/* 스크롤 목록 */}
      <div
        ref={ref}
        className="h-full overflow-y-scroll"
        style={{
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none',
          WebkitOverflowScrolling: 'touch',
        } as React.CSSProperties}
        onScroll={onScroll}
      >
        {allItems.map((item, i) => (
          <div
            key={i}
            style={{ height: ITEM_H, scrollSnapAlign: 'center' } as React.CSSProperties}
            className="flex items-center justify-center"
          >
            {item !== null && (
              <span
                className={`select-none transition-all ${
                  i - PAD === selectedIdx
                    ? 'text-label-strong font-bold text-lg'
                    : 'text-label-assistive text-sm'
                }`}
              >
                {item}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 그라디언트 페이드 */}
      <div
        className="absolute inset-x-0 top-0 pointer-events-none z-20"
        style={{
          height: PAD * ITEM_H,
          background: 'linear-gradient(to bottom, var(--color-surface), transparent)',
        }}
      />
      <div
        className="absolute inset-x-0 bottom-0 pointer-events-none z-20"
        style={{
          height: PAD * ITEM_H,
          background: 'linear-gradient(to top, var(--color-surface), transparent)',
        }}
      />
    </div>
  );
}

const AMPM  = ['오전', '오후'];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINS  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

/* ══════════════════════════════════════
   시간 선택 시트
══════════════════════════════════════ */
interface AlarmTimeSheetProps {
  isOpen: boolean;
  time: string;           // "HH:mm"
  onChange: (t: string) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function AlarmTimeSheet({ isOpen, time, onChange, onDelete, onClose }: AlarmTimeSheetProps) {
  const { ampmIdx, hourIdx, minuteIdx } = to12h(time);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-surface rounded-t-3xl z-50"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
              <span className="text-headline1 font-bold text-label-strong">🔔 알림</span>
              <button onClick={onClose} className="p-1 text-label-assistive hover:text-label-alt">
                <X size={20} />
              </button>
            </div>

            {/* 드럼롤 피커 */}
            <div className="flex gap-1 px-5 py-4">
              <DrumCol items={AMPM}  selectedIdx={ampmIdx}   onChange={i => onChange(to24h(i, hourIdx, minuteIdx))} />
              <DrumCol items={HOURS} selectedIdx={hourIdx}   onChange={i => onChange(to24h(ampmIdx, i, minuteIdx))} />
              <DrumCol items={MINS}  selectedIdx={minuteIdx} onChange={i => onChange(to24h(ampmIdx, hourIdx, i))} />
            </div>

            {/* 알림 삭제 */}
            <div
              className="px-5 pb-6"
              style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            >
              <button
                onClick={() => { onDelete(); onClose(); }}
                className="text-negative text-body2 font-medium"
              >
                알림 삭제
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ══════════════════════════════════════
   알림 타입 선택 시트
══════════════════════════════════════ */
interface AlarmTypeSheetProps {
  isOpen: boolean;
  type: 'push' | 'sound';
  onChange: (t: 'push' | 'sound') => void;
  onClose: () => void;
}

export function AlarmTypeSheet({ isOpen, type, onChange, onClose }: AlarmTypeSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-surface rounded-t-3xl z-50"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
              <span className="text-headline1 font-bold text-label-strong">🔔 알림</span>
              <button onClick={onClose} className="p-1 text-label-assistive hover:text-label-alt">
                <X size={20} />
              </button>
            </div>

            {/* 카드 선택 */}
            <div className="flex gap-3 px-5 py-5">
              {/* 푸시 */}
              <button
                onClick={() => { onChange('push'); onClose(); }}
                className={`flex-1 rounded-2xl p-4 flex flex-col items-center gap-3 border-2 transition-all ${
                  type === 'push' ? 'border-primary bg-primary-soft' : 'border-line bg-fill'
                }`}
              >
                <div className="w-12 h-12 rounded-xl bg-positive/10 flex items-center justify-center">
                  <BellRing size={24} className="text-positive" />
                </div>
                <span className={`text-body2 font-bold ${type === 'push' ? 'text-primary' : 'text-label-alt'}`}>
                  푸시
                </span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  type === 'push' ? 'border-primary bg-primary' : 'border-line'
                }`}>
                  {type === 'push' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>

              {/* 알림음 (BETA) */}
              <button
                onClick={() => { onChange('sound'); onClose(); }}
                className={`relative flex-1 rounded-2xl p-4 flex flex-col items-center gap-3 border-2 transition-all ${
                  type === 'sound' ? 'border-primary bg-primary-soft' : 'border-line bg-fill'
                }`}
              >
                <span className="absolute top-2 right-2 bg-label-strong text-surface text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                  BETA
                </span>
                <div className="relative w-12 h-12 rounded-xl bg-label-assistive/10 flex items-center justify-center">
                  <Bell size={24} className="text-label-assistive" />
                  <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-label-alt rounded-full flex items-center justify-center">
                    <Lock size={10} className="text-surface" />
                  </div>
                </div>
                <span className={`text-body2 font-bold ${type === 'sound' ? 'text-primary' : 'text-label-alt'}`}>
                  알림음
                </span>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  type === 'sound' ? 'border-primary bg-primary' : 'border-line'
                }`}>
                  {type === 'sound' && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>
            </div>

            {/* 설명 */}
            <p className="text-center text-caption1 text-label-assistive pb-6">
              {type === 'push'
                ? '시간에 맞춰 푸시 알림을 받아요'
                : '알림음은 네이티브 앱 전환 시 지원돼요'}
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
