import { cn } from '../../lib/cn';

type Tone = 'soft' | 'solid' | 'positive' | 'cautionary' | 'negative' | 'neutral';

// legacy color prop for backward compat
type LegacyColor = 'indigo' | 'green' | 'yellow' | 'red' | 'gray' | 'purple';

const TONES: Record<Tone, string> = {
  solid: 'bg-primary text-white',
  soft: 'bg-primary-soft text-primary',
  positive: 'bg-positive/10 text-[#009632]',
  cautionary: 'bg-cautionary/10 text-[#d47800]',
  negative: 'bg-negative/10 text-negative',
  neutral: 'bg-fill text-label-alt',
};

const LEGACY_MAP: Record<LegacyColor, Tone> = {
  indigo: 'soft',
  purple: 'soft',
  green: 'positive',
  yellow: 'cautionary',
  red: 'negative',
  gray: 'neutral',
};

interface BadgeProps {
  label?: string;
  tone?: Tone;
  color?: LegacyColor;
  className?: string;
  children?: React.ReactNode;
}

export default function Badge({ label, tone, color, className, children }: BadgeProps) {
  const resolved: Tone = tone ?? (color ? LEGACY_MAP[color] : 'neutral');
  return (
    <span
      className={cn(
        'inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded px-2',
        'text-caption1 font-bold',
        TONES[resolved],
        className,
      )}
    >
      {children ?? label}
    </span>
  );
}
