import type { RoutineLog } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { useLocalDraft } from '../../hooks/useLocalDraft';
import { useId, useState } from 'react';
import OverlayDialog from '../ui/OverlayDialog';
import { useFormProtection } from '../../hooks/useFormProtection';
import { X } from '../../icons';
import Button from '../ui/Button';
import { parseFaithMemo, type PrayerCategory, type PrayerMemoData } from '../../utils/faithMemo';

interface PrayerMemoProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (memo: string, base?: RoutineLog) => void;
  baseLog?: RoutineLog;
  initialMemo?: string;
  draftKey?: string;
}

const CATEGORIES: PrayerCategory[] = ['개인', '직장', '가족', '중보'];

export default function PrayerMemo(props: PrayerMemoProps) {
  const owner=useAuthStore(s=>s.user?.id);
  return props.isOpen ? <PrayerMemoEditor key={owner} {...props} /> : null;
}

function PrayerMemoEditor({ isOpen, onClose, onSave, initialMemo, draftKey, baseLog }: PrayerMemoProps) {
  const [base,setBase]=useState(baseLog);
  const [initial]=useState(initialMemo);
  const existing = base?.memo ? tryParse(base.memo) : initial ? tryParse(initial) : null;
  const [category, setCategory] = useState<PrayerCategory>(existing?.category ?? '개인');
  const [content, setContent] = useState(existing?.content ?? '');

  const titleId = useId();
  const draft = useLocalDraft({ document: draftKey, values: { base, category, content },
    validate: (value): value is { base?: RoutineLog; category: PrayerCategory; content: string } => {
      if (!value || typeof value !== 'object') return false;
      const v = value as Record<string, unknown>; return (v.base===undefined||(!!v.base&&typeof v.base==='object'&&typeof (v.base as RoutineLog).routineId==='string'&&typeof (v.base as RoutineLog).date==='string')) && typeof v.content === 'string' && CATEGORIES.includes(v.category as PrayerCategory);
    }, restore: v => { setBase(v.base?.routineId===baseLog?.routineId&&v.base?.date===baseLog?.date?v.base:baseLog?{...baseLog,memoRevision:undefined}:undefined); setCategory(v.category); setContent(v.content); } });
  const protection = useFormProtection({ category, content }, draft.leaveMessage);
  const requestClose = () => protection.requestLeave(onClose);

  const handleSave = () => {
    if(draft.awaitingChoice)return;
    // 수정 시 기존 응답 상태를 보존한다
    const data: PrayerMemoData = { type: 'prayer', category, content, answered: existing?.answered ?? false };
    if (protection.save(() => onSave(JSON.stringify(data),base))) { draft.clear(); onClose(); }
  };

  return (
    <>
      <OverlayDialog isOpen={isOpen} onClose={requestClose} labelledBy={titleId} variant="sheet" className="memo-editor-sheet">
            <div className="memo-editor-header">
              <h3 id={titleId} className="font-bold text-label-strong">기도 메모</h3>
              <button onClick={requestClose} aria-label="기도 메모 닫기" className="flex size-11 items-center justify-center"><X size={20} className="text-label-alt" /></button>
            </div>

            <div className="memo-editor-body">
            {draft.banner}
            <fieldset disabled={draft.awaitingChoice} className="contents">
            <div className="flex gap-2 mb-4">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  aria-pressed={category === cat}
                  onClick={() => setCategory(cat)}
                  className={`min-h-11 flex-1 py-1.5 rounded-lg text-caption1 font-medium transition-colors ${
                    category === cat
                      ? 'bg-primary-soft text-primary ring-1 ring-primary'
                      : 'bg-fill text-label-alt'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <textarea
              aria-label="기도 내용"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="기도 제목이나 내용을 적어보세요..."
              rows={4}
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

function tryParse(memo: string): PrayerMemoData | null {
  const parsed = parseFaithMemo(memo);
  return parsed?.type === 'prayer' ? parsed : null;
}
