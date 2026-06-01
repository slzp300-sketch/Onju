import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Check } from 'lucide-react';
import { useRoutineStore } from '../store/routineStore';
import type { TimeSlot } from '../types';
import { faithRoutineTemplates } from '../mocks/data/faithTemplates';

const TIME_SLOTS: { value: TimeSlot; label: string; emoji: string }[] = [
  { value: 'morning', label: '아침', emoji: '🌅' },
  { value: 'afternoon', label: '점심', emoji: '☀️' },
  { value: 'evening', label: '저녁', emoji: '🌙' },
];

type Mode = 'choose' | 'template' | 'custom';

export default function FaithRoutineNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { faithRoutines, addRoutine, updateRoutine } = useRoutineStore();

  const existing = id ? faithRoutines.find(r => r.id === id) : null;
  const isEdit = !!existing;

  const [mode, setMode] = useState<Mode>(isEdit ? 'custom' : 'choose');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [timeSlot, setTimeSlot] = useState<TimeSlot | null>(existing?.timeSlot ?? null);

  const handleSaveCustom = () => {
    if (!title.trim()) return;
    if (isEdit && existing) {
      updateRoutine(existing.id, { title: title.trim(), ...(timeSlot ? { timeSlot } : { timeSlot: undefined }) });
    } else {
      addRoutine({ id: `fr-${Date.now()}`, userId: 'user-1', title: title.trim(), type: 'faith', frequency: 'daily', isActive: true, order: faithRoutines.length, createdAt: new Date().toISOString(), ...(timeSlot ? { timeSlot } : {}) });
    }
    navigate(-1);
  };

  const handleAddTemplate = (t: typeof faithRoutineTemplates[0]) => {
    if (faithRoutines.find(r => r.title === t.title)) return;
    // eslint-disable-next-line react-hooks/purity
    const id = `fr-${Date.now()}`;
    addRoutine({ id, userId: 'user-1', title: t.title, type: 'faith', frequency: 'daily', isActive: true, order: faithRoutines.length, createdAt: new Date().toISOString() });
    navigate(-1);
  };

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-white border-b border-gray-100">
        <button onClick={() => mode === 'choose' ? navigate(-1) : setMode('choose')} className="p-1 -ml-1 text-gray-500">
          <ChevronLeft size={24} />
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-gray-900">
          {isEdit ? '신앙 루틴 수정' : '신앙 루틴 추가'}
        </h1>
        <div className="w-8" />
      </div>

      {/* 선택 화면 */}
      {mode === 'choose' && !isEdit && (
        <div className="flex-1 px-4 py-8 flex flex-col gap-4">
          <p className="text-xs text-gray-400 text-center mb-2">추가 방법을 선택해 주세요</p>

          <button onClick={() => setMode('template')}
            className="bg-white border border-gray-100 rounded-2xl px-5 py-5 text-left shadow-sm hover:border-emerald-200 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">📿</span>
              <p className="text-base font-bold text-gray-900">템플릿 선택</p>
            </div>
            <p className="text-sm text-gray-500">추천 신앙 루틴 중에서 골라보세요</p>
          </button>

          <button onClick={() => setMode('custom')}
            className="bg-white border border-gray-100 rounded-2xl px-5 py-5 text-left shadow-sm hover:border-emerald-200 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">✏️</span>
              <p className="text-base font-bold text-gray-900">직접 입력</p>
            </div>
            <p className="text-sm text-gray-500">나만의 신앙 루틴을 직접 만들어요</p>
          </button>
        </div>
      )}

      {/* 템플릿 목록 */}
      {mode === 'template' && (
        <div className="flex-1 px-4 py-5 flex flex-col gap-3 pb-8">
          <p className="text-xs text-gray-400">탭하면 바로 추가돼요</p>
          {faithRoutineTemplates.map(t => {
            const already = !!faithRoutines.find(r => r.title === t.title);
            return (
              <button key={t.id} onClick={() => handleAddTemplate(t)} disabled={already}
                className={`bg-white border rounded-2xl px-4 py-4 text-left shadow-sm transition-all ${already ? 'border-gray-100 opacity-40 cursor-not-allowed' : 'border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/40'}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{t.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>
                  </div>
                  {already
                    ? <span className="text-xs text-emerald-500 font-medium">추가됨</span>
                    : <Check size={18} className="text-gray-300" />
                  }
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* 직접 입력 */}
      {(mode === 'custom' || isEdit) && (
        <>
          <div className="flex-1 px-4 py-5 flex flex-col gap-5 pb-28">
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">루틴 이름</p>
              <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="신앙 루틴 이름" autoFocus
                className="w-full h-14 bg-white border border-gray-200 rounded-2xl px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-sm" />
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
              <p className="text-xs font-bold text-gray-500 mb-3">시간대 (선택)</p>
              <div className="flex gap-2">
                {TIME_SLOTS.map(ts => (
                  <button key={ts.value} onClick={() => setTimeSlot(timeSlot === ts.value ? null : ts.value)}
                    className={`flex-1 py-3 rounded-xl text-sm font-medium border transition-all ${timeSlot === ts.value ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500'}`}>
                    {ts.emoji} {ts.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-white border-t border-gray-100"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <button onClick={handleSaveCustom} disabled={!title.trim()}
              className="w-full py-4 mt-3 rounded-2xl bg-emerald-500 text-white font-bold text-base disabled:opacity-40 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-200">
              {isEdit ? '수정 완료' : '시작하기'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
