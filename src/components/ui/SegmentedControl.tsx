import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface SegmentItem<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  items: readonly SegmentItem<T>[];
  label: string;
  variant?: 'segmented' | 'pills' | 'underline';
  className?: string;
}

const containerClasses = {
  segmented: 'flex rounded-xl bg-fill p-1',
  pills: 'flex flex-wrap gap-2',
  underline: 'flex border-b border-line-soft',
};

const itemClasses = {
  segmented: 'min-h-9 flex-1 rounded-lg px-3 py-2 text-label1 font-semibold data-[active=true]:bg-surface data-[active=true]:text-label-strong data-[active=true]:shadow-emphasize',
  pills: 'min-h-9 rounded-lg bg-fill px-3.5 py-1.5 text-label2 font-medium data-[active=true]:bg-primary data-[active=true]:text-white',
  underline: 'relative min-h-11 px-1 py-2.5 mr-5 text-label1 font-bold border-b-2 border-transparent data-[active=true]:border-label-strong data-[active=true]:text-label-strong',
};

export default function SegmentedControl<T extends string>({
  value, onChange, items, label, variant = 'segmented', className,
}: SegmentedControlProps<T>) {
  return (
    <div role="tablist" aria-label={label} className={cn(containerClasses[variant], className)}>
      {items.map(item => {
        const active = value === item.value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-active={active}
            onClick={() => onChange(item.value)}
            className={cn(
              'transition-[color,background-color,border-color,box-shadow] duration-[var(--motion-fast)] ease-[var(--ease-standard)]',
              'text-label-alt focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]',
              itemClasses[variant],
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
