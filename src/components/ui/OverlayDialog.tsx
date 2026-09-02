import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/cn';

interface OverlayDialogProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy: string;
  variant?: 'modal' | 'sheet';
  closeOnScrim?: boolean;
  className?: string;
}

export default function OverlayDialog({
  isOpen, onClose, children, labelledBy, variant = 'modal', closeOnScrim = true, className,
}: OverlayDialogProps) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  const isSheet = variant === 'sheet';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            type="button"
            aria-label="닫기"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[var(--z-scrim)] bg-[var(--scrim)]"
            onClick={closeOnScrim ? onClose : undefined}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={labelledBy}
            initial={isSheet ? { y: '100%' } : { opacity: 0, scale: 0.94, y: 8 }}
            animate={isSheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={isSheet ? { y: '100%' } : { opacity: 0, scale: 0.94, y: 8 }}
            transition={isSheet
              ? { type: 'spring', stiffness: 420, damping: 36 }
              : { duration: 0.2, ease: [0.2, 0, 0, 1] }}
            className={cn(
              'fixed z-[var(--z-sheet)] bg-surface shadow-overlay',
              isSheet
                ? 'inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-lg overflow-y-auto rounded-t-3xl safe-bottom'
                : 'inset-x-6 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-2xl',
              className,
            )}
            onClick={event => event.stopPropagation()}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

