import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Timer, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHabitStore } from '../store/habitStore';

const POPULAR_EMOJIS = ['🎯', '🌅', '🌙', '☀️', '💪', '🧘', '📖', '🙏', '✝️', '🏃', '🎵', '🌿', '💻', '✍️', '❤️', '🌟'];

export default function PersonalRoutineNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { habits, personalRoutines, addPersonalRoutine, updatePersonalRoutine } = useHabitStore();

  const existing = id ? personalRoutines.find(r => r.id === id) : null;
  const isEdit = !!existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🎯');
  const [when, setWhen] = useState(existing?.when ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(existing?.habitIds ?? []);
  const [timerEnabled, setTimerEnabled] = useState(existing?.timerEnabled ?? false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const toggle = (id: string) =>
    setSelectedIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);

  const handleSubmit = () => {
    if (!title.trim() || selectedIds.length < 2) return;
    const data = { title: title.trim(), emoji, when: when.trim(), habitIds: selectedIds, timerEnabled };
    if (isEdit && existing) {
      updatePersonalRoutine(existing.id, data);
    } else {
      addPersonalRoutine({ id: `pr-${Date.now()}`, userId: 'user-1', createdAt: new Date().toISOString(), ...data });
    }
    navigate(-1);
  };

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-white border-b border-gray-100">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-500">
          <ChevronLeft size={24} />
        </button>
        <h1 className="flex-1 text-center text-base font-bold text-gray-900">
          {isEdit ? '루틴 수정하기' : '루틴 추가하기'}
        </h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5 pb-28">

        {/* 루틴 이름 + 이모지 */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">루틴 이름</p>
          <div className="flex gap-2">
            <div className="relative">
              <button onClick={() => setShowEmojiPicker(v => !v)}
                className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-3xl shadow-sm">
                {emoji}
              </button>
              <AnimatePresence>
                {showEmojiPicker && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                    className="absolute top-16 left-0 z-20 bg-white border border-gray-100 rounded-2xl shadow-xl p-3 w-60">
                    <div className="grid grid-cols-8 gap-1.5">
                      {POPULAR_EMOJIS.map(e => (
                        <button key={e} onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                          className={`w-7 h-7 flex items-center justify-center rounded-lg text-xl hover:bg-gray-100 ${emoji === e ? 'bg-indigo-50 ring-2 ring-indigo-300' : ''}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="루틴 이름을 입력하세요" autoFocus
              className="flex-1 h-14 bg-white border border-gray-200 rounded-2xl px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm" />
          </div>
        </div>

        {/* 설정 항목들 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          {/* 언제 */}
          <div className="px-4 py-4 border-b border-gray-50">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">⏰</span>
              <span className="text-sm font-semibold text-gray-800">언제 할래요?</span>
            </div>
            <input type="text" value={when} onChange={e => setWhen(e.target.value)}
              placeholder="예) 아침 7시, 출근 전"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>

          {/* 타이머 */}
          <div className="px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Timer size={20} className="text-indigo-500" />
              <div>
                <p className="text-sm font-semibold text-gray-800">타이머 기능</p>
                <p className="text-xs text-gray-400">루틴 실행 시 습관마다 타이머 작동</p>
              </div>
            </div>
            <button onClick={() => setTimerEnabled(v => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative ${timerEnabled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
              <motion.div animate={{ x: timerEnabled ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow" />
            </button>
          </div>
        </div>

        {/* 습관 선택 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-500">습관 선택</p>
            <span className={`text-xs font-bold ${selectedIds.length >= 2 ? 'text-indigo-500' : 'text-gray-400'}`}>
              {selectedIds.length}개 선택 (최소 2개)
            </span>
          </div>

          {habits.length === 0 ? (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-4 text-center">
              <p className="text-sm font-semibold text-amber-700">등록된 습관이 없어요</p>
              <p className="text-xs text-amber-600 mt-0.5">먼저 습관을 추가해 주세요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {habits.map(h => {
                const sel = selectedIds.includes(h.id);
                const order = selectedIds.indexOf(h.id) + 1;
                return (
                  <button key={h.id} onClick={() => toggle(h.id)}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border transition-all text-left ${sel ? 'border-indigo-300 bg-indigo-50' : 'border-gray-100 bg-white'}`}>
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-sm font-bold transition-all ${sel ? 'bg-indigo-500 text-white' : 'border-2 border-gray-200 text-transparent'}`}>
                      {sel ? order : <Check size={14} className="text-transparent" />}
                    </div>
                    <span className="text-2xl">{h.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800">{h.title}</p>
                      {h.when && <p className="text-xs text-gray-400 truncate">{h.when}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* 하단 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-white border-t border-gray-100"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button onClick={handleSubmit}
          disabled={!title.trim() || selectedIds.length < 2}
          className="w-full py-4 mt-3 rounded-2xl bg-indigo-500 text-white font-bold text-base disabled:opacity-40 hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-200">
          {isEdit ? '수정 완료' : '시작하기'}
        </button>
      </div>
    </div>
  );
}
