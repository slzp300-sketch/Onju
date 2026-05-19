import { useState } from 'react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useGoalStore } from '../../store/goalStore';
import { currentWeek, currentYear } from '../../utils/date';
import type { WeeklyGoal } from '../../types';

interface GoalCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GoalCreateModal({ isOpen, onClose }: GoalCreateModalProps) {
  const [title, setTitle] = useState('');
  const { addWeeklyGoal, monthlyGoals } = useGoalStore();
  const [selectedMonthlyId, setSelectedMonthlyId] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    const newGoal: WeeklyGoal = {
      id: `wg-${Date.now()}`,
      userId: 'user-1',
      title: title.trim(),
      monthlyGoalId: selectedMonthlyId || undefined,
      weekNumber: currentWeek(),
      year: currentYear(),
      status: 'active',
      completionRate: 0,
      linkedRoutineIds: [],
      createdAt: new Date().toISOString(),
    };
    addWeeklyGoal(newGoal);
    setTitle('');
    setSelectedMonthlyId('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="이번 주 목표 추가">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1.5 block">목표 내용</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="이번 주 이루고 싶은 것은?"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          />
        </div>
        {monthlyGoals.length > 0 && (
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">월간 목표 연결 (선택)</label>
            <select
              value={selectedMonthlyId}
              onChange={e => setSelectedMonthlyId(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
            >
              <option value="">연결 안 함</option>
              {monthlyGoals.map(g => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </div>
        )}
        <Button onClick={handleSubmit} disabled={!title.trim()} fullWidth>
          목표 추가
        </Button>
      </div>
    </Modal>
  );
}
