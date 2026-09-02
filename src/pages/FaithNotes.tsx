import { useMemo } from 'react';
import { ChevronLeft, Feather, Sparkles } from '../icons';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import EmptyState from '../components/ui/EmptyState';
import { useRoutineStore } from '../store/routineStore';
import { useSettingsStore } from '../store/settingsStore';
import { toast } from '../store/toastStore';
import { parseFaithMemo, type FaithMemoData } from '../utils/faithMemo';
import { getWeekRangeFor } from '../utils/date';
import { WEEKDAY_LABELS } from '../types';

interface Note {
  routineId: string;
  routineTitle?: string;
  date: string;
  memo: FaithMemoData;
}

/** 은혜 기록 — 신앙 루틴에 남긴 말씀·기도 기록의 날짜별 아카이브 */
export default function FaithNotes() {
  const navigate = useNavigate();
  const { logs, personalRoutines, faithRoutines, updateLogMemo } = useRoutineStore();
  const weekStartDay = useSettingsStore(s => s.weekStartDay);

  const notes = useMemo<Note[]>(() => {
    const titleOf = (id: string) =>
      [...faithRoutines, ...personalRoutines].find(r => r.id === id)?.title;
    return logs
      .flatMap(l => {
        const memo = parseFaithMemo(l.memo);
        return memo ? [{ routineId: l.routineId, routineTitle: titleOf(l.routineId), date: l.date, memo }] : [];
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [logs, faithRoutines, personalRoutines]);

  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const weekStartIso = format(getWeekRangeFor(new Date(), weekStartDay).start, 'yyyy-MM-dd');
  const thisWeekCount = notes.filter(n => n.date >= weekStartIso).length;
  const answeredCount = notes.filter(n => n.memo.type === 'prayer' && n.memo.answered).length;

  // 연속 기록 — 오늘(또는 어제)부터 하루도 빠짐없이 기록한 날 수
  const streak = useMemo(() => {
    const days = new Set(notes.map(n => n.date));
    let count = 0;
    const cursor = new Date();
    if (!days.has(format(cursor, 'yyyy-MM-dd'))) cursor.setDate(cursor.getDate() - 1);
    while (days.has(format(cursor, 'yyyy-MM-dd'))) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [notes]);

  const byDate = useMemo(() => {
    const map = new Map<string, Note[]>();
    for (const n of notes) {
      if (!map.has(n.date)) map.set(n.date, []);
      map.get(n.date)!.push(n);
    }
    return [...map.entries()];
  }, [notes]);

  const dateLabel = (iso: string) => {
    const d = new Date(iso + 'T12:00:00');
    const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[d.getDay()]})`;
    if (iso === todayIso) return `오늘 · ${base}`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (iso === format(yesterday, 'yyyy-MM-dd')) return `어제 · ${base}`;
    return base;
  };

  const toggleAnswered = (note: Note) => {
    if (note.memo.type !== 'prayer') return;
    const next = { ...note.memo, answered: !note.memo.answered };
    updateLogMemo(note.routineId, note.date, JSON.stringify(next));
    if (next.answered) toast.success('응답받은 기도로 기록했어요 ✨');
  };

  return (
    <div className="records-paper flex min-h-full flex-col gap-4 pb-8">
      <div className="px-4 pt-5 flex items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
          onClick={() => navigate(-1)} aria-label="뒤로 가기" className="paper-back-button text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <div>
          <h1 className="text-heading2 font-bold text-label-strong font-brand">은혜 기록</h1>
          <p className="text-caption1 text-label-alt mt-0.5">쌓여가는 말씀과 기도</p>
        </div>
      </div>

      {/* 통계 */}
      <div className="px-4 grid grid-cols-3 gap-2">
        <div className="records-summary-card py-3 text-center">
          <p className="text-headline1 font-bold text-label-strong tabular-nums">{thisWeekCount}<span className="text-caption1 text-label-alt font-semibold">개</span></p>
          <p className="text-caption2 font-semibold text-label-assistive mt-0.5">이번 주 기록</p>
        </div>
        <div className="records-summary-card py-3 text-center">
          <p className="text-headline1 font-bold text-faith tabular-nums">{answeredCount}<span className="text-caption1 text-label-alt font-semibold">개</span></p>
          <p className="text-caption2 font-semibold text-label-assistive mt-0.5">응답받은 기도</p>
        </div>
        <div className="records-summary-card py-3 text-center">
          <p className="text-headline1 font-bold text-label-strong tabular-nums">{streak}<span className="text-caption1 text-label-alt font-semibold">일</span></p>
          <p className="text-caption2 font-semibold text-label-assistive mt-0.5">연속 기록</p>
        </div>
      </div>

      {/* 아카이브 */}
      {notes.length === 0 ? (
        <div className="px-4 pt-8">
          <EmptyState
            title="아직 남긴 기록이 없어요"
            description="신앙 루틴을 완료하면 말씀·기도 기록을 남길 수 있어요"
          />
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-2">
          {byDate.map(([date, dayNotes]) => (
            <div key={date}>
              <p className="text-caption2 font-bold text-label-assistive px-1 pt-2 pb-1.5">{dateLabel(date)}</p>
              <div className="flex flex-col gap-2">
                {dayNotes.map((n, i) => (
                  <div key={`${n.routineId}:${i}`}
                    className={`records-entry-card px-4 py-3.5 border-l-[3px] ${
                      n.memo.type === 'bible' ? 'border-l-faith' : 'border-l-emerald-500'
                    }`}
                  >
                    {n.memo.type === 'bible' ? (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-faith bg-faith-soft px-2 py-0.5 rounded-full">말씀</span>
                          <p className="text-caption1 font-bold text-label-strong">
                            {n.memo.book} {n.memo.chapter}:{n.memo.verse}
                          </p>
                        </div>
                        {n.memo.reflection && (
                          <p className="text-body2 text-label leading-relaxed mt-2">{n.memo.reflection}</p>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">기도</span>
                          <p className="text-caption2 text-label-assistive">{n.memo.category}</p>
                        </div>
                        <p className="text-body2 text-label leading-relaxed mt-2">{n.memo.content}</p>
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggleAnswered(n)}
                          className={`mt-2.5 inline-flex items-center gap-1.5 text-caption1 font-bold px-3 py-1.5 rounded-full border transition-colors ${
                            n.memo.answered
                              ? 'border-faith/40 bg-faith-soft text-faith'
                              : 'border-line text-label-alt'
                          }`}
                        >
                          {n.memo.answered ? <><Sparkles size={12} /> 응답받았어요</> : '응답 체크'}
                        </motion.button>
                      </>
                    )}
                    {n.routineTitle && (
                      <p className="text-caption2 text-label-assistive mt-2 flex items-center gap-1">
                        <Feather size={10} /> {n.routineTitle}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
