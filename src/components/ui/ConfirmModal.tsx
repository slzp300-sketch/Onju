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
          {/* 딤 */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50"
            onClick={e => { e.stopPropagation(); onCancel(); }}
          />
          {/* 모달 */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 10 }}
            transition={{ type: 'spring', stiffness: 400, damping: 28 }}
            className="fixed inset-x-6 top-1/2 -translate-y-1/2 z-50 bg-white rounded-3xl p-6 shadow-2xl max-w-sm mx-auto"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-gray-900 mb-2 text-center">{title}</h3>
            {message && (
              <p className="text-sm text-gray-500 text-center leading-relaxed mb-5">{message}</p>
            )}
            {!message && <div className="mb-5" />}
            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                onClick={e => { e.stopPropagation(); onCancel(); }}
                className="flex-1 py-3 rounded-2xl bg-gray-100 text-gray-700 text-sm font-semibold"
              >
                {cancelLabel}
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                onClick={e => { e.stopPropagation(); onConfirm(); }}
                className={`flex-1 py-3 rounded-2xl text-white text-sm font-semibold ${danger ? 'bg-red-500' : 'bg-indigo-500'}`}
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
