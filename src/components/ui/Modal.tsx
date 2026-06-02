import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  onOpenComplete?: () => void;
}

export default function Modal({ isOpen, onClose, title, children, onOpenComplete }: ModalProps) {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      onOpenComplete?.();
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed bottom-0 left-0 right-0 bg-surface rounded-t-3xl z-50 max-h-[90dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between p-4 border-b border-line-soft">
              {title && <h2 className="text-headline1 font-bold text-label-strong">{title}</h2>}
              <button onClick={onClose} className="ml-auto p-1 text-label-assistive hover:text-label-alt transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="p-4">{children}</div>
            <div className="h-safe-area-inset-bottom" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
