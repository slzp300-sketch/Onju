import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  tone?: 'primary' | 'positive';
  size?: 'sm' | 'md';
  className?: string;
}

const sizes = {
  sm: { track: 'w-11 h-6', thumb: 'w-4 h-4', x: 20 },
  md: { track: 'w-12 h-7', thumb: 'w-5 h-5', x: 20 },
};

export default function Switch({
  checked, onCheckedChange, label, disabled = false, tone = 'primary', size = 'sm', className,
}: SwitchProps) {
  const config = sizes[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative shrink-0 rounded-full transition-colors duration-[var(--motion-base)] ease-[var(--ease-standard)]',
        'focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
        checked ? (tone === 'positive' ? 'bg-positive' : 'bg-primary') : 'bg-fill-strong',
        disabled && 'cursor-not-allowed opacity-[var(--disabled-opacity)]',
        config.track,
        className,
      )}
    >
      <motion.span
        aria-hidden
        initial={false}
        animate={{ x: checked ? config.x : 2 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        className={cn('absolute left-0 top-1 rounded-full bg-white shadow-emphasize', config.thumb)}
      />
    </button>
  );
}

