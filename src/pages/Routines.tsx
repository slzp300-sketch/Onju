import { useState } from 'react';
import { Plus } from 'lucide-react';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import RoutineTrackA from '../components/routines/RoutineTrackA';
import RoutineTrackB from '../components/routines/RoutineTrackB';
import EmptyState from '../components/ui/EmptyState';
import { useRoutineStore } from '../store/routineStore';
import type { DailyRoutine } from '../types';
import { faithRoutineTemplates } from '../mocks/data/faithTemplates';

export default function Routines() {
  const [showAddPersonal, setShowAddPersonal] = useState(false);
  const [showAddFaith, setShowAddFaith] = useState(false);
  const [personalTitle, setPersonalTitle] = useState('');
  const { personalRoutines, faithRoutines, addRoutine } = useRoutineStore();

  const handleAddPersonal = () => {
    if (!personalTitle.trim()) return;
    const r: DailyRoutine = {
      id: `pr-${Date.now()}`,
      userId: 'user-1',
      title: personalTitle.trim(),
      type: 'personal',
      frequency: 'daily',
      isActive: true,
      order: personalRoutines.length,
      createdAt: new Date().toISOString(),
    };
    addRoutine(r);
    setPersonalTitle('');
    setShowAddPersonal(false);
  };

  const handleAddFaith = (template: typeof faithRoutineTemplates[0]) => {
    const already = faithRoutines.find(r => r.title === template.title);
    if (already) return;
    const r: DailyRoutine = {
      id: `fr-${Date.now()}`,
      userId: 'user-1',
      title: template.title,
      type: 'faith',
      frequency: 'daily',
      isActive: true,
      order: faithRoutines.length,
      createdAt: new Date().toISOString(),
    };
    addRoutine(r);
    setShowAddFaith(false);
  };

  return (
    <div className="flex flex-col gap-4 pb-4">
      <div className="px-4 pt-5">
        <h1 className="text-lg font-bold text-gray-900">루틴 관리</h1>
      </div>

      {/* 개인 루틴 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-900">개인 루틴</p>
          <Button variant="ghost" size="sm" onClick={() => setShowAddPersonal(true)}>
            <Plus size={15} />
          </Button>
        </div>
        {personalRoutines.length === 0
          ? <EmptyState title="개인 루틴이 없어요" description="+ 버튼으로 루틴을 추가해 보세요" />
          : <RoutineTrackA />
        }
      </Card>

      {/* 신앙 루틴 */}
      <Card className="mx-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-gray-900">신앙 루틴</p>
          <Button variant="ghost" size="sm" onClick={() => setShowAddFaith(true)}>
            <Plus size={15} />
          </Button>
        </div>
        {faithRoutines.length === 0
          ? <EmptyState title="신앙 루틴이 없어요" description="+ 버튼으로 루틴을 추가해 보세요" />
          : <RoutineTrackB />
        }
      </Card>

      {/* 개인 루틴 추가 모달 */}
      <Modal isOpen={showAddPersonal} onClose={() => setShowAddPersonal(false)} title="개인 루틴 추가">
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={personalTitle}
            onChange={e => setPersonalTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAddPersonal()}
            placeholder="루틴 이름을 입력하세요"
            className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            autoFocus
          />
          <Button onClick={handleAddPersonal} disabled={!personalTitle.trim()} fullWidth>
            추가
          </Button>
        </div>
      </Modal>

      {/* 신앙 루틴 추가 모달 */}
      <Modal isOpen={showAddFaith} onClose={() => setShowAddFaith(false)} title="신앙 루틴 선택">
        <div className="flex flex-col gap-2">
          {faithRoutineTemplates.map(t => {
            const already = faithRoutines.find(r => r.title === t.title);
            return (
              <button
                key={t.id}
                onClick={() => handleAddFaith(t)}
                disabled={!!already}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  already
                    ? 'border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed'
                    : 'border-gray-200 hover:border-emerald-300 hover:bg-emerald-50'
                }`}
              >
                <p className="text-sm font-medium text-gray-900">{t.title}</p>
                <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>
                {already && <p className="text-xs text-gray-400 mt-1">이미 추가됨</p>}
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}
