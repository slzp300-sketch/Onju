import { useSavedDrafts } from '../hooks/useSavedDrafts';
import { useRecordDeletionIds } from '../hooks/useRecordDeletionIds';
import { useLocalDraft } from '../hooks/useLocalDraft';
import { useAuthStore } from '../store/authStore';
import { useFormProtection } from '../hooks/useFormProtection';
import { useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Trash2, Smile, Laugh, Meh, Frown, CloudRain } from '../icons';
import { motion } from 'framer-motion';
import { format, addDays, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useDiaryStore } from '../store/diaryStore';
import { today } from '../utils/date';
import { DIARY_MOODS as MOODS } from '../utils/diaryStats';
import type { DiaryMood, DiaryEntry } from '../types';
import ConfirmModal from '../components/ui/ConfirmModal';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { useUIStore } from '../store/uiStore';
import { toast } from '../store/toastStore';

const MOOD_ICONS = { great: Laugh, good: Smile, neutral: Meh, down: Frown, bad: CloudRain };

type DiaryEditorHandle = { requestLeave: (leave: () => void) => void };

function isDiarySummary(v:unknown):v is {content:string}{return !!v&&typeof v==='object'&&typeof (v as {content?:unknown}).content==='string';}
export default function Diary() {
  const navigate = useNavigate();
  const location = useLocation();
  const todayStr = today();
  const owner = useAuthStore(s => s.user?.id);
  const editor = useRef<DiaryEditorHandle>(null);
  const dataHydrated = useUIStore(s => s.dataHydrated);
  const leave = () => { if (window.history.state?.idx > 0) navigate(-1); else navigate('/'); };

  // 통계 등에서 특정 날짜로 진입할 수 있음 (없으면 오늘)
  const initialDate = (location.state as { date?: string } | null)?.date ?? todayStr;
  const [date, setDate] = useState(initialDate <= todayStr ? initialDate : todayStr);

  const drafts=useSavedDrafts('diary:',isDiarySummary);
  const isToday = date === todayStr;

  const shiftDate = (days: number) => {
    const next = format(addDays(parseISO(date), days), 'yyyy-MM-dd');
    if (next > todayStr) return; // 미래는 불가
    editor.current?.requestLeave(() => setDate(next));
  };

  if (!dataHydrated) return <LoadingSpinner />;
  return (
    <div className="records-paper min-h-dvh flex flex-col">
      {/* 헤더 */}
      <div className="records-paper-header flex items-center px-4 pt-5 pb-3">
        <motion.button
          whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
          onClick={() => editor.current?.requestLeave(leave)} aria-label="뒤로 가기" className="paper-back-button text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">하루 일기</h1>
        <div className="w-8" />
      </div>

      {/* 날짜 네비게이션 */}
      <div className="diary-date-strip flex items-center justify-center gap-4 px-4 py-4">
        <motion.button
          whileTap={{ scale: 0.9 }} transition={{ duration: 0.1 }}
          onClick={() => shiftDate(-1)} aria-label="이전 날짜" className="min-w-11 min-h-11 grid place-items-center text-label-alt">
          <ChevronLeft size={20} />
        </motion.button>
        <div className="text-center min-w-[140px]">
          <p className="text-body1 font-bold text-label-strong">
            {format(parseISO(date), 'M월 d일 (EEE)', { locale: ko })}
          </p>
          {isToday && <p className="text-caption2 font-bold text-primary mt-0.5">오늘</p>}
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }} transition={{ duration: 0.1 }}
          onClick={() => shiftDate(1)} disabled={isToday}
          aria-label="다음 날짜" className="min-w-11 min-h-11 grid place-items-center text-label-alt disabled:opacity-25">
          <ChevronRight size={20} />
        </motion.button>
      </div>

      {drafts.error&&<p role="alert" className="px-4">남겨둔 일기 초안을 읽지 못했어요.</p>}
      {drafts.drafts.some(d=>d.document!==`diary:${date}`)&&<details className="mx-4 rounded-xl border border-line p-3"><summary className="min-h-11 font-bold">다른 날의 일기 초안</summary>{drafts.drafts.filter(d=>d.document!==`diary:${date}`).map(d=><button className="block min-h-11 w-full text-left text-primary" key={d.document} onClick={()=>editor.current?.requestLeave(()=>setDate(d.document.slice(6)))}>{d.document.slice(6)} 초안 이어 쓰기</button>)}</details>}
      {/* 날짜별 에디터 — key로 날짜가 바뀔 때 상태 재초기화 */}
      <DiaryEditor key={`${owner}:${date}`} ref={editor} date={date} onClose={leave} />
    </div>
  );
}

function DiaryEditor({ date, onClose, ref }: { date: string; onClose: () => void; ref: Ref<DiaryEditorHandle> }) {
  const { getEntry, saveEntry, removeEntry } = useDiaryStore();
  const existing = getEntry(date);

  const [base,setBase]=useState<DiaryEntry|null>(existing??null);
  const pendingDelete=useRecordDeletionIds().includes(`diary:${date}`);
  const [mood, setMood] = useState<DiaryMood | null>(existing?.mood ?? null);
  const [content, setContent] = useState(existing?.content ?? '');
  const [deleting, setDeleting] = useState(false);
  const draft = useLocalDraft({ document: `diary:${date}`, values: { base, mood, content },
    validate: (value): value is { base?: DiaryEntry|null; mood: DiaryMood | null; content: string } => {
      if (!value || typeof value !== 'object') return false;
      const v = value as { base?: DiaryEntry|null; mood: unknown; content: unknown };
      return (v.base===undefined||v.base===null||(typeof v.base==='object'&&typeof v.base.date==='string'&&typeof v.base.content==='string'&&(v.base.revision===undefined||typeof v.base.revision==='string'))) && typeof v.content === 'string' && (v.mood === null || MOODS.some(m => m.key === v.mood));
    }, restore: value => { setBase(value.base===null?null:value.base?.date===date?value.base:{...(existing??{date,mood:null,content:'',updatedAt:''}),revision:undefined}); setMood(value.mood); setContent(value.content); } });
  const protection = useFormProtection({ mood, content }, draft.leaveMessage);
  useImperativeHandle(ref, () => ({ requestLeave: protection.requestLeave }), [protection.requestLeave]);

  const hasContent = content.trim().length > 0 || mood !== null;

  const handleSave = () => {
    if (!hasContent || draft.awaitingChoice || pendingDelete) return;
    if (!protection.save(() => saveEntry(date, mood, content.trim(),base))) return;
    draft.clear();
    toast.success('일기를 기기에 보관했어요. 연결되면 서버에 저장해요.');
    onClose();
  };

  const handleDelete = () => {
    if(pendingDelete || !base)return;
    if(!protection.save(()=>removeEntry(date,base)))return;
    setDeleting(false);onClose();
  };

  return (
    <>
      <div className="flex-1 px-4 py-5 flex flex-col gap-5 pb-28">
        {draft.banner}
        {pendingDelete&&<p role="status">삭제 결과를 확인하고 있어요. 서버 확인 전까지 기록을 유지해요.</p>}
        <fieldset disabled={draft.awaitingChoice || pendingDelete} className="contents">
        {/* 기분 선택 */}
        <div>
          <p className="text-caption1 font-bold text-label-alt mb-3">오늘 기분은 어땠나요?</p>
          <div className="flex justify-between gap-2">
            {MOODS.map(m => {
              const active = mood === m.key;
              const MoodIcon = MOOD_ICONS[m.key];
              return (
                <motion.button
                  key={m.key}
                  whileTap={{ scale: 0.9 }} transition={{ duration: 0.1 }}
                  onClick={() => setMood(active ? null : m.key)}
                  aria-pressed={active}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-colors ${
                    active ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'
                  }`}
                >
                  <MoodIcon size={25} strokeWidth={1.7} />
                  <span className={`text-caption2 font-bold ${active ? 'text-primary' : 'text-label-assistive'}`}>
                    {m.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        {/* 본문 */}
        <div className="flex-1 flex flex-col">
          <p className="text-caption1 font-bold text-label-alt mb-2">오늘 하루 기록</p>
          <textarea
            aria-label="오늘 하루 기록"
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="오늘 하루는 어땠나요? 자유롭게 기록해보세요."
            className="records-paper-editor flex-1 min-h-[200px] p-4 text-body2 leading-relaxed text-label resize-none"
          />
          {existing && (
            <button
              onClick={() => setDeleting(true)}
              className="self-end mt-2 flex min-h-11 items-center gap-1 text-caption1 text-label-alt hover:text-negative transition-colors px-2 py-1">
              <Trash2 size={13} />
              이 날 일기 삭제
            </button>
          )}
        </div>
        </fieldset>
      </div>

      {/* 저장 버튼 */}
      <div className="form-paper-footer fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4"
        style={{ paddingBottom: 'max(1rem, var(--app-safe-bottom))' }}>
        <motion.button
          whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
          onClick={handleSave}
          disabled={!hasContent || draft.awaitingChoice || pendingDelete}
          className="w-full h-12 mt-3 rounded-lg bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors flex items-center justify-center gap-1.5"
        >
          저장하기
        </motion.button>
      </div>
      <ConfirmModal isOpen={deleting} title="이 날 일기를 삭제할까요?" message="확인한 기분과 내용을 삭제해요. 다른 기기에서 바뀌었다면 멈추고 비교해요."
        onCancel={() => setDeleting(false)} onConfirm={handleDelete} />
      {protection.guard}
    </>
  );
}
