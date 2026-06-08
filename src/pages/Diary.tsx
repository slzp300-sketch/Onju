import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Trash2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, addDays, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { useDiaryStore } from '../store/diaryStore';
import { today } from '../utils/date';
import { DIARY_MOODS as MOODS } from '../utils/diaryStats';
import type { DiaryMood } from '../types';

export default function Diary() {
  const navigate = useNavigate();
  const location = useLocation();
  const todayStr = today();

  // 통계 등에서 특정 날짜로 진입할 수 있음 (없으면 오늘)
  const initialDate = (location.state as { date?: string } | null)?.date ?? todayStr;
  const [date, setDate] = useState(initialDate <= todayStr ? initialDate : todayStr);

  const isToday = date === todayStr;

  const shiftDate = (days: number) => {
    const next = format(addDays(parseISO(date), days), 'yyyy-MM-dd');
    if (next > todayStr) return; // 미래는 불가
    setDate(next);
  };

  return (
    <div className="min-h-dvh bg-surface-alt flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-surface border-b border-line-soft">
        <motion.button
          whileTap={{ scale: 0.92 }} transition={{ duration: 0.1 }}
          onClick={() => navigate(-1)} className="p-1 -ml-1 text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">하루 일기</h1>
        <div className="w-8" />
      </div>

      {/* 날짜 네비게이션 */}
      <div className="flex items-center justify-center gap-4 px-4 py-4 bg-surface border-b border-line-soft">
        <motion.button
          whileTap={{ scale: 0.9 }} transition={{ duration: 0.1 }}
          onClick={() => shiftDate(-1)} className="p-1 text-label-alt">
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
          className="p-1 text-label-alt disabled:opacity-25">
          <ChevronRight size={20} />
        </motion.button>
      </div>

      {/* 날짜별 에디터 — key로 날짜가 바뀔 때 상태 재초기화 */}
      <DiaryEditor key={date} date={date} onClose={() => navigate(-1)} />
    </div>
  );
}

function DiaryEditor({ date, onClose }: { date: string; onClose: () => void }) {
  const { getEntry, saveEntry, removeEntry } = useDiaryStore();
  const existing = getEntry(date);

  const [mood, setMood] = useState<DiaryMood | null>(existing?.mood ?? null);
  const [content, setContent] = useState(existing?.content ?? '');
  const [saved, setSaved] = useState(false);

  const hasContent = content.trim().length > 0 || mood !== null;

  const handleSave = () => {
    if (!hasContent) return;
    saveEntry(date, mood, content.trim());
    setSaved(true);
    setTimeout(onClose, 600);
  };

  const handleDelete = () => {
    removeEntry(date);
    setMood(null);
    setContent('');
  };

  return (
    <>
      <div className="flex-1 px-4 py-5 flex flex-col gap-5 pb-28">
        {/* 기분 선택 */}
        <div>
          <p className="text-caption1 font-bold text-label-alt mb-3">오늘 기분은 어땠나요?</p>
          <div className="flex justify-between gap-2">
            {MOODS.map(m => {
              const active = mood === m.key;
              return (
                <motion.button
                  key={m.key}
                  whileTap={{ scale: 0.9 }} transition={{ duration: 0.1 }}
                  onClick={() => setMood(active ? null : m.key)}
                  className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 transition-colors ${
                    active ? 'border-primary bg-primary-soft' : 'border-line bg-surface'
                  }`}
                >
                  <span className={`text-2xl transition-transform ${active ? 'scale-110' : ''}`}>{m.emoji}</span>
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
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="오늘 하루는 어땠나요? 자유롭게 기록해보세요."
            className="flex-1 min-h-[200px] bg-surface border border-line rounded-xl p-4 text-body2 leading-relaxed text-label resize-none focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(0,102,255,0.15)] shadow-emphasize transition-all"
          />
          {existing && (
            <button
              onClick={handleDelete}
              className="self-end mt-2 flex items-center gap-1 text-caption1 text-label-assistive hover:text-negative transition-colors px-1 py-1">
              <Trash2 size={13} />
              이 날 일기 삭제
            </button>
          )}
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-surface border-t border-line-soft"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <motion.button
          whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
          onClick={handleSave}
          disabled={!hasContent || saved}
          className="w-full h-12 mt-3 rounded-lg bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors flex items-center justify-center gap-1.5"
        >
          {saved ? (<><Check size={18} /> 저장됐어요</>) : '저장하기'}
        </motion.button>
      </div>
    </>
  );
}
