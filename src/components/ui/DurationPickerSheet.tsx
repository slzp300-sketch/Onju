import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

/* ── 드럼롤 컬럼 ── */
const ITEM_H = 48;
const PAD = 2;

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
      <div
        className="absolute inset-x-0 bg-fill rounded-2xl pointer-events-none z-10"
        style={{ top: PAD * ITEM_H, height: ITEM_H }}
      />
      <div
        ref={ref}
        className="h-full overflow-y-scroll"
        style={{ scrollSnapType: 'y mandatory', scrollbarWidth: 'none' } as React.CSSProperties}
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
                className={`select-none transition-all tabular-nums ${
                  i - PAD === selectedIdx
                    ? 'text-label-strong font-bold text-2xl'
                    : 'text-label-assistive text-base'
                }`}
              >
                {item}
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="absolute inset-x-0 top-0 pointer-events-none z-20"
        style={{ height: PAD * ITEM_H, background: 'linear-gradient(to bottom, var(--color-surface), transparent)' }} />
      <div className="absolute inset-x-0 bottom-0 pointer-events-none z-20"
        style={{ height: PAD * ITEM_H, background: 'linear-gradient(to top, var(--color-surface), transparent)' }} />
    </div>
  );
}

/* ── 변환 헬퍼 ── */
const HOURS = Array.from({ length: 24 }, (_, i) => String(i));
const MINS  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const SECS  = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

function fromSecs(total: number) {
  return {
    h: Math.floor(total / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
  };
}

function toSecs(h: number, m: number, s: number) {
  return h * 3600 + m * 60 + s;
}

/* ── 피커 내용 (AnimatePresence 리마운트로 state 초기화됨) ── */
interface PickerContentProps {
  seconds: number;
  onConfirm: (seconds: number) => void;
  onClose: () => void;
  title: string;
}

function PickerContent({ seconds, onConfirm, onClose, title }: PickerContentProps) {
  const { h, m, s } = fromSecs(seconds);
  const [hIdx, setHIdx] = useState(h);
  const [mIdx, setMIdx] = useState(m);
  const [sIdx, setSIdx] = useState(s);

  return (
    <motion.div
      initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
      transition={{ type: 'spring', stiffness: 420, damping: 36 }}
      className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-surface rounded-t-3xl z-50"
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-line-soft">
        <span className="text-headline1 font-bold text-label-strong">{title}</span>
        <button onClick={onClose} className="p-1 text-label-assistive hover:text-label-alt">
          <X size={20} />
        </button>
      </div>

      {/* 드럼롤 + 단위 */}
      <div className="flex items-center gap-1 px-5 py-4">
        <DrumCol items={HOURS} selectedIdx={hIdx} onChange={setHIdx} />
        <span className="text-body2 font-bold text-label-alt flex-shrink-0 pb-0.5">시간</span>
        <DrumCol items={MINS}  selectedIdx={mIdx} onChange={setMIdx} />
        <span className="text-body2 font-bold text-label-alt flex-shrink-0 pb-0.5">분</span>
        <DrumCol items={SECS}  selectedIdx={sIdx} onChange={setSIdx} />
        <span className="text-body2 font-bold text-label-alt flex-shrink-0 pb-0.5">초</span>
      </div>

      {/* 버튼 */}
      <div
        className="flex gap-3 px-5 pb-6"
        style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={onClose}
          className="flex-1 py-3.5 rounded-xl border border-line text-body2 font-semibold text-label-alt"
        >
          취소
        </button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { onConfirm(toSecs(hIdx, mIdx, sIdx)); onClose(); }}
          className="flex-1 py-3.5 rounded-xl bg-primary text-white text-body2 font-bold"
        >
          설정
        </motion.button>
      </div>
    </motion.div>
  );
}

/* ── 바텀 시트 ── */
interface DurationPickerSheetProps {
  isOpen: boolean;
  seconds: number;
  onConfirm: (seconds: number) => void;
  onClose: () => void;
  title?: string;
}

export default function DurationPickerSheet({
  isOpen, seconds, onConfirm, onClose, title = '⏱️ 타이머 설정',
}: DurationPickerSheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
          />
          {/* key로 시트 열릴 때마다 PickerContent 리마운트 → state 초기화 */}
          <PickerContent
            key={seconds}
            seconds={seconds}
            onConfirm={onConfirm}
            onClose={onClose}
            title={title}
          />
        </>
      )}
    </AnimatePresence>
  );
}
