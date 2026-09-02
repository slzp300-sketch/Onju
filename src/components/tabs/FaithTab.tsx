import { useMemo, useState } from 'react';
import { Trash2, BookOpen, Play, Timer, Church, Sunrise, Sun, Moon, Cloud, Zap, Feather, ChevronRight } from '../../icons';
import type { ReactNode } from 'react';
import StampButton from '../ui/StampButton';
import RowStamp from '../ui/RowStamp';
import ConfirmModal from '../ui/ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import FAB from '../ui/FAB';
import { useRoutineStore } from '../../store/routineStore';
import { today } from '../../utils/date';
import type { DailyRoutine, TimeSlot } from '../../types';
import FocusMode from '../routines/FocusMode';
import TwoMinuteMode from '../routines/TwoMinuteMode';
import BibleInput from '../routines/BibleInput';
import PrayerMemo from '../routines/PrayerMemo';
import { inferFaithKind, parseFaithMemo, faithMemoSummary } from '../../utils/faithMemo';
import OnjuIcon from '../ui/OnjuIcon';

const TIME_SLOTS: { value: TimeSlot; label: string; time: string; icon: ReactNode }[] = [
  { value: 'morning', label: '아침', time: '07:00', icon: <Sunrise size={15} strokeWidth={1.9} /> },
  { value: 'afternoon', label: '점심', time: '12:00', icon: <Sun size={15} strokeWidth={1.9} /> },
  { value: 'evening', label: '저녁', time: '21:00', icon: <Moon size={15} strokeWidth={1.9} /> },
];

export default function FaithTab({ date, readOnly = false }: { date?: string; readOnly?: boolean } = {}) {
  const { faithRoutines, removeRoutine, isCompleted, isSkipped, logs, updateLogMemo } = useRoutineStore();
  const viewDate = date ?? today();
  const navigate = useNavigate();
  const isDone = (id: string) => isCompleted(id, viewDate) || isSkipped(id, viewDate);

  // 기록 시트 대상 — 완료 직후 유도 또는 요약/칩 탭으로 열린다.
  // 닫을 때는 open만 끄고 대상은 유지해 시트의 exit 애니메이션이 살아 있게 한다.
  const [record, setRecord] = useState<{ routine: DailyRoutine; kind: 'bible' | 'prayer' } | null>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const memoOf = (routineId: string) =>
    useRoutineStore.getState().logs.find(l => l.routineId === routineId && l.date === viewDate)?.memo;
  const openRecord = (routine: DailyRoutine) => {
    // 기존 기록이 있으면 그 유형의 에디터로 — 제목이 바뀌어도 기록을 덮어쓰지 않는다
    const kind = parseFaithMemo(memoOf(routine.id))?.type ?? inferFaithKind(routine.title);
    if (!kind) return;
    setRecord({ routine, kind });
    setRecordOpen(true);
  };
  const promptRecord = (routine: DailyRoutine) => {
    // 스탬프 여운 뒤 부드럽게 제안 — 추론 불가한 루틴은 조용히 완료.
    // 발화 시점에 여전히 완료 상태이고 아직 기록이 없을 때만 연다 (더블탭 취소·재완료 대응).
    if (!inferFaithKind(routine.title)) return;
    setTimeout(() => {
      const log = useRoutineStore.getState().logs
        .find(l => l.routineId === routine.id && l.date === viewDate);
      if (log?.completed && !parseFaithMemo(log.memo)) openRecord(routine);
    }, 350);
  };
  const recordMemo = record
    ? logs.find(l => l.routineId === record.routine.id && l.date === viewDate)?.memo
    : undefined;

  // 은혜 기록 요약 (전 기간)
  const faithNoteCount = useMemo(
    () => logs.filter(l => parseFaithMemo(l.memo)).length,
    [logs],
  );

  const fabOptions = [
    {
      icon: <BookOpen size={20} />,
      label: '신앙 루틴 추가',
      sub: '템플릿 또는 직접 입력',
      color: 'bg-emerald-600',
      onClick: () => navigate('/faith-routines/new'),
    },
  ];

  // 시간대별 그룹핑
  const grouped = TIME_SLOTS.map(slot => ({
    ...slot,
    routines: faithRoutines.filter(r => r.timeSlot === slot.value),
  })).filter(g => g.routines.length > 0);
  const unslotted = faithRoutines.filter(r => !r.timeSlot);

  if (faithRoutines.length === 0) {
    return (
      <div className="relative">
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="w-20 h-20 rounded-3xl bg-faith-soft border border-faith/20 flex items-center justify-center text-faith mb-5 shadow-emphasize"><Church size={36} strokeWidth={1.9} /></div>
          <p className="text-headline1 font-bold text-label mb-1">신앙으로 하루를 시작해 보세요</p>
          <p className="text-body2 text-label-alt leading-relaxed">
            말씀과 기도로 쌓아가는 하루가<br />직장 생활의 든든한 버팀목이 돼요
          </p>
        </div>
        <FAB options={fabOptions} />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-3 px-3 pb-24">
      {/* 은혜 기록 진입 */}
      {!readOnly && (
        <button
          onClick={() => navigate('/faith-notes')}
          className="faith-note-card flex min-h-16 items-center gap-3 px-4 py-3 text-left hover:bg-faith-soft/70 transition-colors"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface/70 text-faith flex-shrink-0">
            <Feather size={19} strokeWidth={1.9} />
          </span>
          <span className="flex-1">
            <span className="block text-body2 font-bold text-label-strong">은혜 기록</span>
            {faithNoteCount > 0 && (
              <span className="block text-caption2 font-medium text-label-alt mt-0.5">차곡차곡 모은 말씀·기도 {faithNoteCount}개</span>
            )}
          </span>
          <ChevronRight size={15} className="text-label-assistive flex-shrink-0" />
        </button>
      )}

      {/* 시간대별 그룹 */}
      {grouped.map(group => {
        const cnt = group.routines.filter(r => isDone(r.id)).length;
        const allDone = cnt === group.routines.length;
        return (
          <section key={group.value} className="routine-paper-group overflow-hidden" aria-labelledby={`faith-${group.value}-title`}>
            <div className="flex items-center gap-2.5 px-4 py-3 bg-faith-soft/55 border-b border-line-soft">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface text-faith shadow-emphasize">{group.icon}</span>
              <span className="min-w-0 flex-1">
                <span id={`faith-${group.value}-title`} className="block text-label2 font-bold text-label-strong">{group.label} 루틴</span>
                <span className="block text-caption2 text-label-alt mt-0.5">{group.time} 무렵</span>
              </span>
              <span className={`text-caption2 font-bold px-2 py-1 rounded-lg ${allDone ? 'bg-faith-soft text-faith' : 'bg-fill text-label-alt'}`}>
                {cnt}/{group.routines.length}
              </span>
            </div>
            <div className="divide-y divide-line-soft">
              {group.routines.map((r, idx) => (
                <FaithRoutineRow
                  key={r.id}
                  routine={r}
                  index={idx + 1}
                  viewDate={viewDate}
                  readOnly={readOnly}
                  onRemove={() => removeRoutine(r.id)}
                  onCompleted={promptRecord}
                  onRecord={openRecord}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* 시간대 없는 루틴 */}
      {unslotted.length > 0 && (
        <section className="routine-paper-group overflow-hidden" aria-labelledby="faith-other-title">
          {grouped.length > 0 && (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-faith-soft/55 border-b border-line-soft">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface text-faith shadow-emphasize"><Church size={16} strokeWidth={1.9} /></span>
              <span id="faith-other-title" className="flex-1 text-label2 font-bold text-label-strong">기타 신앙 루틴</span>
              <span className={`text-caption2 font-bold px-2 py-0.5 rounded-full ${
                unslotted.filter(r => isDone(r.id)).length === unslotted.length
                  ? 'bg-faith-soft text-faith' : 'bg-fill text-label-alt'
              }`}>
                {unslotted.filter(r => isDone(r.id)).length}/{unslotted.length}
              </span>
            </div>
          )}
          <div className="divide-y divide-line-soft">
            {unslotted.map((r, idx) => (
              <FaithRoutineRow
                key={r.id}
                routine={r}
                index={idx + 1}
                viewDate={viewDate}
                readOnly={readOnly}
                onRemove={() => removeRoutine(r.id)}
                onCompleted={promptRecord}
                onRecord={openRecord}
              />
            ))}
          </div>
        </section>
      )}

      {!readOnly && <FAB options={fabOptions} />}

      {/* 기록 시트 — key로 대상별 상태 리셋, isOpen 토글로 exit 애니메이션 유지 */}
      {record?.kind === 'bible' && (
        <BibleInput
          key={`${record.routine.id}:${viewDate}:${recordMemo ?? ''}`}
          isOpen={recordOpen}
          onClose={() => setRecordOpen(false)}
          initialMemo={recordMemo}
          onSave={memo => updateLogMemo(record.routine.id, viewDate, memo)}
        />
      )}
      {record?.kind === 'prayer' && (
        <PrayerMemo
          key={`${record.routine.id}:${viewDate}:${recordMemo ?? ''}`}
          isOpen={recordOpen}
          onClose={() => setRecordOpen(false)}
          initialMemo={recordMemo}
          onSave={memo => updateLogMemo(record.routine.id, viewDate, memo)}
        />
      )}
    </div>
  );
}

/* ── 신앙 루틴 행 ── */
function FaithRoutineRow({ routine, index, viewDate, readOnly = false, onRemove, onCompleted, onRecord }: {
  routine: DailyRoutine;
  index: number;
  viewDate: string;
  readOnly?: boolean;
  onRemove: () => void;
  onCompleted: (routine: DailyRoutine) => void;
  onRecord: (routine: DailyRoutine) => void;
}) {
  const { toggleRoutineLog, skipRoutineLog, isCompleted, isSkipped, logs } = useRoutineStore();
  const navigate = useNavigate();
  const [focusOpen, setFocusOpen] = useState(false);
  const [twoMinOpen, setTwoMinOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rowStamp, setRowStamp] = useState<'done' | 'rest' | null>(null);
  const done = isCompleted(routine.id, viewDate);
  const skipped = isSkipped(routine.id, viewDate);
  const memo = parseFaithMemo(logs.find(l => l.routineId === routine.id && l.date === viewDate)?.memo);
  const recordKind = inferFaithKind(routine.title);

  const fireStamp = (type: 'done' | 'rest') => {
    setRowStamp(type);
    setTimeout(() => setRowStamp(null), 900);
  };

  return (
    <>
      <motion.div
        layout
        onClick={() => navigate(`/faith-routines/edit/${routine.id}`)}
        className={`habit-paper-row relative flex min-h-[68px] items-center gap-3 px-3 py-2.5 cursor-pointer active:bg-surface-alt transition-colors ${(done || skipped) ? 'opacity-70' : ''}`}
      >
        {/* 미니 스탬프 */}
        <AnimatePresence>
          {rowStamp && <RowStamp type={rowStamp} color={rowStamp === 'done' ? '#1f8a4c' : '#f59e0b'} />}
        </AnimatePresence>

        {/* 번호 */}
        <span aria-hidden="true" className={`text-caption2 font-bold w-4 text-center flex-shrink-0 ${done ? 'text-label-assistive' : 'text-label-alt'}`}>
          {index}
        </span>

        {/* 이모지 아이콘 (장식) */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
          done ? 'bg-faith-soft' : skipped ? 'bg-amber-50' : 'bg-fill'
        }`}>
          {routine.emoji
            ? <OnjuIcon emoji={routine.emoji} size={34} />
            : <Church size={20} strokeWidth={1.9} className="text-faith" />}
        </div>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          <p className={`text-body2 font-bold truncate ${
            done ? 'line-through text-label-alt'
            : skipped ? 'line-through text-label-assistive'
            : 'text-label-strong'
          }`}>
            {routine.title}
          </p>
          {skipped && (
            <p className="text-[11px] text-amber-400 font-medium mt-0.5 flex items-center gap-0.5">오늘 쉬어가요 <Cloud size={11} strokeWidth={1.9} /></p>
          )}
          {/* 남긴 기록 요약 — 탭하면 수정 */}
          {done && memo && (
            <button
              onClick={e => { e.stopPropagation(); if (!readOnly) onRecord(routine); }}
              className={`block max-w-full text-left text-[11px] font-medium mt-0.5 truncate ${
                memo.type === 'bible' ? 'text-faith' : 'text-primary'
              }`}
            >
              {memo.type === 'bible' ? '📖 ' : '🙏 '}{faithMemoSummary(memo)}
            </button>
          )}
          {/* 완료했지만 기록이 없는 말씀·기도 루틴 — 부담 없는 유도 칩 */}
          {done && !memo && recordKind && !readOnly && (
            <button
              onClick={e => { e.stopPropagation(); onRecord(routine); }}
              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full mt-1 ${
                recordKind === 'bible' ? 'text-faith bg-faith-soft' : 'text-primary bg-primary-soft'
              }`}
            >
              ✍️ {recordKind === 'bible' ? '말씀 한 줄 남기기' : '기도 제목 남기기'}
            </button>
          )}
          {routine.durationSeconds && !done && !skipped && (
            <p className="text-caption2 text-faith font-medium mt-1 flex items-center gap-1">
              <Timer size={10} />
              {routine.durationSeconds >= 60
                ? `${Math.floor(routine.durationSeconds / 60)}분 ${routine.durationSeconds % 60 > 0 ? `${routine.durationSeconds % 60}초` : ''}`.trim()
                : `${routine.durationSeconds}초`}
            </p>
          )}
        </div>

        {/* 오른쪽: 읽기 전용이면 상태칩, 아니면 액션 버튼 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {readOnly ? (
            <span className={`text-caption2 font-bold px-2 py-1 rounded-lg ${
              done ? 'bg-faith-soft text-faith'
              : skipped ? 'bg-amber-100 text-amber-500'
              : 'bg-fill text-label-assistive'
            }`}>
              {done ? '완료' : skipped ? '쉼' : '미완료'}
            </span>
          ) : (
            <>
              {!done && !skipped && (
                <>
                  {(routine.twoMinuteHabit || routine.durationSeconds) && (
                    <motion.button
                      whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                      onClick={e => {
                        e.stopPropagation();
                        if (routine.twoMinuteHabit) setTwoMinOpen(true);
                        else setFocusOpen(true);
                      }}
                      aria-label={`${routine.title} ${routine.twoMinuteHabit ? '2분 루틴' : '집중 타이머'} 시작`}
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        routine.twoMinuteHabit ? 'bg-amber-100 text-amber-500' : 'bg-faith-soft text-faith'
                      }`}
                    >
                      {routine.twoMinuteHabit ? <Zap size={13} strokeWidth={1.9} /> : <Play size={11} fill="currentColor" />}
                    </motion.button>
                  )}
                  {!routine.twoMinuteHabit && !routine.durationSeconds && (
                    <motion.button
                      whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                      onClick={e => { e.stopPropagation(); setFocusOpen(true); }}
                      aria-label={`${routine.title} 집중 시작`}
                      className="w-8 h-8 rounded-xl bg-faith-soft text-faith flex items-center justify-center"
                    >
                      <Play size={11} fill="currentColor" />
                    </motion.button>
                  )}
                  <motion.button whileTap={{ scale: 0.85 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
                    onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} aria-label={`${routine.title} 신앙 루틴 삭제`}
                    className="flex h-8 w-7 items-center justify-center text-label-assistive hover:text-negative transition-colors">
                    <Trash2 size={13} />
                  </motion.button>
                </>
              )}

              {!done && (
                <StampButton label="쉼" active={skipped}
                  activeColor="bg-amber-400 border-amber-400" inkColor="text-white" dryColor="text-amber-500" rotation={9}
                  onClick={e => { e.stopPropagation(); if (!skipped) fireStamp('rest'); skipRoutineLog(routine.id, viewDate); }}
                />
              )}

              {!skipped && (
                <StampButton label="완료" active={done}
                  activeColor="bg-faith border-faith" inkColor="text-white" dryColor="text-faith" rotation={-10}
                  onClick={e => {
                    e.stopPropagation();
                    if (!done) { fireStamp('done'); onCompleted(routine); }
                    toggleRoutineLog(routine.id, viewDate);
                  }}
                />
              )}
            </>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {focusOpen && <FocusMode routine={routine} onClose={() => setFocusOpen(false)} />}
        {twoMinOpen && <TwoMinuteMode habit={routine} onClose={() => setTwoMinOpen(false)} />}
      </AnimatePresence>

      <ConfirmModal
        isOpen={confirmDelete}
        title={`'${routine.title}' 루틴을 삭제할까요?`}
        message="삭제하면 되돌릴 수 없어요."
        onConfirm={() => { onRemove(); setConfirmDelete(false); }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
