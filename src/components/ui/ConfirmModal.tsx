import { motion, AnimatePresence } from 'framer-motion';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export default function ConfirmModal({
  isOpen, title, message,
  confirmLabel = '삭제', cancelLabel = '취소',
  onConfirm, onCancel, danger = true,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={e => { e.stopPropagation(); onCancel(); }}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-x-6 top-1/2 -translate-y-1/2 z-50 bg-surface rounded-2xl p-6 shadow-overlay max-w-sm mx-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-headline1 font-bold text-label-strong mb-2 text-center">{title}</h3>
            {message && (
              <p className="text-body2 text-label-alt text-center leading-relaxed mb-5">{message}</p>
            )}
            {!message && <div className="mb-5" />}
            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.12 }}
                onClick={e => { e.stopPropagation(); onCancel(); }}
                className="flex-1 h-11 rounded-lg bg-fill text-label font-bold text-body2 hover:bg-fill-strong transition-colors"
              >
                {cancelLabel}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.98 }}
                transition={{ duration: 0.12 }}
                onClick={e => { e.stopPropagation(); onConfirm(); }}
                className={`flex-1 h-11 rounded-lg text-white font-bold text-body2 transition-colors ${danger ? 'bg-negative hover:opacity-90' : 'bg-primary hover:bg-primary-strong'}`}
              >
                {confirmLabel}
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
