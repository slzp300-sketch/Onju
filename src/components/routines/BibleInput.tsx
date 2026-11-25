import type { RoutineLog } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { useLocalDraft } from '../../hooks/useLocalDraft';
import { useId, useState } from 'react';
import OverlayDialog from '../ui/OverlayDialog';
import { useFormProtection } from '../../hooks/useFormProtection';
import { X, ChevronDown } from '../../icons';
import Button from '../ui/Button';
import { parseFaithMemo, type BibleMemoData } from '../../utils/faithMemo';

interface BibleInputProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (memo: string, base?: RoutineLog) => void;
  baseLog?: RoutineLog;
  initialMemo?: string;
  draftKey?: string;
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

export default function BibleInput(props: BibleInputProps) {
  const owner=useAuthStore(s=>s.user?.id);
  return props.isOpen ? <BibleInputEditor key={owner} {...props} /> : null;
}

function BibleInputEditor({ isOpen, onClose, onSave, initialMemo, draftKey, baseLog }: BibleInputProps) {
  const [base,setBase]=useState(baseLog);
  const [initial]=useState(initialMemo);
  const existing = base?.memo ? tryParse(base.memo) : initial ? tryParse(initial) : null;
  const [book, setBook] = useState(existing?.book ?? '빌립보서');
  const [chapter, setChapter] = useState(existing?.chapter ?? 4);
  const [verse, setVerse] = useState(existing?.verse ?? 13);
  const [reflection, setReflection] = useState(existing?.reflection ?? '');

  const titleId = useId();
  const draft = useLocalDraft({ document: draftKey, values: { base, book, chapter, verse, reflection },
    validate: (value): value is { base?: RoutineLog; book: string; chapter: number; verse: number; reflection: string } => {
      if (!value || typeof value !== 'object') return false;
      const v = value as Record<string, unknown>; return (v.base===undefined||(!!v.base&&typeof v.base==='object'&&typeof (v.base as RoutineLog).routineId==='string'&&typeof (v.base as RoutineLog).date==='string')) && typeof v.reflection === 'string' && typeof v.book === 'string' && BIBLE_BOOKS.includes(v.book) && typeof v.chapter === 'number' && typeof v.verse === 'number';
    }, restore: v => { setBase(v.base?.routineId===baseLog?.routineId&&v.base?.date===baseLog?.date?v.base:baseLog?{...baseLog,memoRevision:undefined}:undefined); setBook(v.book); setChapter(v.chapter); setVerse(v.verse); setReflection(v.reflection); } });
  const protection = useFormProtection({ book, chapter, verse, reflection }, draft.leaveMessage);
  const requestClose = () => protection.requestLeave(onClose);

  const handleSave = () => {
    if(draft.awaitingChoice)return;
    // 숫자 입력을 비우면 NaN이 되어 'null:null'로 저장되는 것을 방지
    const clamp = (n: number) => (Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1);
    const data: BibleMemoData = {
      type: 'bible', book, chapter: clamp(chapter), verse: clamp(verse), reflection,
    };
    if (protection.save(() => onSave(JSON.stringify(data),base))) { draft.clear(); onClose(); }
  };

  return (
    <>
      <OverlayDialog isOpen={isOpen} onClose={requestClose} labelledBy={titleId} variant="sheet" className="memo-editor-sheet">
            <div className="memo-editor-header">
              <h3 id={titleId} className="font-bold text-label-strong">말씀 기록</h3>
              <button onClick={requestClose} aria-label="말씀 기록 닫기" className="flex size-11 items-center justify-center"><X size={20} className="text-label-alt" /></button>
            </div>

            <div className="memo-editor-body">
            {draft.banner}
            <fieldset disabled={draft.awaitingChoice} className="contents">
            {/* 성경 선택 */}
            <div className="flex flex-wrap gap-2 mb-4">
              <div className="relative min-w-[120px] flex-1">
                <select
                  aria-label="성경 책"
                  value={book}
                  onChange={e => setBook(e.target.value)}
                  className="form-paper-field w-full min-h-11 appearance-none px-3 py-2.5 pr-8"
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
                  inputMode="numeric"
                  aria-label="장"
                  value={chapter}
                  onChange={e => setChapter(Number(e.target.value))}
                  min={1}
                  className="form-paper-field w-14 min-h-11 px-2 py-2.5 text-center"
                />
                <span className="text-caption1 text-label-alt">장</span>
                <input
                  type="number"
                  inputMode="numeric"
                  aria-label="절"
                  value={verse}
                  onChange={e => setVerse(Number(e.target.value))}
                  min={1}
                  className="form-paper-field w-14 min-h-11 px-2 py-2.5 text-center"
                />
                <span className="text-caption1 text-label-alt">절</span>
              </div>
            </div>

            <p className="text-caption2 font-semibold text-label-alt mb-2">
              {book} {chapter}:{verse}
            </p>

            <textarea
              aria-label="말씀 묵상"
              value={reflection}
              onChange={e => setReflection(e.target.value)}
              placeholder="오늘 말씀을 통해 받은 은혜를 한 줄로 적어보세요..."
              rows={3}
              className="form-paper-field w-full px-3 py-2.5 resize-none"
            />

            </fieldset>
            </div>
            <div className="memo-editor-actions">
            <Button fullWidth disabled={draft.awaitingChoice} onClick={handleSave}>저장</Button>
            <button
              onClick={requestClose}
              className="min-h-11 w-full text-center text-caption1 font-semibold text-label-alt pt-3"
            >
              나중에 기록
            </button>
            </div>
      </OverlayDialog>
      {protection.guard}
    </>
  );
}

function tryParse(memo: string): BibleMemoData | null {
  const parsed = parseFaithMemo(memo);
  return parsed?.type === 'bible' ? parsed : null;
}
