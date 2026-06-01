import { useState } from 'react';
import { Trash2, Timer, Pencil, CheckSquare, LayoutList } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import FAB from '../ui/FAB';
import { useHabitStore } from '../../store/habitStore';
import type { Habit } from '../../types';
import { WEEKDAY_LABELS } from '../../types';

type SubTab = 'habit' | 'routine';

/* ════════════════════════════════════════
   개인 탭 (최상위)
════════════════════════════════════════ */
export default function PersonalTab() {
  const [sub, setSub] = useState<SubTab>('habit');
  const { habits, personalRoutines } = useHabitStore();
  const navigate = useNavigate();

  const fabOptions = [
    {
      icon: <CheckSquare size={20} />,
      label: '습관 추가',
      sub: '1개의 반복 할 일',
      color: 'bg-indigo-600',
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

  return (
    <div className="flex flex-col">
      {/* 서브탭 */}
      <div className="flex gap-2 px-4 py-3">
        {([
          { key: 'habit' as SubTab, label: '습관', count: habits.length },
          { key: 'routine' as SubTab, label: '루틴', count: personalRoutines.length },
        ]).map(s => (
          <button key={s.key} onClick={() => setSub(s.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${sub === s.key ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'}`}>
            {s.label}
            {s.count > 0 && (
              <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${sub === s.key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-500'}`}>{s.count}</span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {sub === 'habit'
          ? <motion.div key="h" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}><HabitSubTab /></motion.div>
          : <motion.div key="r" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.15 }}><RoutineSubTab /></motion.div>
        }
      </AnimatePresence>

      <FAB options={fabOptions} />
    </div>
  );
}

/* ── 습관 서브탭 ── */
function HabitSubTab() {
  const { habits, removeHabit } = useHabitStore();
  const navigate = useNavigate();

  const freqLabel = (h: Habit) => {
    if (h.frequency === 'daily') return '매일';
    if (h.frequency === 'weekdays') return '평일';
    if (h.frequency === 'weekends') return '주말';
    return (h.customDays ?? []).map(d => WEEKDAY_LABELS[d]).join('·');
  };

  if (habits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-4xl mb-5">
          😊
        </div>
        <p className="text-base font-bold text-gray-700 mb-1">첫 번째 습관을 시작해 보세요</p>
        <p className="text-sm text-gray-400 leading-relaxed">
          작은 습관 하나가 직장 생활을<br />조금 더 단단하게 만들어 줄 거예요
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 px-4 pb-4 pt-2">
      {habits.map(h => (
        <div key={h.id} className="flex items-center gap-3 bg-white border border-gray-100 rounded-2xl px-4 py-3.5">
          <span className="text-2xl flex-shrink-0">{h.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">{h.title}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">{freqLabel(h)}</span>
              {h.when && <span className="text-[11px] text-gray-400 truncate">· {h.when}</span>}
            </div>
          </div>
          <button onClick={() => navigate(`/habits/edit/${h.id}`)} className="text-gray-300 hover:text-indigo-500 transition-colors p-1"><Pencil size={14} /></button>
          <button onClick={() => removeHabit(h.id)} className="text-gray-200 hover:text-red-400 transition-colors p-1"><Trash2 size={14} /></button>
        </div>
      ))}
    </div>
  );
}

/* ── 루틴 서브탭 ── */
function RoutineSubTab() {
  const { habits, personalRoutines, removePersonalRoutine } = useHabitStore();
  const navigate = useNavigate();

  if (personalRoutines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-indigo-100 flex items-center justify-center text-4xl mb-5">
          🗂️
        </div>
        <p className="text-base font-bold text-gray-700 mb-1">나만의 루틴을 만들어 보세요</p>
        <p className="text-sm text-gray-400 leading-relaxed">
          습관들을 묶어 루틴으로 만들면<br />하루를 더 체계적으로 보낼 수 있어요
        </p>
        {habits.length < 2 && (
          <div className="mt-4 px-4 py-2.5 bg-amber-50 border border-amber-100 rounded-2xl">
            <p className="text-xs text-amber-700 font-medium">💡 먼저 습관을 2개 이상 추가해 주세요</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4 pt-2">
      {personalRoutines.map(r => {
        const rHabits = r.habitIds.map(id => habits.find(h => h.id === id)).filter(Boolean) as Habit[];
        return (
          <div key={r.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-50">
              <span className="text-2xl">{r.emoji}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900">{r.title}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {r.when && <span className="text-[11px] text-gray-400">{r.when}</span>}
                  {r.timerEnabled && <span className="flex items-center gap-0.5 text-[11px] font-medium text-indigo-500"><Timer size={10} /> 타이머</span>}
                </div>
              </div>
              <button onClick={() => navigate(`/personal-routines/edit/${r.id}`)} className="text-gray-300 hover:text-indigo-500 transition-colors p-1"><Pencil size={14} /></button>
              <button onClick={() => removePersonalRoutine(r.id)} className="text-gray-200 hover:text-red-400 transition-colors p-1"><Trash2 size={14} /></button>
            </div>
            <div className="px-4 py-2">
              {rHabits.map((h, idx) => (
                <div key={h.id} className="flex items-center gap-2 py-1.5">
                  <span className="text-xs font-bold text-gray-300 w-4">{idx + 1}</span>
                  <span className="text-base">{h.emoji}</span>
                  <span className="text-sm text-gray-700 font-medium">{h.title}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
