import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { format, addDays } from 'date-fns';
import { motion } from 'framer-motion';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import { useGoalStore } from '../store/goalStore';
import type { MonthlyGoal } from '../types';
import { formatDateRange, elapsedDays } from '../utils/date';

const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const defaultEnd = () => format(addDays(new Date(), 29), 'yyyy-MM-dd');

export default function MonthlyGoals() {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(defaultEnd);
  const { monthlyGoals, addMonthlyGoal, removeMonthlyGoal } = useGoalStore();

  const now = new Date();
  // 오늘 날짜가 startDate~endDate 범위에 포함된 목표만 표시
  const todayIso = format(now, 'yyyy-MM-dd');
  const activeGoals = monthlyGoals.filter(g => g.startDate <= todayIso && g.endDate >= todayIso);
  const pastGoals = monthlyGoals.filter(g => g.endDate < todayIso);

  const handleAdd = () => {
    if (!title.trim() || !startDate || !endDate) return;
    const s = new Date(startDate);
    const newGoal: MonthlyGoal = {
      id: `mg-${Date.now()}`,
      userId: 'user-1',
      title: title.trim(),
      description: description.trim() || undefined,
      month: s.getMonth() + 1,
      year: s.getFullYear(),
      startDate,
      endDate,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    addMonthlyGoal(newGoal);
    setTitle('');
    setDescription('');
    setStartDate(todayStr());
    setEndDate(defaultEnd());
    setShowCreate(false);
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5">
        <h1 className="text-heading2 font-bold text-label-strong font-brand">월간 목표</h1>
        <p className="text-caption1 text-label-alt mt-0.5">진행 중인 목표를 관리해요</p>
      </div>

      <div className="px-4 flex flex-col gap-3">
        {activeGoals.map(g => <GoalCard key={g.id} goal={g} onDelete={() => removeMonthlyGoal(g.id)} />)}

        {pastGoals.length > 0 && (
          <>
            <p className="text-caption1 font-semibold text-label-assistive mt-1">종료된 목표</p>
            {pastGoals.map(g => <GoalCard key={g.id} goal={g} onDelete={() => removeMonthlyGoal(g.id)} past />)}
          </>
        )}

        {/* 목표 추가 카드 */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 600, damping: 20 }}
          onClick={() => setShowCreate(true)}
          className="w-full rounded-xl border-2 border-dashed border-line py-5 flex items-center justify-center gap-2 text-label-assistive hover:border-primary hover:text-primary hover:bg-primary-soft/30 transition-all"
        >
          <Plus size={20} />
          <span className="text-body2 font-semibold">목표 추가</span>
        </motion.button>
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="목표 추가">
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="목표 이름을 입력하세요"
            className="input-base"
            autoFocus
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="목표 설명 (선택)"
            rows={2}
            className="w-full border border-line rounded-lg px-3 py-2.5 text-body2 focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(0,102,255,0.15)] resize-none transition-all bg-surface text-label placeholder-label-assistive"
          />
          <div className="flex flex-col gap-2">
            <p className="text-caption1 font-medium text-label-alt">목표 기간</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="flex-1 border border-line rounded-lg px-3 py-2 text-body2 focus:outline-none focus:border-primary transition-colors bg-surface text-label"
              />
              <span className="text-label-assistive text-body2">~</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={e => setEndDate(e.target.value)}
                className="flex-1 border border-line rounded-lg px-3 py-2 text-body2 focus:outline-none focus:border-primary transition-colors bg-surface text-label"
              />
            </div>
          </div>
          <Button onClick={handleAdd} disabled={!title.trim() || !startDate || !endDate} fullWidth>
            추가
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function GoalCard({ goal, onDelete, past }: { goal: MonthlyGoal; onDelete: () => void; past?: boolean }) {
  const { elapsed, total } = elapsedDays(goal.startDate, goal.endDate);
  const progress = Math.round((elapsed / total) * 100);

  return (
    <div className={`rounded-xl p-4 border shadow-emphasize ${past ? 'bg-fill border-line' : 'bg-primary-soft border-primary/20'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-caption1 font-medium mb-1 ${past ? 'text-label-assistive' : 'text-primary'}`}>
            {formatDateRange(goal.startDate, goal.endDate)}
          </p>
          <p className={`text-body2 font-semibold mb-1 ${past ? 'text-label-alt' : 'text-label-strong'}`}>{goal.title}</p>
          {goal.description && (
            <p className="text-caption1 text-label-assistive leading-relaxed">{goal.description}</p>
          )}
        </div>
        <button onClick={onDelete} className="text-label-assistive hover:text-negative transition-colors p-1 flex-shrink-0">
          <Trash2 size={14} />
        </button>
      </div>
      {!past && (
        <div className="mt-3">
          <div className="flex justify-between text-caption2 text-label-assistive mb-1">
            <span>D+{elapsed - 1}</span>
            <span>{elapsed}/{total}일</span>
          </div>
          <div className="bg-white/60 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
