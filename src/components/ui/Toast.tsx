import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from '../../icons';
import { useToastStore, type ToastType } from '../../store/toastStore';

const ICON: Record<ToastType, React.ElementType> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

const ICON_COLOR: Record<ToastType, string> = {
  error: 'text-negative',
  success: 'text-primary',
  info: 'text-[var(--onju-sky)]',
};

const TOAST_STYLE: Record<ToastType, string> = {
  error: 'border-negative/30 bg-[var(--onju-peach-soft)] text-label-strong',
  success: 'border-primary/30 bg-primary-soft text-label-strong',
  info: 'border-[var(--onju-sky)]/40 bg-[var(--onju-sky-soft)] text-label-strong',
};

export default function ToastHost() {
  const toasts = useToastStore(s => s.toasts);
  const dismiss = useToastStore(s => s.dismiss);

  return (
    <div
      className="fixed left-0 right-0 z-[var(--z-toast)] flex flex-col items-center gap-2 px-4 max-w-md mx-auto pointer-events-none"
      style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <AnimatePresence>
        {toasts.map(t => {
          const Icon = ICON[t.type];
          return (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
              onClick={() => dismiss(t.id)}
              role={t.type === 'error' ? 'alert' : 'status'}
              aria-live={t.type === 'error' ? 'assertive' : 'polite'}
              className={`pointer-events-auto cursor-pointer w-full min-h-12 flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-strong ${TOAST_STYLE[t.type]}`}
            >
              <Icon size={18} className={`flex-shrink-0 ${ICON_COLOR[t.type]}`} />
              <span className="flex-1 text-body2 font-medium">{t.message}</span>
              <X size={16} className="flex-shrink-0 opacity-60" />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
