import { useState } from 'react';
import { Trash2, Timer, CheckSquare, LayoutList, Play, ChevronDown, Smile, ClipboardList, Flame, Cloud, Zap } from '../../icons';
import StampButton from '../ui/StampButton';
import RowStamp from '../ui/RowStamp';
import RowRestAnim from '../ui/RowRestAnim';
import TwoMinuteMode from '../routines/TwoMinuteMode';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FAB from '../ui/FAB';
import ConfirmModal from '../ui/ConfirmModal';
import HabitFocusMode from '../routines/HabitFocusMode';
import { useHabitStore } from '../../store/habitStore';
import type { Habit } from '../../types';
import { today } from '../../utils/date';
import OnjuIcon from '../ui/OnjuIcon';

/* ════════════════════════════════════════
   개인 탭 최상위
   date: 조회 날짜 (미지정 시 논리적 오늘)
   readOnly: 지난 날짜는 읽기 전용
════════════════════════════════════════ */
export default function PersonalTab({ date, readOnly = false }: { date?: string; readOnly?: boolean } = {}) {
  const { habits, personalRoutines } = useHabitStore();
  const viewDate = date ?? today();
  const navigate = useNavigate();

  const fabOptions = [
    {
      icon: <CheckSquare size={20} />,
      label: '습관 추가',
      sub: '1개의 반복 할 일',
      color: 'bg-primary',
      onClick: () => navigate('/habits/new'),
    },
    {
      icon: <LayoutList size={20} />,
      label: '루틴 추가',
      sub: '2개 이상의 습관 묶음',
      color: 'bg-label-strong',
      onClick: () => navigate('/personal-routines/new'),
    },
  ];

  // 루틴에 포함된 습관 ID 집합
  const habitIdsInRoutines = new Set(personalRoutines.flatMap(r => r.habitIds));
  // 루틴에 속하지 않는 단독 습관
  const standaloneHabits = habits.filter(h => !habitIdsInRoutines.has(h.id));

  if (habits.length === 0) {
    return (
      <div className="relative">
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-primary-soft flex items-center justify-center text-primary mb-5"><Smile size={36} strokeWidth={1.9} /></div>
          <p className="text-headline1 font-bold text-label mb-1">첫 번째 습관을 시작해 보세요</p>
          <p className="text-body2 text-label-alt leading-relaxed">
            작은 습관 하나가 직장 생활을<br />조금 더 단단하게 만들어 줄 거예요
          </p>
        </div>
        <FAB options={fabOptions} />
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-3 px-3 pb-24">
      {/* 루틴 그룹 */}
      {personalRoutines.map(r => (
        <RoutineGroup key={r.id} routineId={r.id} viewDate={viewDate} readOnly={readOnly} />
      ))}

      {/* 단독 습관 */}
      {standaloneHabits.length > 0 && (
        <section className="routine-paper-group overflow-hidden" aria-labelledby="standalone-habits-title">
          {personalRoutines.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-surface-alt border-b border-line-soft">
              <ClipboardList size={15} className="text-label-alt" strokeWidth={1.9} />
              <span id="standalone-habits-title" className="flex-1 text-label2 font-bold text-label-strong">개별 습관</span>
              <CompletedBadge habits={standaloneHabits} viewDate={viewDate} />
            </div>
          )}
          <div className="divide-y divide-line-soft">
            {standaloneHabits.map((h, idx) => (
              <HabitRow key={h.id} habit={h} index={idx + 1} viewDate={viewDate} readOnly={readOnly} />
            ))}
          </div>
        </section>
      )}

      {!readOnly && <FAB options={fabOptions} />}
    </div>
  );
}

/* ── 루틴 그룹 (접기/펼치기 + 진행률) ── */
function RoutineGroup({ routineId, viewDate, readOnly }: { routineId: string; viewDate: string; readOnly: boolean }) {
  const { habits, personalRoutines, removePersonalRoutine, isHabitCompleted, isHabitSkipped, isHabitSubstituted } = useHabitStore();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const routine = personalRoutines.find(r => r.id === routineId);
  if (!routine) return null;
  const routineHabits = routine.habitIds.map(id => habits.find(h => h.id === id)).filter(Boolean) as Habit[];
  const completedCount = routineHabits.filter(h =>
    isHabitCompleted(h.id, viewDate) || isHabitSkipped(h.id, viewDate) || isHabitSubstituted(h.id, viewDate)
  ).length;
  const allDone = completedCount === routineHabits.length && routineHabits.length > 0;

  return (
    <section className="routine-paper-group overflow-hidden" aria-labelledby={`routine-${routine.id}-title`}>
      {/* 루틴 헤더 */}
      <div onClick={() => navigate(`/personal-routines/edit/${routine.id}`)}
        className="flex items-center gap-3 px-3 py-3 bg-surface-alt border-b border-line-soft cursor-pointer active:bg-fill transition-colors">
        {/* 접기/펼치기 */}
        <motion.button
          animate={{ rotate: expanded ? 0 : -90 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          aria-label={`${routine.title} 습관 목록 ${expanded ? '접기' : '펼치기'}`}
          aria-expanded={expanded}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-label-alt flex-shrink-0 hover:bg-fill"
        >
          <ChevronDown size={16} />
        </motion.button>

        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface flex-shrink-0 shadow-emphasize">
          <OnjuIcon emoji={routine.emoji} size={31} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id={`routine-${routine.id}-title`} className="truncate text-label1 font-bold text-label-strong">{routine.title}</h2>
          <div className="mt-0.5 flex items-center gap-2 text-caption2 text-label-alt">
            {routine.when && <span className="truncate">{routine.when}</span>}
            {routine.timerEnabled && <span className="inline-flex items-center gap-0.5"><Timer size={11} /> 타이머</span>}
          </div>
        </div>

        {/* 진행률 뱃지 */}
        <span className={`text-caption2 font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${allDone ? 'bg-primary-soft text-primary' : 'bg-fill text-label-alt'}`}>
          {completedCount}/{routineHabits.length}
        </span>

        {/* ▶ 전체 시작 (타이머 활성화 + 편집 가능 시) */}
        {routine.timerEnabled && !readOnly && (
        <motion.button
          whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
          onClick={e => { e.stopPropagation(); navigate(`/routine-timer/${routine.id}`); }}
          aria-label={`${routine.title} 루틴 타이머 시작`}
          className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${allDone ? 'bg-primary text-white' : 'bg-surface border border-line text-label-alt hover:border-primary-soft hover:text-primary'}`}
        >
          <Play size={10} fill="currentColor" />
        </motion.button>
        )}

        {/* 삭제 (편집 가능 시) */}
        {!readOnly && (
        <motion.button whileTap={{ scale: 0.85 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
          onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
          aria-label={`${routine.title} 루틴 삭제`}
          className="flex h-9 w-8 items-center justify-center text-label-assistive hover:text-negative transition-colors">
          <Trash2 size={13} />
        </motion.button>
        )}

      <ConfirmModal
        isOpen={confirmDelete}
        title={`'${routine?.title}' 루틴을 삭제할까요?`}
        message="삭제하면 되돌릴 수 없어요."
        confirmLabel="삭제"
        onConfirm={() => { removePersonalRoutine(routine.id); setConfirmDelete(false); }}
        onCancel={() => setConfirmDelete(false)}
      />
      </div>

      {/* 습관 목록 (접기/펼치기) */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="overflow-hidden divide-y divide-line-soft"
          >
            {routineHabits.map((h, idx) => (
              <HabitRow key={h.id} habit={h} index={idx + 1} inRoutine viewDate={viewDate} readOnly={readOnly} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ── 개별 습관 행 ── */
function HabitRow({ habit, index, inRoutine = false, viewDate, readOnly = false }: { habit: Habit; index: number; inRoutine?: boolean; viewDate: string; readOnly?: boolean }) {
  const { toggleHabitLog, skipHabitLog, substituteHabitLog, isHabitCompleted, isHabitSkipped, isHabitSubstituted, removeHabit } = useHabitStore();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [twoMinOpen, setTwoMinOpen] = useState(false);
  const [rowStamp, setRowStamp] = useState<'done' | 'rest' | 'sub' | null>(null);
  const done = isHabitCompleted(habit.id, viewDate);
  const skipped = isHabitSkipped(habit.id, viewDate);
  const substituted = isHabitSubstituted(habit.id, viewDate);

  const fireStamp = (type: 'done' | 'rest' | 'sub') => {
    setRowStamp(type);
    setTimeout(() => setRowStamp(null), 900);
  };

  return (
    <>
      <motion.div
        layout
        onClick={() => navigate(`/habits/edit/${habit.id}`)}
        className={`habit-paper-row relative flex min-h-[68px] items-center gap-3 px-3 py-2.5 cursor-pointer active:bg-surface-alt transition-colors ${(done || skipped || substituted) ? 'opacity-70' : ''}`}
      >
        {/* 미니 스탬프 */}
        <AnimatePresence>
          {rowStamp === 'rest' && <RowRestAnim />}
          {(rowStamp === 'done' || rowStamp === 'sub') && (
            <RowStamp
              type="done"
              color={rowStamp === 'sub' ? '#e07b27' : '#2f9e60'}
            />
          )}
        </AnimatePresence>

        {/* 번호 */}
        <span aria-hidden="true" className={`text-caption2 font-bold w-4 text-center flex-shrink-0 ${(done || skipped) ? 'text-label-assistive' : 'text-label-alt'}`}>
          {index}
        </span>

        {/* 이모지 */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
          done ? 'bg-primary-soft' : substituted ? 'bg-orange-50' : skipped ? 'bg-amber-50' : 'bg-fill'
        }`}>
          <OnjuIcon emoji={habit.emoji} size={34} />
        </div>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          <p className={`text-body2 font-bold truncate ${
            done ? 'line-through text-label-alt'
            : substituted ? 'line-through text-label-assistive'
            : skipped ? 'line-through text-label-assistive'
            : 'text-label-strong'
          }`}>
            {habit.title}
          </p>
          {substituted && (
            <p className="text-[11px] text-orange-400 font-medium mt-0.5 flex items-center gap-0.5"><Flame size={11} strokeWidth={1.9} /> 대체 완료 — {habit.miniRoutine}</p>
          )}
          {skipped && !substituted && (
            <p className="text-[11px] text-amber-400 font-medium mt-0.5 flex items-center gap-0.5">오늘 쉬어가요 <Cloud size={11} strokeWidth={1.9} /></p>
          )}
          {!skipped && !substituted && habit.when && (
            <p className="text-caption2 text-label-alt mt-1 truncate">{habit.when}</p>
          )}
        </div>

        {/* 오른쪽: 읽기 전용이면 상태칩, 아니면 액션 버튼들 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {readOnly ? (
            <span className={`text-caption2 font-bold px-2 py-1 rounded-lg ${
              done ? 'bg-primary-soft text-primary'
              : substituted ? 'bg-orange-100 text-orange-500'
              : skipped ? 'bg-amber-100 text-amber-500'
              : 'bg-fill text-label-assistive'
            }`}>
              {done ? '완료' : substituted ? '대체' : skipped ? '쉼' : '미완료'}
            </span>
          ) : (
            <>
              {!done && !skipped && !inRoutine && (
                <motion.button whileTap={{ scale: 0.85 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
                  onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
                  aria-label={`${habit.title} 습관 삭제`}
                  className="flex h-8 w-7 items-center justify-center text-label-assistive hover:text-negative transition-colors">
                  <Trash2 size={13} />
                </motion.button>
              )}

              {/* ▶ 실행 버튼 */}
              {!done && !skipped && !substituted && (habit.twoMinuteHabit || habit.durationSeconds) && (
                <motion.button
                  whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                  onClick={e => {
                    e.stopPropagation();
                    if (habit.twoMinuteHabit) setTwoMinOpen(true);
                    else setFocusOpen(true);
                  }}
                  aria-label={`${habit.title} ${habit.twoMinuteHabit ? '2분 습관' : '집중 타이머'} 시작`}
                  className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                    habit.twoMinuteHabit ? 'bg-amber-100 text-amber-500' : 'bg-primary-soft text-primary'
                  }`}
                >
                  {habit.twoMinuteHabit ? <Zap size={13} strokeWidth={1.9} /> : <Play size={10} fill="currentColor" />}
                </motion.button>
              )}

              {/* 쉬어가기 */}
              {!done && !substituted && (
                <StampButton label="쉼" active={skipped}
                  activeColor="bg-amber-400 border-amber-400" inkColor="text-white" dryColor="text-amber-500" rotation={9}
                  onClick={e => { e.stopPropagation(); if (!skipped) fireStamp('rest'); skipHabitLog(habit.id, viewDate); }}
                />
              )}

              {/* 대체 */}
              {!done && !skipped && habit.miniRoutine && (
                <StampButton label="대체" active={substituted}
                  activeColor="bg-orange-400 border-orange-400" inkColor="text-white" dryColor="text-orange-500" rotation={7}
                  onClick={e => { e.stopPropagation(); if (!substituted) fireStamp('sub'); substituteHabitLog(habit.id, viewDate); }}
                />
              )}

              {/* 완료 */}
              {!skipped && !substituted && (
                <StampButton label="완료" active={done}
                  activeColor="bg-primary border-primary" inkColor="text-white" dryColor="text-primary" rotation={-10}
                  onClick={e => { e.stopPropagation(); if (!done) fireStamp('done'); toggleHabitLog(habit.id, viewDate); }}
                />
              )}
            </>
          )}
        </div>

        <ConfirmModal
          isOpen={confirmDelete}
          title={`'${habit.title}' 습관을 삭제할까요?`}
          message="삭제하면 되돌릴 수 없어요."
          onConfirm={() => { removeHabit(habit.id); setConfirmDelete(false); }}
          onCancel={() => setConfirmDelete(false)}
        />
      </motion.div>

      <AnimatePresence>
        {focusOpen && <HabitFocusMode habit={habit} onClose={() => setFocusOpen(false)} />}
        {twoMinOpen && <TwoMinuteMode habit={habit} onClose={() => setTwoMinOpen(false)} />}
      </AnimatePresence>
    </>
  );
}

/* ── 완료 뱃지 헬퍼 ── */
function CompletedBadge({ habits, viewDate }: { habits: Habit[]; viewDate: string }) {
  const { isHabitCompleted, isHabitSkipped, isHabitSubstituted } = useHabitStore();
  const done = habits.filter(h =>
    isHabitCompleted(h.id, viewDate) || isHabitSkipped(h.id, viewDate) || isHabitSubstituted(h.id, viewDate)
  ).length;
  const allDone = done === habits.length;
  return (
    <span className={`text-caption2 font-bold px-2 py-0.5 rounded-full ${allDone ? 'bg-primary-soft text-primary' : 'bg-fill text-label-alt'}`}>
      {done}/{habits.length}
    </span>
  );
}
