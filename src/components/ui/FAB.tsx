import { useState } from 'react';
import { Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface FABOption {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
  color?: string; // tailwind bg class
}

interface FABProps {
  options: FABOption[];
}

export default function FAB({ options }: FABProps) {
  const [open, setOpen] = useState(false);

  const close = () => setOpen(false);

  return (
    <>
      {/* 배경 딤 */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30"
            onClick={close}
          />
        )}
      </AnimatePresence>

      {/* FAB + 옵션 */}
      <div
        className="fixed right-5 z-40 flex flex-col items-end gap-3"
        style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom, 0px) + 0.75rem)' }}
      >
        {/* 옵션 목록 */}
        <AnimatePresence>
          {open && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-end gap-2.5"
            >
              {[...options].reverse().map((opt, i) => (
                <motion.button
                  key={i}
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.9 }}
                  transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 28 }}
                  onClick={() => { opt.onClick(); close(); }}
                  className="flex items-center gap-3"
                >
                  {/* 텍스트 레이블 */}
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900 drop-shadow-sm">{opt.label}</p>
                    {opt.sub && <p className="text-xs text-gray-500">{opt.sub}</p>}
                  </div>
                  {/* 아이콘 원 */}
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg text-white ${opt.color ?? 'bg-gray-800'}`}>
                    {opt.icon}
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 메인 + 버튼 */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setOpen(v => !v)}
          className="w-14 h-14 rounded-full bg-indigo-500 text-white shadow-xl shadow-indigo-200 flex items-center justify-center"
        >
          <motion.div
            animate={{ rotate: open ? 45 : 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          >
            <Plus size={26} strokeWidth={2.5} />
          </motion.div>
        </motion.button>
      </div>
    </>
  );
}
