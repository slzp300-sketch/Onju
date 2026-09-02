import { forwardRef } from 'react';
import { motion, type HTMLMotionProps } from 'framer-motion';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'outlined' | 'assistive' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-strong active:bg-primary-heavy disabled:opacity-[var(--disabled-opacity)]',
  outlined: 'bg-surface text-primary border border-primary hover:bg-primary-soft',
  assistive: 'bg-fill text-label hover:bg-fill-strong',
  ghost: 'bg-transparent text-label-alt hover:bg-fill',
  danger: 'bg-negative text-white hover:opacity-90 disabled:opacity-[var(--disabled-opacity)]',
};

const SIZES: Record<Size, string> = {
  lg: 'h-[var(--control-height-lg)] rounded-lg px-7 text-body1',
  md: 'h-[var(--control-height-md)] rounded-lg px-5 text-body2',
  sm: 'h-[var(--control-height-sm)] rounded px-3.5 text-label1',
};

interface ButtonProps extends HTMLMotionProps<'button'> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'lg', fullWidth, className, children, ...props }, ref) => (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 font-bold transition-colors duration-[var(--motion-fast)] ease-[var(--ease-standard)]',
        'disabled:cursor-not-allowed',
        SIZES[size],
        VARIANTS[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {children}
    </motion.button>
  ),
);
Button.displayName = 'Button';
export default Button;
