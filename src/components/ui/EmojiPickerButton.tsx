import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, X } from 'lucide-react';
import { ONJU_ICONS } from '../../data/onjuIcons.generated';
import OnjuIcon from './OnjuIcon';

interface EmojiPickerButtonProps {
  emoji: string;
  onChange: (emoji: string) => void;
  size?: 'sm' | 'md';
}

const GROUPS = Array.from(
  new Map(ONJU_ICONS.map(icon => [icon.group, icon.groupName])).entries(),
).map(([id, name]) => ({ id, name }));

export default function EmojiPickerButton({ emoji, onChange, size = 'md' }: EmojiPickerButtonProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<string>('all');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return ONJU_ICONS.filter(icon => {
      if (group !== 'all' && icon.group !== group) return false;
      if (!needle) return true;
      return `${icon.name} ${icon.keywords.join(' ')}`.toLowerCase().includes(needle);
    });
  }, [group, query]);

  const select = (value: string) => {
    onChange(value);
    setOpen(false);
    setQuery('');
  };

  const btnSize = size === 'sm' ? 'w-10 h-10' : 'w-14 h-14';
  const iconSize = size === 'sm' ? 30 : 42;

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 700, damping: 22 }}
        onClick={() => setOpen(value => !value)}
        className={`${btnSize} rounded-2xl border flex items-center justify-center shadow-sm transition-colors ${
          emoji ? 'bg-surface border-line hover:bg-surface-alt' : 'border-dashed border-label-assistive bg-fill hover:bg-fill-strong'
        }`}
        aria-label="아이콘 선택"
      >
        {emoji ? <OnjuIcon emoji={emoji} size={iconSize} /> : (
          <span className={`font-medium text-label-assistive ${size === 'sm' ? 'text-lg' : 'text-2xl'}`}>+</span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="absolute top-16 left-0 z-50 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
          >
            <div className="p-3 border-b border-line-soft">
              <div className="flex items-center gap-2 rounded-xl bg-fill px-3 h-10">
                <Search size={16} className="text-label-assistive flex-shrink-0" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="아이콘 검색..."
                  className="min-w-0 flex-1 bg-transparent text-body2 text-label outline-none placeholder:text-label-assistive"
                  autoFocus
                />
                {query && (
                  <button type="button" onClick={() => setQuery('')} aria-label="검색어 지우기">
                    <X size={15} className="text-label-assistive" />
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto pt-2 pb-0.5 scrollbar-none">
                {[{ id: 'all', name: '전체' }, ...GROUPS].map(item => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => setGroup(item.id)}
                    className={`px-2.5 py-1 rounded-full text-caption1 whitespace-nowrap transition-colors ${
                      group === item.id ? 'bg-primary text-white font-semibold' : 'bg-fill text-label-alt hover:bg-fill-strong'
                    }`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-[330px] overflow-y-auto p-2.5">
              {filtered.length > 0 ? (
                <div className="grid grid-cols-5 gap-1.5">
                  {filtered.map(icon => (
                    <button
                      type="button"
                      key={icon.unicode}
                      onClick={() => select(icon.emoji)}
                      className={`aspect-square rounded-xl flex items-center justify-center transition-colors hover:bg-fill ${
                        emoji === icon.emoji ? 'bg-primary-soft ring-1 ring-primary' : ''
                      }`}
                      title={icon.name}
                      aria-label={icon.name}
                    >
                      <img src={icon.src} width={46} height={46} alt="" loading="lazy" draggable={false} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-body2 text-label-assistive">검색 결과가 없어요</div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
