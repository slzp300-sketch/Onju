import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const DRAG_SENSITIVITY = 3;

const MINUTES = Array.from({ length: 100 }, (_, i) => i);
const SECONDS = Array.from({ length: 12 }, (_, i) => i * 5);

interface DragValueProps {
  values: number[];
  selected: number;
  onChange: (v: number) => void;
}

function DragValue({ values, selected, onChange }: DragValueProps) {
  const selIdx = Math.max(0, values.indexOf(selected));
  const startY = useRef(0);
  const startIdx = useRef(selIdx);
  const dragging = useRef(false);
  const [dir, setDir] = useState(0); // -1: up(증가), 1: down(감소)

  const clamp = (i: number) => Math.max(0, Math.min(values.length - 1, i));

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    startY.current = e.clientY;
    startIdx.current = selIdx;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dy = e.clientY - startY.current;
    const delta = -Math.round(dy / DRAG_SENSITIVITY);
    const newIdx = clamp(startIdx.current + delta);
    if (newIdx !== selIdx) {
      setDir(newIdx > selIdx ? -1 : 1); // 증가 → 위로 올라옴, 감소 → 아래로
      onChange(values[newIdx]);
    }
  };

  const onPointerUp = () => { dragging.current = false; };

  return (
    <div
      className="flex items-center justify-center bg-indigo-50 border border-indigo-200 rounded-lg cursor-ns-resize overflow-hidden select-none"
      style={{ width: 44, height: 32, touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      <AnimatePresence mode="popLayout" initial={false} custom={dir}>
        <motion.span
          key={selected}
          custom={dir}
          variants={{
            enter: (d: number) => ({ y: d * -14, opacity: 0 }),
            center: { y: 0, opacity: 1 },
            exit: (d: number) => ({ y: d * 14, opacity: 0 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.12, ease: 'easeOut' }}
          style={{ fontSize: 16, fontWeight: 700, color: '#4f46e5', display: 'block' }}
        >
          {String(values[selIdx]).padStart(2, '0')}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

interface DurationPickerProps {
  seconds: number;
  onChange: (seconds: number) => void;
}

export default function DurationPicker({ seconds, onChange }: DurationPickerProps) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round((seconds % 60) / 5) * 5 % 60;

  return (
    <div className="flex items-center gap-2 justify-center py-1">
      <DragValue values={MINUTES} selected={mins} onChange={m => onChange(m * 60 + secs)} />
      <span className="text-sm font-bold text-gray-300">:</span>
      <DragValue values={SECONDS} selected={secs} onChange={s => onChange(mins * 60 + s)} />
    </div>
  );
}
