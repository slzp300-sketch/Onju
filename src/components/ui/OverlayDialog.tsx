import { useEffect, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../lib/cn';

const openDialogs: HTMLDivElement[] = [];
let bodyOverflow = '';
const focusableSelector = 'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]';

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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement as HTMLElement | null;
    const openedDialog = dialogRef.current;
    if (!openedDialog) return;
    if (openDialogs.length === 0) bodyOverflow = document.body.style.overflow;
    openDialogs.push(openedDialog);
    openedDialog.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog || openDialogs[openDialogs.length - 1] !== dialog) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const buttons = [...dialog.querySelectorAll<HTMLElement>('*')].filter(el => el.matches(focusableSelector) && el.tabIndex >= 0 && !el.closest('[hidden], [aria-hidden="true"]'));
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      openDialogs.splice(openDialogs.indexOf(openedDialog), 1);
      if (openDialogs.length === 0) document.body.style.overflow = bodyOverflow;
      window.removeEventListener('keydown', onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [isOpen]);

  const isSheet = variant === 'sheet';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.button
            type="button"
            aria-label="닫기"
            tabIndex={-1}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[var(--z-scrim)] bg-[var(--scrim)]"
            onClick={closeOnScrim ? onClose : undefined}
          />
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
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
              'viewport-dialog fixed z-[var(--z-sheet)] overflow-y-auto overscroll-contain bg-surface shadow-overlay focus:outline-none',
              isSheet
                ? 'viewport-sheet inset-x-0 mx-auto max-w-lg rounded-t-3xl safe-bottom'
                : 'viewport-modal inset-x-6 mx-auto max-w-sm -translate-y-1/2 rounded-2xl',
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

