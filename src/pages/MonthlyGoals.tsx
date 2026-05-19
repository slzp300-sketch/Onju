import { useState } from 'react';
import { Plus } from 'lucide-react';

import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import MonthlyGoalCard from '../components/goals/MonthlyGoalCard';
import EmptyState from '../components/ui/EmptyState';
import { useGoalStore } from '../store/goalStore';
import type { MonthlyGoal } from '../types';

export default function MonthlyGoals() {
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const { monthlyGoals, setMonthlyGoals } = useGoalStore();

  const now = new Date();
  const currentGoals = monthlyGoals.filter(
    g => g.month === now.getMonth() + 1 && g.year === now.getFullYear()
  );

  const handleAdd = () => {
    if (!title.trim()) return;
    const newGoal: MonthlyGoal = {
      id: `mg-${Date.now()}`,
      userId: 'user-1',
      title: title.trim(),
      description: description.trim() || undefined,
      month: now.getMonth() + 1,
      year: now.getFullYear(),
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    setMonthlyGoals([...monthlyGoals, newGoal]);
    setTitle('');
    setDescription('');
    setShowCreate(false);
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-gray-900">월간 목표</h1>
          <p className="text-xs text-gray-400">{now.getFullYear()}년 {now.getMonth() + 1}월</p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={15} /> 추가
        </Button>
      </div>

      <div className="px-4 flex flex-col gap-3">
        {currentGoals.length === 0 ? (
          <EmptyState
            title="이번 달 목표가 없어요"
            description="이번 달 큰 목표를 설정하고 주간 목표와 연결해 보세요"
            action={
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus size={14} /> 목표 추가
              </Button>
            }
          />
        ) : (
          currentGoals.map(g => <MonthlyGoalCard key={g.id} goal={g} />)
        )}
      </div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="월간 목표 추가">
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="이번 달 큰 목표는 무엇인가요?"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          />
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="목표에 대한 설명 (선택)"
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
          />
          <Button onClick={handleAdd} disabled={!title.trim()} fullWidth>
            추가
          </Button>
        </div>
      </Modal>
    </div>
  );
}
