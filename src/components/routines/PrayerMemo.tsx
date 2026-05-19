import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import Button from '../ui/Button';

type PrayerCategory = '개인' | '직장' | '가족' | '중보';

interface PrayerMemoData {
  type: 'prayer';
  category: PrayerCategory;
  content: string;
  answered: boolean;
}

interface PrayerMemoProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (memo: string) => void;
  initialMemo?: string;
}

const CATEGORIES: PrayerCategory[] = ['개인', '직장', '가족', '중보'];

export default function PrayerMemo({ isOpen, onClose, onSave, initialMemo }: PrayerMemoProps) {
  const existing = initialMemo ? tryParse(initialMemo) : null;
  const [category, setCategory] = useState<PrayerCategory>(existing?.category ?? '개인');
  const [content, setContent] = useState(existing?.content ?? '');

  const handleSave = () => {
    const data: PrayerMemoData = { type: 'prayer', category, content, answered: false };
    onSave(JSON.stringify(data));
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 px-4 pb-6"
          onClick={onClose}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 32 }}
            className="bg-white rounded-3xl p-6 w-full max-w-md shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">기도 메모</h3>
              <button onClick={onClose}><X size={20} className="text-gray-400" /></button>
            </div>

            <div className="flex gap-2 mb-4">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  onClick={() => setCategory(cat)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    category === cat
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="기도 제목이나 내용을 적어보세요..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-300 mb-4"
            />

            <Button fullWidth onClick={handleSave}>저장</Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function tryParse(memo: string): PrayerMemoData | null {
  try {
    const parsed = JSON.parse(memo);
    if (parsed?.type === 'prayer') return parsed as PrayerMemoData;
    return null;
  } catch {
    return null;
  }
}
