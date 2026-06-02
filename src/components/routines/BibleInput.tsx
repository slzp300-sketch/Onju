import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown } from 'lucide-react';
import Button from '../ui/Button';

interface BibleInputData {
  type: 'bible';
  book: string;
  chapter: number;
  verse: number;
  reflection: string;
}

interface BibleInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (memo: string) => void;
  initialMemo?: string;
}

const BIBLE_BOOKS = [
  '창세기', '출애굽기', '레위기', '민수기', '신명기',
  '여호수아', '사사기', '룻기', '사무엘상', '사무엘하',
  '열왕기상', '열왕기하', '역대상', '역대하', '에스라',
  '느헤미야', '에스더', '욥기', '시편', '잠언',
  '전도서', '아가', '이사야', '예레미야', '예레미야애가',
  '에스겔', '다니엘', '호세아', '요엘', '아모스',
  '오바댜', '요나', '미가', '나훔', '하박국',
  '스바냐', '학개', '스가랴', '말라기',
  '마태복음', '마가복음', '누가복음', '요한복음', '사도행전',
  '로마서', '고린도전서', '고린도후서', '갈라디아서', '에베소서',
  '빌립보서', '골로새서', '데살로니가전서', '데살로니가후서', '디모데전서',
  '디모데후서', '디도서', '빌레몬서', '히브리서', '야고보서',
  '베드로전서', '베드로후서', '요한1서', '요한2서', '요한3서',
  '유다서', '요한계시록',
];

export default function BibleInput({ isOpen, onClose, onSave, initialMemo }: BibleInputProps) {
  const existing = initialMemo ? tryParse(initialMemo) : null;
  const [book, setBook] = useState(existing?.book ?? '빌립보서');
  const [chapter, setChapter] = useState(existing?.chapter ?? 4);
  const [verse, setVerse] = useState(existing?.verse ?? 13);
  const [reflection, setReflection] = useState(existing?.reflection ?? '');

  const handleSave = () => {
    const data: BibleInputData = { type: 'bible', book, chapter, verse, reflection };
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
            className="bg-surface rounded-3xl p-6 w-full max-w-md shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-bold text-label-strong">말씀 기록</h3>
              <button onClick={onClose}><X size={20} className="text-label-alt" /></button>
            </div>

            {/* 성경 선택 */}
            <div className="flex gap-2 mb-4">
              <div className="relative flex-1">
                <select
                  value={book}
                  onChange={e => setBook(e.target.value)}
                  className="w-full appearance-none border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:ring-2 focus:ring-primary pr-8"
                >
                  {BIBLE_BOOKS.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-3 text-label-alt pointer-events-none" />
              </div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={chapter}
                  onChange={e => setChapter(Number(e.target.value))}
                  min={1}
                  className="w-14 border border-line rounded-xl px-2 py-2.5 text-body2 text-center focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-caption1 text-label-alt">장</span>
                <input
                  type="number"
                  value={verse}
                  onChange={e => setVerse(Number(e.target.value))}
                  min={1}
                  className="w-14 border border-line rounded-xl px-2 py-2.5 text-body2 text-center focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-caption1 text-label-alt">절</span>
              </div>
            </div>

            <p className="text-caption2 font-semibold text-label-alt mb-2">
              {book} {chapter}:{verse}
            </p>

            <textarea
              value={reflection}
              onChange={e => setReflection(e.target.value)}
              placeholder="오늘 말씀을 통해 받은 은혜를 한 줄로 적어보세요..."
              rows={3}
              className="w-full border border-line rounded-xl px-3 py-2.5 text-body2 resize-none focus:outline-none focus:ring-2 focus:ring-primary mb-4"
            />

            <Button fullWidth onClick={handleSave}>저장</Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function tryParse(memo: string): BibleInputData | null {
  try {
    const parsed = JSON.parse(memo);
    if (parsed?.type === 'bible') return parsed as BibleInputData;
    return null;
  } catch {
    return null;
  }
}
