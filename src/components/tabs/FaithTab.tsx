import { useState } from 'react';
import { Trash2, BookOpen, Play, Timer } from 'lucide-react';
import StampButton from '../ui/StampButton';
import ConfirmModal from '../ui/ConfirmModal';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import FAB from '../ui/FAB';
import { useRoutineStore } from '../../store/routineStore';
import type { DailyRoutine, TimeSlot } from '../../types';
import FocusMode from '../routines/FocusMode';

const TIME_SLOTS: { value: TimeSlot; label: string; time: string; emoji: string }[] = [
  { value: 'morning', label: '아침', time: '07:00', emoji: '🌅' },
  { value: 'afternoon', label: '점심', time: '12:00', emoji: '☀️' },
  { value: 'evening', label: '저녁', time: '21:00', emoji: '🌙' },
];

export default function FaithTab() {
  const { faithRoutines, removeRoutine, isCompleted } = useRoutineStore();
  const navigate = useNavigate();

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
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center text-4xl mb-5">🙏</div>
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
    <div className="relative flex flex-col pb-24">
      {/* 시간대별 그룹 */}
      {grouped.map(group => {
        const cnt = group.routines.filter(r => isCompleted(r.id)).length;
        const allDone = cnt === group.routines.length;
        return (
          <div key={group.value}>
            <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-alt border-b border-line-soft">
              <span className="text-caption2 font-bold text-label-alt w-10 flex-shrink-0">{group.time}</span>
              <span className="text-body2">{group.emoji}</span>
              <span className="flex-1 text-caption2 font-bold text-label">{group.label} 루틴</span>
              <span className={`text-caption2 font-bold px-2 py-0.5 rounded-full ${allDone ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-label-alt'}`}>
                {cnt}/{group.routines.length}
              </span>
            </div>
            <div className="bg-white divide-y divide-y divide-line-soft">
              {group.routines.map((r, idx) => (
                <FaithRoutineRow
                  key={r.id}
                  routine={r}
                  index={idx + 1}
                  onRemove={() => removeRoutine(r.id)}
                />
              ))}
            </div>
          </div>
        );
      })}

      {/* 시간대 없는 루틴 */}
      {unslotted.length > 0 && (
        <div>
          {grouped.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-alt border-b border-line-soft">
              <span className="text-body2">🙏</span>
              <span className="flex-1 text-caption2 font-bold text-label">기타 신앙 루틴</span>
              <span className={`text-caption2 font-bold px-2 py-0.5 rounded-full ${
                unslotted.filter(r => isCompleted(r.id)).length === unslotted.length
                  ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-label-alt'
              }`}>
                {unslotted.filter(r => isCompleted(r.id)).length}/{unslotted.length}
              </span>
            </div>
          )}
          <div className="bg-white divide-y divide-y divide-line-soft">
            {unslotted.map((r, idx) => (
              <FaithRoutineRow
                key={r.id}
                routine={r}
                index={idx + 1}
                onRemove={() => removeRoutine(r.id)}
              />
            ))}
          </div>
        </div>
      )}

      <FAB options={fabOptions} />
    </div>
  );
}

/* ── 신앙 루틴 행 ── */
function FaithRoutineRow({ routine, index, onRemove }: {
  routine: DailyRoutine;
  index: number;
  onRemove: () => void;
}) {
  const { toggleRoutineLog, skipRoutineLog, isCompleted, isSkipped } = useRoutineStore();
  const navigate = useNavigate();
  const [focusOpen, setFocusOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = isCompleted(routine.id);
  const skipped = isSkipped(routine.id);

  return (
    <>
      <motion.div
        layout
        onClick={() => navigate(`/faith-routines/edit/${routine.id}`)}
        className={`flex items-center gap-3 px-4 py-3 cursor-pointer active:bg-surface-alt transition-colors ${(done || skipped) ? 'opacity-70' : ''}`}
      >
        {/* 번호 */}
        <span className={`text-caption2 font-bold w-5 text-center flex-shrink-0 ${done ? 'text-label-assistive' : 'text-label-alt'}`}>
          {index}
        </span>

        {/* 이모지 아이콘 (장식) */}
        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${
          done ? 'bg-emerald-50' : skipped ? 'bg-amber-50' : 'bg-fill'
        }`}>
          {routine.emoji ?? (done ? '🙏' : '✝️')}
        </div>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          <p className={`text-label1 font-semibold truncate ${
            done ? 'line-through text-label-alt'
            : skipped ? 'line-through text-label-assistive'
            : 'text-label-strong'
          }`}>
            {routine.title}
          </p>
          {skipped && (
            <p className="text-[11px] text-amber-400 font-medium mt-0.5">오늘 쉬어가요 ☁️</p>
          )}
          {routine.durationSeconds && !done && !skipped && (
            <p className="text-[11px] text-emerald-500 font-medium mt-0.5 flex items-center gap-0.5">
              <Timer size={10} />
              {routine.durationSeconds >= 60
                ? `${Math.floor(routine.durationSeconds / 60)}분 ${routine.durationSeconds % 60 > 0 ? `${routine.durationSeconds % 60}초` : ''}`.trim()
                : `${routine.durationSeconds}초`}
            </p>
          )}
        </div>

        {/* 오른쪽: 포커스 시작 + 수정/삭제 + 체크 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!done && !skipped && (
            <>
              <motion.button
                whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                onClick={e => { e.stopPropagation(); setFocusOpen(true); }}
                className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center"
              >
                <Play size={11} fill="currentColor" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.85 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
                onClick={e => { e.stopPropagation(); setConfirmDelete(true); }} className="text-gray-200 hover:text-red-400 transition-colors p-1">
                <Trash2 size={13} />
              </motion.button>
            </>
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
              onClick={e => { e.stopPropagation(); skipRoutineLog(routine.id); }}
            />
          )}

          {/* 완료 스탬프 */}
          {!skipped && (
            <StampButton
              label="완료"
              active={done}
              activeColor="bg-emerald-500 border-emerald-500"
              inkColor="text-white"
              dryColor="text-emerald-600"
              rotation={-10}
              onClick={e => { e.stopPropagation(); toggleRoutineLog(routine.id); }}
            />
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {focusOpen && <FocusMode routine={routine} onClose={() => setFocusOpen(false)} />}
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
