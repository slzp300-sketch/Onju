import { AnimatePresence, motion } from 'framer-motion';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useToastStore, type ToastType } from '../../store/toastStore';

const ICON: Record<ToastType, React.ElementType> = {
  error: AlertCircle,
  success: CheckCircle2,
  info: Info,
};

const ICON_COLOR: Record<ToastType, string> = {
  error: 'text-negative',
  success: 'text-primary',
  info: 'text-surface',
};

export default function ToastHost() {
  const toasts = useToastStore(s => s.toasts);
  const dismiss = useToastStore(s => s.dismiss);

  return (
    <div
      className="fixed left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 max-w-md mx-auto pointer-events-none"
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
              transition={{ duration: 0.2 }}
              onClick={() => dismiss(t.id)}
              className="pointer-events-auto cursor-pointer w-full flex items-center gap-2.5 rounded-xl bg-label-strong/95 text-surface px-4 py-3 shadow-lg backdrop-blur-sm"
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
