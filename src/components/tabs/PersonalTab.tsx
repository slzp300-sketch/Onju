import { useSavedDrafts } from '../../hooks/useSavedDrafts';
import { isBundleDraft } from '../../utils/formDrafts';
import { usePlanDeletionIds } from '../../hooks/usePlanDeletionIds';
import type { PersonalRoutine } from '../../types';
import { toast } from '../../store/toastStore';
import { itemOnDate } from '../../utils/scheduleHistory';
import { isHabitDue } from '../../utils/scheduledItems';
import EmptyState from '../ui/EmptyState';
import { useState } from 'react';
import { Trash2, Timer, CheckSquare, LayoutList, Play, ChevronDown, Smile, ClipboardList, Flame, Cloud, Zap, Check, Pencil } from '../../icons';
import ActionMenu from '../ui/ActionMenu';
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
export default function PersonalTab({ date, readOnly = false, hideCompleted = false, onShowCompleted }: { date?: string; readOnly?: boolean; hideCompleted?: boolean; onShowCompleted?: () => void } = {}) {
  const { habits, personalRoutines, isHabitCompleted, isHabitSkipped, isHabitSubstituted } = useHabitStore();
  const viewDate = date ?? today();
  const savedBundles = useSavedDrafts('personal-routine:',isBundleDraft);
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
  const due = habits.filter(h => isHabitDue(h, viewDate)).map(h => itemOnDate(h, viewDate));
  const visible = due.filter(h => !hideCompleted || !(isHabitCompleted(h.id, viewDate) || isHabitSkipped(h.id, viewDate) || isHabitSubstituted(h.id, viewDate)));
  const standaloneHabits = visible.filter(h => !habitIdsInRoutines.has(h.id));
  const visibleRoutines = personalRoutines.filter(r => r.habitIds.some(id => visible.some(h => h.id === id)));
  const otherHabits = habits.filter(h => !h.archivedAt && !isHabitDue(h, viewDate));
  const otherRoutines = personalRoutines.filter(r => !r.habitIds.some(id => due.some(h => h.id === id)));

  if (due.length === 0 && !habits.some(h => !h.archivedAt)) {
    return (
      <div className="relative">
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-primary-soft flex items-center justify-center text-primary mb-5"><Smile size={36} strokeWidth={1.9} /></div>
          <p className="text-headline1 font-bold text-label mb-1">{readOnly ? '이날 예정된 습관이 없어요' : '첫 번째 습관을 시작해 보세요'}</p>
          <p className="text-body2 text-label-alt leading-relaxed">
            작은 습관 하나가 직장 생활을<br />조금 더 단단하게 만들어 줄 거예요
          </p>
        </div>
        {!readOnly && <div className="px-6 pb-5 text-center"><button className="min-h-11 rounded-xl bg-primary px-5 font-bold text-white" onClick={() => navigate('/habits/new')}>첫 습관 추가하기</button></div>}
        {!readOnly && savedBundles.error && <p role="alert" className="text-caption1 text-negative">묶음 초안을 모두 읽지 못했어요. 기기 저장 상태를 확인해주세요.</p>}
      {!readOnly && savedBundles.drafts.length>0 && <details className="rounded-xl border border-line p-3"><summary className="min-h-11 py-3 font-bold text-caption1">남겨둔 루틴 묶음 초안 ({savedBundles.drafts.length})</summary>
        {savedBundles.drafts.map(d=><button key={d.document} className="block min-h-11 w-full text-left break-words text-body2 text-primary" onClick={()=>navigate(d.values.base?`/personal-routines/edit/${d.values.base.id}`:'/personal-routines/new')}>{d.values.title || '새 루틴 묶음'} 초안 열기</button>)}
      </details>}
      {!readOnly && <FAB options={fabOptions} />}
      </div>
    );
  }

  return (
    <div className="relative flex flex-col gap-3 px-3">
      {/* 루틴 그룹 */}
      {visible.length === 0 && <EmptyState title={due.length ? '예정된 습관을 모두 기록했어요' : '이날 예정된 습관이 없어요'} description={due.length ? '완료한 기록은 언제든 다시 확인할 수 있어요.' : '반복 요일에 맞춰 여기에 나타나요.'}
        action={due.length > 0 && hideCompleted && <button className="min-h-11 px-4 font-bold text-primary" onClick={onShowCompleted}>완료 기록 보기</button>} />}
      {visibleRoutines.map(r => (
        <RoutineGroup key={r.id} routineId={r.id} viewDate={viewDate} readOnly={readOnly} hideCompleted={hideCompleted} />
      ))}

      {/* 단독 습관 */}
      {standaloneHabits.length > 0 && (
        <section className="routine-paper-group overflow-hidden" aria-label="개별 습관">
          {personalRoutines.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-3 bg-surface-alt border-b border-line-soft">
              <ClipboardList size={15} className="text-label-alt" strokeWidth={1.9} />
              <span id="standalone-habits-title" className="flex-1 text-label2 font-bold text-label-strong">개별 습관</span>
              <CompletedBadge habits={due.filter(h => !habitIdsInRoutines.has(h.id))} viewDate={viewDate} />
            </div>
          )}
          <div className="divide-y divide-line-soft">
            {standaloneHabits.map(h => (
              <HabitRow key={h.id} habit={h} viewDate={viewDate} readOnly={readOnly} />
            ))}
          </div>
        </section>
      )}

      {!readOnly && (otherHabits.length > 0 || otherRoutines.length > 0) && <details className="rounded-xl border border-line px-3">
        <summary className="min-h-11 cursor-pointer py-3 text-caption1 font-bold text-label-alt">다른 요일·빈 루틴 관리 ({otherHabits.length + otherRoutines.length})</summary>
        {otherRoutines.map(r => <button key={r.id} className="block min-h-11 w-full break-words text-left text-body2 text-primary" onClick={() => navigate(`/personal-routines/edit/${r.id}`)}>{r.title} 루틴 수정</button>)}
        {otherHabits.map(h => <HabitRow key={h.id} habit={h} viewDate={viewDate} scheduled={false} />)}
      </details>}
      {!readOnly && savedBundles.error && <p role="alert" className="text-caption1 text-negative">묶음 초안을 모두 읽지 못했어요. 기기 저장 상태를 확인해주세요.</p>}
      {!readOnly && savedBundles.drafts.length>0 && <details className="rounded-xl border border-line p-3"><summary className="min-h-11 py-3 font-bold text-caption1">남겨둔 루틴 묶음 초안 ({savedBundles.drafts.length})</summary>
        {savedBundles.drafts.map(d=><button key={d.document} className="block min-h-11 w-full text-left break-words text-body2 text-primary" onClick={()=>navigate(d.values.base?`/personal-routines/edit/${d.values.base.id}`:'/personal-routines/new')}>{d.values.title || '새 루틴 묶음'} 초안 열기</button>)}
      </details>}
      {!readOnly && <FAB options={fabOptions} />}
    </div>
  );
}

/* ── 루틴 그룹 (접기/펼치기 + 진행률) ── */
function RoutineGroup({ routineId, viewDate, readOnly, hideCompleted }: { routineId: string; viewDate: string; readOnly: boolean; hideCompleted: boolean }) {
  const { habits, personalRoutines, removePersonalRoutine, isHabitCompleted, isHabitSkipped, isHabitSubstituted } = useHabitStore();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<PersonalRoutine>();
  const deleting = usePlanDeletionIds().includes(`bundle:${routineId}`);

  const routine = personalRoutines.find(r => r.id === routineId);
  if (!routine) return null;
  const routineHabits = routine.habitIds.map(id => habits.find(h => h.id === id)).filter((h): h is Habit => !!h && isHabitDue(h, viewDate)).map(h => itemOnDate(h, viewDate));
  const completedCount = routineHabits.filter(h =>
    isHabitCompleted(h.id, viewDate) || isHabitSkipped(h.id, viewDate) || isHabitSubstituted(h.id, viewDate)
  ).length;
  const allDone = completedCount === routineHabits.length && routineHabits.length > 0;

  return (
    <section className="routine-paper-group overflow-hidden" aria-labelledby={`routine-${routine.id}-title`}>
      {/* 루틴 헤더 */}
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-3 bg-surface-alt border-b border-line-soft">
        {/* 접기/펼치기 */}
        <motion.button
          animate={{ rotate: expanded ? 0 : -90 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          aria-label={`${routine.title} 습관 목록 ${expanded ? '접기' : '펼치기'}`}
          aria-expanded={expanded}
          className="flex size-11 items-center justify-center rounded-xl text-label-alt hover:bg-fill"
        >
          <ChevronDown size={16} />
        </motion.button>

        <div className="min-w-0">
          <h2 id={`routine-${routine.id}-title`} className="text-label1 font-bold text-label-strong">
            <button disabled={readOnly || deleting} onClick={() => navigate(`/personal-routines/edit/${routine.id}`)} className="min-h-11 w-full text-left break-words" aria-label={`${routine.title} 루틴 수정`}>{routine.title}</button>
          </h2>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption2 text-label-alt">
            {routine.when && <span>{routine.when}</span>}
            {routine.timerEnabled && <span className="inline-flex items-center gap-0.5 whitespace-nowrap"><Timer size={11} /> 타이머</span>}
          </div>
        </div>

        {/* 진행률 뱃지 */}
        <span className={`text-caption2 font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${allDone ? 'bg-primary-soft text-primary' : 'bg-fill text-label-alt'}`}>
          {completedCount}/{routineHabits.length}
        </span>

        {!readOnly && <div className="flex justify-end"><ActionMenu title={routine.title + ' 루틴'} disabled={deleting} actions={[
          { label: '루틴 수정', icon: <Pencil size={18} />, onClick: () => navigate('/personal-routines/edit/' + routine.id) },
          ...(routine.timerEnabled && viewDate === today() ? [{ label: '루틴 타이머 시작', icon: <Play size={18} />, onClick: () => navigate('/routine-timer/' + routine.id) }] : []),
          { label: '묶음 삭제', icon: <Trash2 size={18} />, danger: true, onClick: () => setConfirmDelete(routine) },
        ]} /></div>}
      <ConfirmModal
        isOpen={!!confirmDelete}
        title={`'${routine?.title}' 루틴을 삭제할까요?`}
        message="묶음만 삭제해요. 안의 습관과 과거 수행 기록은 남아요. 서버가 확인할 때까지 묶음을 유지해요."
        confirmLabel="묶음 삭제"
        confirmDisabled={deleting || JSON.stringify(confirmDelete)!==JSON.stringify(routine)}
        onConfirm={() => { try { removePersonalRoutine(routine.id, confirmDelete); setConfirmDelete(undefined); } catch(e) { toast.error(e instanceof Error?e.message:'다시 확인해주세요.'); } }}
        onCancel={() => setConfirmDelete(undefined)}
      />
      </div>

      {deleting && <p role="status" className="px-4 py-2 text-caption1 text-primary">묶음 삭제 확인 중 · 습관과 수행 기록은 유지돼요</p>}
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
            {routineHabits.filter(h => !hideCompleted || !(isHabitCompleted(h.id, viewDate) || isHabitSkipped(h.id, viewDate) || isHabitSubstituted(h.id, viewDate))).map(h => (
              <HabitRow key={h.id} habit={h} inRoutine viewDate={viewDate} readOnly={readOnly} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ── 개별 습관 행 ── */
function HabitRow({ habit, inRoutine = false, viewDate, readOnly = false, scheduled = true }: { habit: Habit; inRoutine?: boolean; viewDate: string; readOnly?: boolean; scheduled?: boolean }) {
  const { toggleHabitLog, skipHabitLog, substituteHabitLog, isHabitCompleted, isHabitSkipped, isHabitSubstituted, removeHabit } = useHabitStore();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [twoMinOpen, setTwoMinOpen] = useState(false);
  const [rowStamp, setRowStamp] = useState<'done' | 'rest' | 'sub' | null>(null);
  const attempt = (action: () => void) => { try { action(); } catch (error) { toast.error(error instanceof Error ? error.message : '저장하지 못했어요.'); } };
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
        className="habit-paper-row relative grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-2 px-3 py-3"
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

        {/* 이모지 */}
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${
          done ? 'bg-primary-soft' : substituted ? 'bg-orange-50' : skipped ? 'bg-amber-50' : 'bg-fill'
        }`}>
          <OnjuIcon emoji={habit.emoji} size={34} />
        </div>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          <button disabled={readOnly} onClick={() => navigate(`/habits/edit/${habit.id}`)} aria-label={`${habit.title} 습관 수정`} className={`min-h-11 w-full text-left break-words text-body2 font-bold ${
            done ? 'line-through text-label-alt'
            : substituted ? 'line-through text-label-assistive'
            : skipped ? 'line-through text-label-assistive'
            : 'text-label-strong'
          }`}>
            {habit.title}
          </button>
          {substituted && (
            <p className="text-[11px] text-orange-700 font-medium mt-0.5 flex items-center gap-0.5"><Flame size={11} strokeWidth={1.9} /> 대체 완료 — {habit.miniRoutine}</p>
          )}
          {skipped && !substituted && (
            <p className="text-[11px] text-amber-700 font-medium mt-0.5 flex items-center gap-0.5">오늘 쉬어가요 <Cloud size={11} strokeWidth={1.9} /></p>
          )}
          {!skipped && !substituted && habit.when && (
            <p className="text-caption2 text-label-alt mt-1 truncate">{habit.when}</p>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {readOnly || !scheduled ? <span className="text-caption2 text-label-alt">{!scheduled ? '예정 없음' : done ? '완료' : substituted ? '대체' : skipped ? '쉼' : '미완료'}</span> : <>
            {!skipped && !substituted && <button className="completion-button" aria-label={habit.title + (done ? ' 완료 취소' : ' 완료')} aria-pressed={done}
              onClick={() => attempt(() => { toggleHabitLog(habit.id, viewDate); if (!done) fireStamp('done'); })}><Check size={19} /></button>}
            <ActionMenu title={habit.title} actions={[
              { label: '습관 수정', icon: <Pencil size={18} />, onClick: () => navigate('/habits/edit/' + habit.id) },
              ...(!done && !skipped && !substituted && (habit.twoMinuteHabit || habit.durationSeconds) ? [{ label: habit.twoMinuteHabit ? '2분 습관 시작' : '집중 타이머 시작', icon: <Zap size={18} />, onClick: () => habit.twoMinuteHabit ? setTwoMinOpen(true) : setFocusOpen(true) }] : []),
              ...(!done && !substituted ? [{ label: skipped ? '쉼 취소' : '오늘 쉬어가기', icon: <Cloud size={18} />, onClick: () => attempt(() => { skipHabitLog(habit.id, viewDate); if (!skipped) fireStamp('rest'); }) }] : []),
              ...(!done && !skipped && habit.miniRoutine ? [{ label: substituted ? '대체 취소' : '대체 실천 · ' + habit.miniRoutine, icon: <Flame size={18} />, onClick: () => attempt(() => { substituteHabitLog(habit.id, viewDate); if (!substituted) fireStamp('sub'); }) }] : []),
              ...(!done && !skipped && !inRoutine ? [{ label: '습관 보관', icon: <Trash2 size={18} />, onClick: () => setConfirmDelete(true) }] : []),
            ]} />
          </>}
        </div>

        <ConfirmModal
          isOpen={confirmDelete}
          title={`'${habit.title}' 습관을 보관할까요?`}
          message="오늘부터 목록에서 숨기고 이전 날짜의 기록은 유지해요. 마이페이지에서 복원할 수 있어요."
          confirmLabel="보관"
          onConfirm={() => { try { removeHabit(habit.id); setConfirmDelete(false); } catch (error) { toast.error(error instanceof Error ? error.message : '보관 요청을 저장하지 못했어요.'); } }}
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
