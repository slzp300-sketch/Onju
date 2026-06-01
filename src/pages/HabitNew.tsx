import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHabitStore } from '../store/habitStore';
import type { HabitFrequency } from '../types';
import { WEEKDAY_LABELS } from '../types';

const FREQ_OPTIONS: { value: HabitFrequency; label: string; desc: string }[] = [
  { value: 'daily', label: '매일', desc: '매일 반복' },
  { value: 'weekdays', label: '평일', desc: '월~금 반복' },
  { value: 'weekends', label: '주말', desc: '토~일 반복' },
  { value: 'custom', label: '직접 선택', desc: '요일 선택' },
];

const POPULAR_EMOJIS = ['🏃', '💪', '📖', '✍️', '🎯', '🧘', '🚶', '💻', '🎵', '🌿', '☕', '🥗', '💤', '🧠', '❤️', '🌞', '🙏', '✝️', '📿', '🕊️', '🎨', '🏋️', '🚴', '🧹', '🌱', '📝', '🍎', '💧', '🎸', '📸'];

export default function HabitNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { habits, addHabit, updateHabit } = useHabitStore();
  const existing = id ? habits.find(h => h.id === id) : null;
  const isEdit = !!existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🏃');
  const [freq, setFreq] = useState<HabitFrequency>(existing?.frequency ?? 'daily');
  const [customDays, setCustomDays] = useState<number[]>(existing?.customDays ?? []);
  const [when, setWhen] = useState(existing?.when ?? '');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const freqLabel = FREQ_OPTIONS.find(f => f.value === freq)?.label ?? '매일';
  const whenPlaceholder = '예) 8:00 / 출근길';

  const handleSubmit = () => {
    if (!title.trim()) return;
    const data = {
      title: title.trim(), emoji, frequency: freq,
      ...(freq === 'custom' ? { customDays } : {}),
      when: when.trim(),
    };
    if (isEdit && existing) {
      updateHabit(existing.id, data);
    } else {
      addHabit({ id: `h-${Date.now()}`, userId: 'user-1', createdAt: new Date().toISOString(), ...data });
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
          {isEdit ? '습관 수정하기' : '습관 추가하기'}
        </h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5 pb-28">

        {/* 습관 이름 + 이모지 */}
        <div>
          <p className="text-xs font-bold text-gray-500 mb-2">습관 이름</p>
          <div className="flex gap-2">
            {/* 이모지 버튼 */}
            <div className="relative">
              <button
                onClick={() => setShowEmojiPicker(v => !v)}
                className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-3xl shadow-sm"
              >
                {emoji}
              </button>
              <AnimatePresence>
                {showEmojiPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.95 }}
                    className="absolute top-16 left-0 z-20 bg-white border border-gray-100 rounded-2xl shadow-xl p-3 w-64"
                  >
                    <div className="grid grid-cols-8 gap-1.5">
                      {POPULAR_EMOJIS.map(e => (
                        <button key={e} onClick={() => { setEmoji(e); setShowEmojiPicker(false); }}
                          className={`w-7 h-7 flex items-center justify-center rounded-lg text-xl hover:bg-gray-100 transition-colors ${emoji === e ? 'bg-indigo-50 ring-2 ring-indigo-300' : ''}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* 이름 입력 */}
            <input
              type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="습관 이름을 입력하세요"
              className="flex-1 h-14 bg-white border border-gray-200 rounded-2xl px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm"
              autoFocus
            />
          </div>
        </div>

        {/* 설정 항목들 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">

          {/* 반복 주기 */}
          <div className="border-b border-gray-50">
            <div className="px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📅</span>
                  <span className="text-sm font-semibold text-gray-800">반복 주기</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-sm text-gray-400">{freqLabel}</span>
                  <ChevronRight size={16} className="text-gray-300" />
                </div>
              </div>
              {/* 주기 선택 */}
              <div className="flex gap-2 mt-3 flex-wrap">
                {FREQ_OPTIONS.map(f => (
                  <button key={f.value} onClick={() => setFreq(f.value)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${freq === f.value ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 bg-gray-50'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
              {/* 요일 직접 선택 */}
              <AnimatePresence>
                {freq === 'custom' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="flex gap-1.5 mt-3">
                      {WEEKDAY_LABELS.map((label, idx) => (
                        <button key={idx} onClick={() => setCustomDays(d => d.includes(idx) ? d.filter(x => x !== idx) : [...d, idx])}
                          className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${customDays.includes(idx) ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500 bg-gray-50'}`}>
                          {label}
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 언제 할래요? */}
          <div className="px-4 py-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl">✅</span>
              <span className="text-sm font-semibold text-gray-800">언제 할래요?</span>
              <span className="text-xs text-gray-400 ml-auto">{whenPlaceholder}</span>
            </div>
            <input
              type="text" value={when} onChange={e => setWhen(e.target.value)}
              placeholder={whenPlaceholder}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            />
            <p className="text-xs text-gray-400 mt-1.5">시작 시간이나 행동 트리거를 적어주세요</p>
          </div>
        </div>

      </div>

      {/* 하단 시작하기 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 pb-safe bg-white border-t border-gray-100"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || (freq === 'custom' && customDays.length === 0)}
          className="w-full py-4 mt-3 rounded-2xl bg-indigo-500 text-white font-bold text-base disabled:opacity-40 hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-200"
        >
          {isEdit ? '수정 완료' : '시작하기'}
        </button>
      </div>
    </div>
  );
}
