import { useState } from 'react';
import { format } from 'date-fns';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useGoalStore } from '../../store/goalStore';
import { useSettingsStore } from '../../store/settingsStore';
import { currentWeek, currentYear, getWeekRangeFor } from '../../utils/date';
import type { WeeklyGoal } from '../../types';

interface GoalCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function GoalCreateModal({ isOpen, onClose }: GoalCreateModalProps) {
  const { weekStartDay } = useSettingsStore();
  const { start, end } = getWeekRangeFor(new Date(), weekStartDay);
  const defaultStart = format(start, 'yyyy-MM-dd');
  const defaultEnd = format(end, 'yyyy-MM-dd');

  const [title, setTitle] = useState('');
  const [selectedMonthlyId, setSelectedMonthlyId] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const { addWeeklyGoal, monthlyGoals } = useGoalStore();

  const handleSubmit = () => {
    if (!title.trim()) return;
    const newGoal: WeeklyGoal = {
      id: `wg-${Date.now()}`,
      userId: 'user-1',
      title: title.trim(),
      monthlyGoalId: selectedMonthlyId || undefined,
      weekNumber: currentWeek(),
      year: currentYear(),
      startDate,
      endDate,
      status: 'active',
      completionRate: 0,
      linkedRoutineIds: [],
      createdAt: new Date().toISOString(),
    };
    addWeeklyGoal(newGoal);
    setTitle('');
    setSelectedMonthlyId('');
    setStartDate(defaultStart);
    setEndDate(defaultEnd);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="목표 추가">
      <div className="flex flex-col gap-4">
        <div>
          <label className="text-xs font-medium text-gray-600 mb-1.5 block">목표 내용</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder="이번 기간 이루고 싶은 것은?"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs font-medium text-gray-600 mb-1.5 block">목표 기간</label>
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
