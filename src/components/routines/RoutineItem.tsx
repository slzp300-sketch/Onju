import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import type { DailyRoutine } from '../../types';
import { useRoutineStore } from '../../store/routineStore';
import { today } from '../../utils/date';

interface RoutineItemProps {
  routine: DailyRoutine;
  dragHandle?: React.ReactNode;
}

export default function RoutineItem({ routine, dragHandle }: RoutineItemProps) {
  const { toggleRoutineLog, isCompleted } = useRoutineStore();
  const done = isCompleted(routine.id, today());

  const handleToggle = () => {
    toggleRoutineLog(routine.id, today());
  };

  return (
    <motion.div
      layout
      className={[
        'flex items-center gap-3 py-3 px-1 rounded-xl transition-colors',
        done ? 'opacity-70' : '',
      ].join(' ')}
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
              : 'bg-indigo-500 border-indigo-500'
            : 'border-gray-300 bg-white',
        ].join(' ')}
      >
        <AnimatedCheck done={done} />
      </motion.button>
      <span className={`text-sm flex-1 ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>
        {routine.title}
      </span>
    </motion.div>
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
