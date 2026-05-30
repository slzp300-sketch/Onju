import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { format, addDays } from 'date-fns';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import EmptyState from '../components/ui/EmptyState';
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
      <div className="px-4 pt-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">월간 목표</h1>
          <p className="text-xs text-gray-400 mt-0.5">진행 중인 목표를 관리해요</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> 추가
        </Button>
      </div>

      <div className="px-4 flex flex-col gap-3">
        {activeGoals.length === 0 && pastGoals.length === 0 ? (
          <EmptyState
            title="진행 중인 목표가 없어요"
            description="목표를 추가하고 날짜를 직접 설정해 보세요"
            action={
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus size={14} /> 목표 추가
              </Button>
            }
          />
        ) : (
          <>
            {activeGoals.map(g => <GoalCard key={g.id} goal={g} onDelete={() => removeMonthlyGoal(g.id)} />)}
            {pastGoals.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 mt-2">종료된 목표</p>
                {pastGoals.map(g => <GoalCard key={g.id} goal={g} onDelete={() => removeMonthlyGoal(g.id)} past />)}
              </>
            )}
          </>
        )}
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="목표 추가">
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="목표 이름을 입력하세요"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="목표 설명 (선택)"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-gray-600">목표 기간</p>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
              <span className="text-gray-400 text-sm">~</span>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={e => setEndDate(e.target.value)}
                className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
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
    <div className={`rounded-2xl p-4 border ${past ? 'bg-gray-50 border-gray-100' : 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-medium mb-1 ${past ? 'text-gray-400' : 'text-indigo-500'}`}>
            {formatDateRange(goal.startDate, goal.endDate)}
          </p>
          <p className={`text-sm font-semibold mb-1 ${past ? 'text-gray-500' : 'text-gray-900'}`}>{goal.title}</p>
          {goal.description && (
            <p className="text-xs text-gray-400 leading-relaxed">{goal.description}</p>
          )}
        </div>
        <button onClick={onDelete} className="text-gray-300 hover:text-red-400 transition-colors p-1 flex-shrink-0">
          <Trash2 size={14} />
        </button>
      </div>
      {!past && (
        <div className="mt-3">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>D+{elapsed - 1}</span>
            <span>{elapsed}/{total}일</span>
          </div>
          <div className="bg-white/60 rounded-full h-1.5 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
