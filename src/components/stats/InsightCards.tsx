import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useRoutineStore } from '../../store/routineStore';
import { generateInsights, type Insight } from '../../utils/insights';
import { today } from '../../utils/date';

const COLOR_MAP = {
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', title: 'text-indigo-900', body: 'text-indigo-700', btn: 'bg-indigo-500' },
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', title: 'text-emerald-900', body: 'text-emerald-700', btn: 'bg-emerald-500' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-100', title: 'text-orange-900', body: 'text-orange-700', btn: 'bg-orange-500' },
  red: { bg: 'bg-red-50', border: 'border-red-100', title: 'text-red-900', body: 'text-red-700', btn: 'bg-red-500' },
};

export default function InsightCards() {
  const navigate = useNavigate();
  const { personalRoutines, faithRoutines, logs } = useRoutineStore();
  const insights = generateInsights(personalRoutines, faithRoutines, logs, today());

  if (insights.length === 0) return null;

  return (
    <div className="px-4 flex flex-col gap-2">
      <p className="text-xs font-semibold text-gray-500">패턴 분석</p>
      {insights.map((ins, i) => (
        <InsightCard key={ins.id} insight={ins} index={i} onAction={ins.actionPath ? () => navigate(ins.actionPath!) : undefined} />
      ))}
    </div>
  );
}

function InsightCard({ insight, index, onAction }: { insight: Insight; index: number; onAction?: () => void }) {
  const c = COLOR_MAP[insight.color];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 400, damping: 28 }}
      className={`rounded-2xl border p-4 ${c.bg} ${c.border}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none mt-0.5">{insight.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold leading-snug ${c.title}`}>{insight.title}</p>
          <p className={`text-xs mt-1 leading-relaxed ${c.body} opacity-80`}>{insight.body}</p>
          {onAction && insight.actionLabel && (
            <button
              onClick={onAction}
              className={`mt-2.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white ${c.btn}`}
            >
              {insight.actionLabel} →
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}
