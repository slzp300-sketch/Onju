import { useState } from 'react';
import { Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface FABOption {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
  color?: string;
}

interface FABProps {
  options: FABOption[];
}

export default function FAB({ options }: FABProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-30"
            onClick={close}
          />
        )}
      </AnimatePresence>

      <div
        className="fixed right-5 z-40 flex flex-col items-end gap-3"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex flex-col items-end gap-2.5"
            >
              {[...options].reverse().map((opt, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.9 }}
                  transition={{ delay: i * 0.04, duration: 0.18, ease: 'easeOut' }}
                  onClick={() => { opt.onClick(); close(); }}
                  className="flex items-center gap-3"
                >
                  <div className="text-right">
                    <p className="text-label1 font-bold text-label-strong drop-shadow-sm">{opt.label}</p>
                    {opt.sub && <p className="text-caption1 text-label-alt">{opt.sub}</p>}
                  </div>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-strong text-white ${opt.color ?? 'bg-primary'}`}>
                    {opt.icon}
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.button
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.12 }}
          onClick={() => setOpen(v => !v)}
          className="w-14 h-14 rounded-full bg-primary text-white shadow-strong flex items-center justify-center"
        >
          <motion.div
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <Plus size={26} strokeWidth={2.5} />
          </motion.div>
        </motion.button>
      </div>
    </>
  );
}
