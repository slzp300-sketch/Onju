import { useState } from 'react';
import { Trash2, Pencil, BookOpen, Play } from 'lucide-react';
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
          <p className="text-base font-bold text-gray-700 mb-1">신앙으로 하루를 시작해 보세요</p>
          <p className="text-sm text-gray-400 leading-relaxed">
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
            <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-xs font-bold text-gray-400 w-10 flex-shrink-0">{group.time}</span>
              <span className="text-sm">{group.emoji}</span>
              <span className="flex-1 text-xs font-bold text-gray-700">{group.label} 루틴</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${allDone ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-500'}`}>
                {cnt}/{group.routines.length}
              </span>
            </div>
            <div className="bg-white divide-y divide-gray-50">
              {group.routines.map((r, idx) => (
                <FaithRoutineRow
                  key={r.id}
                  routine={r}
                  index={idx + 1}
                  onEdit={() => navigate(`/faith-routines/edit/${r.id}`)}
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
            <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
              <span className="text-sm">🙏</span>
              <span className="flex-1 text-xs font-bold text-gray-700">기타 신앙 루틴</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                unslotted.filter(r => isCompleted(r.id)).length === unslotted.length
                  ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-500'
              }`}>
                {unslotted.filter(r => isCompleted(r.id)).length}/{unslotted.length}
              </span>
            </div>
          )}
          <div className="bg-white divide-y divide-gray-50">
            {unslotted.map((r, idx) => (
              <FaithRoutineRow
                key={r.id}
                routine={r}
                index={idx + 1}
                onEdit={() => navigate(`/faith-routines/edit/${r.id}`)}
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
function FaithRoutineRow({ routine, index, onEdit, onRemove }: {
  routine: DailyRoutine;
  index: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const { toggleRoutineLog, isCompleted } = useRoutineStore();
  const [focusOpen, setFocusOpen] = useState(false);
  const done = isCompleted(routine.id);

  return (
    <>
      <motion.div
        layout
        className={`flex items-center gap-3 px-4 py-3 ${done ? 'opacity-70' : ''}`}
      >
        {/* 번호 */}
        <span className={`text-xs font-bold w-5 text-center flex-shrink-0 ${done ? 'text-gray-300' : 'text-gray-400'}`}>
          {index}
        </span>

        {/* 이모지 아이콘 (장식) */}
        <div className={`w-9 h-9 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 ${done ? 'bg-emerald-50' : 'bg-gray-100'}`}>
          {routine.emoji ?? (done ? '🙏' : '✝️')}
        </div>

        {/* 텍스트 */}
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold truncate ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
            {routine.title}
          </p>
          {routine.durationMinutes && (
            <p className="text-[11px] text-gray-400 mt-0.5">{routine.durationMinutes}분</p>
          )}
        </div>

        {/* 오른쪽: 포커스 시작 + 수정/삭제 + 체크 */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {!done && (
            <>
              <motion.button
                whileTap={{ scale: 0.88 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                onClick={() => setFocusOpen(true)}
                className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center"
              >
                <Play size={11} fill="currentColor" />
              </motion.button>
              <motion.button whileTap={{ scale: 0.85 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
                onClick={onEdit} className="text-gray-300 hover:text-indigo-400 transition-colors p-1">
                <Pencil size={13} />
              </motion.button>
              <motion.button whileTap={{ scale: 0.85 }} transition={{ type: 'spring', stiffness: 700, damping: 22 }}
                onClick={onRemove} className="text-gray-200 hover:text-red-400 transition-colors p-1">
                <Trash2 size={13} />
              </motion.button>
            </>
          )}

          {/* 체크 버튼 */}
          <motion.button
            whileTap={{ scale: 0.82 }}
            transition={{ type: 'spring', stiffness: 600, damping: 20 }}
            onClick={() => toggleRoutineLog(routine.id)}
            className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-colors ${
              done
                ? 'bg-emerald-500 border-emerald-500'
                : 'border-gray-300 hover:border-emerald-400'
            }`}
          >
            <AnimatePresence mode="wait" initial={false}>
              {done && (
                <motion.svg
                  key="check"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ type: 'spring', stiffness: 600, damping: 25 }}
                  width="11" height="9" viewBox="0 0 11 9" fill="none"
                >
                  <path d="M1 4.5L4 7.5L10 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </motion.svg>
              )}
            </AnimatePresence>
          </motion.button>
        </div>
      </motion.div>

      <AnimatePresence>
        {focusOpen && <FocusMode routine={routine} onClose={() => setFocusOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
