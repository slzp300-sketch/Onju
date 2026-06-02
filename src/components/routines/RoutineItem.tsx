import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Play, Clock } from 'lucide-react';
import type { DailyRoutine } from '../../types';
import { useRoutineStore } from '../../store/routineStore';
import { today } from '../../utils/date';
import FocusMode from './FocusMode';

interface RoutineItemProps {
  routine: DailyRoutine;
  dragHandle?: React.ReactNode;
}

export default function RoutineItem({ routine, dragHandle }: RoutineItemProps) {
  const { toggleRoutineLog, isCompleted } = useRoutineStore();
  const done = isCompleted(routine.id, today());
  const [focusOpen, setFocusOpen] = useState(false);

  const handleToggle = () => {
    toggleRoutineLog(routine.id, today());
  };

  return (
    <>
      <motion.div
        layout
        className={['flex items-center gap-3 py-3 px-1 rounded-xl', done ? 'opacity-60' : ''].join(' ')}
      >
        {dragHandle}

        <motion.button
          onClick={handleToggle}
          whileTap={{ scale: 0.85 }}
          className={[
            'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
            done
              ? routine.type === 'faith'
                ? 'bg-emerald-500 border-emerald-500'
                : 'bg-primary border-indigo-500'
              : 'border-line bg-white',
          ].join(' ')}
        >
          <AnimatedCheck done={done} />
        </motion.button>

        <div className="flex-1 min-w-0">
          <span className={`text-sm ${done ? 'line-through text-label-alt' : 'text-label-strong'}`}>
            {routine.title}
          </span>
          {routine.durationMinutes && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-label-alt">
              <Clock size={10} />
              {routine.durationMinutes}분
            </span>
          )}
        </div>

        {!done && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setFocusOpen(true)}
            className={[
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
              routine.type === 'faith'
                ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                : 'bg-primary-soft text-primary hover:bg-primary-soft',
            ].join(' ')}
          >
            <Play size={11} fill="currentColor" />
            시작
          </motion.button>
        )}
      </motion.div>

      <AnimatePresence>
        {focusOpen && (
          <FocusMode routine={routine} onClose={() => setFocusOpen(false)} />
        )}
      </AnimatePresence>
    </>
  );
}

function AnimatedCheck({ done }: { done: boolean }) {
  return (
    <motion.div
      initial={false}
      animate={{ scale: done ? 1 : 0, opacity: done ? 1 : 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    >
      <Check size={14} strokeWidth={3} className="text-white" />
    </motion.div>
  );
}
