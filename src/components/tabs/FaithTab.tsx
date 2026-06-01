import { useState } from 'react';
import { Trash2, Play, Pencil, BookOpen } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
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

  const grouped = TIME_SLOTS.map(slot => ({
    ...slot,
    routines: faithRoutines.filter(r => r.timeSlot === slot.value),
  })).filter(g => g.routines.length > 0);
  const unslotted = faithRoutines.filter(r => !r.timeSlot);

  return (
    <div className="flex flex-col pb-4">
      {faithRoutines.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center text-4xl mb-5">
            🙏
          </div>
          <p className="text-base font-bold text-gray-700 mb-1">신앙으로 하루를 시작해 보세요</p>
          <p className="text-sm text-gray-400 leading-relaxed">
            말씀과 기도로 쌓아가는 하루가<br />직장 생활의 든든한 버팀목이 돼요
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {grouped.map(group => {
            const cnt = group.routines.filter(r => isCompleted(r.id)).length;
            return (
              <div key={group.value}>
                <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                  <span className="text-xs font-bold text-gray-400 w-10">{group.time}</span>
                  <span>{group.emoji}</span>
                  <span className="flex-1 text-xs font-bold text-gray-700">{group.label} 루틴</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cnt === group.routines.length ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-200 text-gray-500'}`}>
                    {cnt}/{group.routines.length}
                  </span>
                </div>
                <div className="bg-white divide-y divide-gray-50">
                  {group.routines.map((r, idx) => (
                    <FaithRow key={r.id} index={idx + 1} routine={r}
                      onEdit={() => navigate(`/faith-routines/edit/${r.id}`)}
                      onRemove={() => removeRoutine(r.id)} />
                  ))}
                </div>
              </div>
            );
          })}
          {unslotted.length > 0 && (
            <div>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <span>🙏</span>
                <span className="flex-1 text-xs font-bold text-gray-700">기타</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-200 text-gray-500">
                  {unslotted.filter(r => isCompleted(r.id)).length}/{unslotted.length}
                </span>
              </div>
              <div className="bg-white divide-y divide-gray-50">
                {unslotted.map((r, idx) => (
                  <FaithRow key={r.id} index={idx + 1} routine={r}
                    onEdit={() => navigate(`/faith-routines/edit/${r.id}`)}
                    onRemove={() => removeRoutine(r.id)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <FAB options={fabOptions} />
    </div>
  );
}

function FaithRow({ index, routine, onEdit, onRemove }: {
  index: number; routine: DailyRoutine; onEdit: () => void; onRemove: () => void;
}) {
  const { toggleRoutineLog, isCompleted } = useRoutineStore();
  const [focusOpen, setFocusOpen] = useState(false);
  const done = isCompleted(routine.id);
  return (
    <>
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xs font-bold w-5 text-center text-gray-400 flex-shrink-0">{index}</span>
        <button onClick={() => toggleRoutineLog(routine.id)}
          className={`w-8 h-8 rounded-xl flex items-center justify-center text-base transition-all ${done ? 'bg-emerald-100' : 'bg-gray-100'}`}>
          {done ? '🙏' : '✝️'}
        </button>
        <p className={`flex-1 text-sm font-medium ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{routine.title}</p>
        {!done && (
          <button onClick={() => setFocusOpen(true)} className="w-7 h-7 rounded-full bg-emerald-50 text-emerald-500 flex items-center justify-center">
            <Play size={11} fill="currentColor" />
          </button>
        )}
        <button onClick={onEdit} className="text-gray-300 hover:text-indigo-500 transition-colors p-1"><Pencil size={14} /></button>
        <button onClick={onRemove} className="text-gray-200 hover:text-red-400 transition-colors p-1"><Trash2 size={14} /></button>
      </div>
      <AnimatePresence>
        {focusOpen && <FocusMode routine={routine} onClose={() => setFocusOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
