import { useState } from 'react';
import { Trash2, Timer, CheckSquare, LayoutList, Play, ChevronDown } from 'lucide-react';
import StampButton from '../ui/StampButton';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FAB from '../ui/FAB';
import ConfirmModal from '../ui/ConfirmModal';
import HabitFocusMode from '../routines/HabitFocusMode';
import { useHabitStore } from '../../store/habitStore';
import type { Habit } from '../../types';
import { format } from 'date-fns';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');

/* ════════════════════════════════════════
   개인 탭 최상위
════════════════════════════════════════ */
export default function PersonalTab() {
  const { habits, personalRoutines } = useHabitStore();
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
      color: 'bg-gray-700',
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
          <div className="w-20 h-20 rounded-full bg-primary-soft flex items-center justify-center text-4xl mb-5">😊</div>
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
    <div className="relative flex flex-col pb-24">
      {/* 루틴 그룹 */}
      {personalRoutines.map(r => (
        <RoutineGroup key={r.id} routineId={r.id} />
      ))}

      {/* 단독 습관 */}
      {standaloneHabits.length > 0 && (
        <div>
          {personalRoutines.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-alt border-b border-line-soft">
              <span className="text-body2">📋</span>
              <span className="flex-1 text-caption2 font-bold text-label">개별 습관</span>
              <CompletedBadge habits={standaloneHabits} />
            </div>
          )}
          <div className="bg-surface divide-y divide-y divide-line-soft">
            {standaloneHabits.map((h, idx) => (
              <HabitRow key={h.id} habit={h} index={idx + 1} />
            ))}
          </div>
        </div>
      )}

      <FAB options={fabOptions} />
    </div>
  );
}

/* ── 루틴 그룹 (접기/펼치기 + 진행률) ── */
function RoutineGroup({ routineId }: { routineId: string }) {
  const { habits, personalRoutines, removePersonalRoutine, isHabitCompleted, isHabitSkipped } = useHabitStore();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const routine = personalRoutines.find(r => r.id === routineId);
  if (!routine) return null;
  const routineHabits = routine.habitIds.map(id => habits.find(h => h.id === id)).filter(Boolean) as Habit[];
  const completedCount = routineHabits.filter(h =>
    isHabitCompleted(h.id, todayStr()) || isHabitSkipped(h.id, todayStr())
  ).length;
  const allDone = completedCount === routineHabits.length && routineHabits.length > 0;

  return (
    <div className="mb-0.5">
      {/* 루틴 헤더 */}
      <div onClick={() => navigate(`/personal-routines/edit/${routine.id}`)}
        className="flex items-center gap-2 px-4 py-3 bg-surface-alt border-b border-line-soft cursor-pointer active:bg-fill transition-colors">
        {/* 접기/펼치기 */}
        <motion.button
          animate={{ rotate: expanded ? 0 : -90 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          onClick={e => { e.stopPropagation(); setExpanded(v => !v); }}
          className="text-label-alt flex-shrink-0"
        >
          <ChevronDown size={16} />
        </motion.button>

        <span className="text-lg">{routine.emoji}</span>
        <span className="flex-1 text-label1 font-bold text-label-strong">{routine.title}</span>

        {routine.when && (
          <span className="text-[11px] text-label-alt mr-1">{routine.when}</span>
        )}

        {/* 진행률 뱃지 */}
        <span className={`text-caption2 font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${allDone ? 'bg-primary-soft text-primary' : 'bg-gray-200 text-label-alt'}`}>
          {completedCount}/{routineHabits.length}
        </span>

        {/* 타이머 아이콘 */}
        {routine.timerEnabled && (
          <Timer size={14} className="text-primary flex-shrink-0" />
        )}

        {/* ▶ 전체 시작 (타이머 활성화 시에만 표시) */}
        {routine.timerEnabled && (
        <motion.button
          whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
          onClick={e => { e.stopPropagation(); navigate(`/routine-timer/${routine.id}`); }}
          className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${allDone ? 'bg-primary text-white' : 'bg-surface border border-line text-label-alt hover:border-primary-soft hover:text-primary'}`}
        >
          <Play size={10} fill="currentColor" />
        </motion.button>
        )}

        {/* 삭제 */}
        <motion.button whileTap={{ scale: 0.85 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
          onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
          className="text-gray-200 hover:text-red-400 transition-colors p-0.5">
          <Trash2 size={13} />
        </motion.button>

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
            className="overflow-hidden bg-surface divide-y divide-y divide-line-soft"
          >
            {routineHabits.map((h, idx) => (
              <HabitRow key={h.id} habit={h} index={idx + 1} inRoutine />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── 개별 습관 행 ── */
function HabitRow({ habit, index, inRoutine = false }: { habit: Habit; index: number; inRoutine?: boolean }) {
  const { toggleHabitLog, skipHabitLog, isHabitCompleted, isHabitSkipped, removeHabit } = useHabitStore();
  const navigate = useNavigate();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const done = isHabitCompleted(habit.id, todayStr());
  const skipped = isHabitSkipped(habit.id, todayStr());

  return (
    <>
      <motion.div
        layout
        onClick={() => navigate(`/habits/edit/${habit.id}`)}
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-surface-alt transition-colors ${(done || skipped) ? 'opacity-70' : ''}`}
      >
        {/* 번호 */}
        <span className={`text-caption2 font-bold w-5 text-center flex-shrink-0 ${(done || skipped) ? 'text-label-assistive' : 'text-label-alt'}`}>
          {index}
        </span>

        {/* 이모지 */}
        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${
          done ? 'bg-primary-soft' : skipped ? 'bg-amber-50' : 'bg-fill'
        }`}>
          {habit.emoji}
        </div>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          <p className={`text-label1 font-semibold truncate ${
            done ? 'line-through text-label-alt'
            : skipped ? 'line-through text-label-assistive'
            : 'text-label-strong'
          }`}>
            {habit.title}
          </p>
          {skipped && (
            <p className="text-[11px] text-amber-400 font-medium mt-0.5">오늘 쉬어가요 ☁️</p>
          )}
          {!skipped && habit.when && (
            <p className="text-[11px] text-label-alt mt-0.5 truncate">{habit.when}</p>
          )}
        </div>

        {/* 오른쪽 버튼들 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!done && !skipped && !inRoutine && (
            <motion.button whileTap={{ scale: 0.85 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
              onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
              className="text-gray-200 hover:text-red-400 transition-colors p-1">
              <Trash2 size={13} />
            </motion.button>
          )}

          {/* 타이머 버튼 (durationSeconds 있을 때만) */}
          {!done && !skipped && habit.durationSeconds && (
            <motion.button
              whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              onClick={e => { e.stopPropagation(); setFocusOpen(true); }}
              className="w-7 h-7 rounded-full bg-primary-soft text-primary flex items-center justify-center"
            >
              <Play size={10} fill="currentColor" />
            </motion.button>
          )}

          {/* 쉬어가기 스탬프 */}
          {!done && (
            <StampButton
              label="쉼"
              active={skipped}
              activeColor="bg-amber-400 border-amber-400"
              inkColor="text-white"
              dryColor="text-amber-500"
              rotation={9}
              onClick={e => { e.stopPropagation(); skipHabitLog(habit.id); }}
            />
          )}

          {/* 완료 스탬프 */}
          {!skipped && (
            <StampButton
              label="완료"
              active={done}
              activeColor="bg-primary border-primary"
              inkColor="text-white"
              dryColor="text-primary"
              rotation={-10}
              onClick={e => { e.stopPropagation(); toggleHabitLog(habit.id); }}
            />
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
      </AnimatePresence>
    </>
  );
}

/* ── 완료 뱃지 헬퍼 ── */
function CompletedBadge({ habits }: { habits: Habit[] }) {
  const { isHabitCompleted, isHabitSkipped } = useHabitStore();
  const done = habits.filter(h => isHabitCompleted(h.id, todayStr()) || isHabitSkipped(h.id, todayStr())).length;
  const allDone = done === habits.length;
  return (
    <span className={`text-caption2 font-bold px-2 py-0.5 rounded-full ${allDone ? 'bg-primary-soft text-primary' : 'bg-gray-200 text-label-alt'}`}>
      {done}/{habits.length}
    </span>
  );
}
