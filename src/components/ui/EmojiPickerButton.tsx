import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiPicker, { type EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';

interface EmojiPickerButtonProps {
  emoji: string; // 빈 문자열이면 + 플레이스홀더 표시
  onChange: (emoji: string) => void;
  size?: 'sm' | 'md';
}

export default function EmojiPickerButton({ emoji, onChange, size = 'md' }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleSelect = (data: EmojiClickData) => {
    onChange(data.emoji);
    setOpen(false);
  };

  const btnSize = size === 'sm' ? 'w-10 h-10 text-2xl' : 'w-14 h-14 text-3xl';

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <motion.button
        type="button"
        whileTap={{ scale: 0.88 }}
        transition={{ type: 'spring', stiffness: 700, damping: 22 }}
        onClick={() => setOpen(v => !v)}
        className={`${btnSize} rounded-2xl border flex items-center justify-center shadow-sm transition-colors ${
          emoji
            ? 'bg-surface border-line hover:bg-surface-alt'
            : 'border-dashed border-label-assistive bg-fill hover:bg-fill-strong'
        }`}
      >
        {emoji || (
          <span className={`font-medium text-label-assistive ${size === 'sm' ? 'text-lg' : 'text-2xl'}`}>
            +
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-16 left-0 z-50 shadow-2xl rounded-2xl overflow-hidden"
            style={{ maxWidth: 'min(320px, calc(100vw - 2rem))' }}
          >
            <EmojiPicker
              onEmojiClick={handleSelect}
              theme={Theme.LIGHT}
              emojiStyle={EmojiStyle.NATIVE}
              height={380}
              width={300}
              searchPlaceholder="이모지 검색..."
              previewConfig={{ showPreview: false }}
              lazyLoadEmojis
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
