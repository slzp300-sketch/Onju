import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Check, Timer } from 'lucide-react';
import EmojiPickerButton from '../components/ui/EmojiPickerButton';
import DurationPicker from '../components/ui/DurationPicker';
import { useRoutineStore } from '../store/routineStore';
import type { TimeSlot } from '../types';
import { faithRoutineTemplates } from '../mocks/data/faithTemplates';

const tap = { whileTap: { scale: 0.96 }, transition: { type: 'spring' as const, stiffness: 600, damping: 20 } };
const tapSm = { whileTap: { scale: 0.88 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };

const TIME_SLOTS: { value: TimeSlot; label: string; emoji: string }[] = [
  { value: 'morning', label: '아침', emoji: '🌅' },
  { value: 'afternoon', label: '점심', emoji: '☀️' },
  { value: 'evening', label: '저녁', emoji: '🌙' },
];

// 템플릿 기본 이모지 매핑
const TEMPLATE_EMOJI: Record<string, string> = {
  '기도': '🙏', '말씀': '📖', '감사 일기': '📝', '정체성 점검': '✅',
  '중보기도 메모': '📿', '저녁 되돌아보기': '🌙',
};

type Mode = 'choose' | 'template' | 'template-config' | 'custom';

export default function FaithRoutineNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { faithRoutines, addRoutine, updateRoutine } = useRoutineStore();

  const existing = id ? faithRoutines.find(r => r.id === id) : null;
  const isEdit = !!existing;

  const [mode, setMode] = useState<Mode>(isEdit ? 'custom' : 'choose');

  // 폼 상태 (custom / template-config 공용)
  const [title, setTitle] = useState(existing?.title ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '🙏');
  const [timeSlot, setTimeSlot] = useState<TimeSlot | null>(existing?.timeSlot ?? null);
  const [timerEnabled, setTimerEnabled] = useState(!!(existing?.durationSeconds));
  const [durationSeconds, setDurationSeconds] = useState(existing?.durationSeconds ?? 60);

  // 뒤로가기 처리
  const handleBack = () => {
    if (isEdit) { navigate(-1); return; }
    if (mode === 'choose') { navigate(-1); return; }
    if (mode === 'template-config') { setMode('template'); return; }
    setMode('choose');
  };

  // 저장
  const handleSave = () => {
    if (!title.trim()) return;
    if (isEdit && existing) {
      updateRoutine(existing.id, {
        title: title.trim(), emoji,
        ...(timeSlot ? { timeSlot } : { timeSlot: undefined }),
        ...(timerEnabled ? { durationSeconds } : { durationSeconds: undefined }),
      });
    } else {
      addRoutine({
        id: `fr-${Date.now()}`, userId: 'user-1', title: title.trim(), emoji,
        type: 'faith', frequency: 'daily', isActive: true,
        order: faithRoutines.length, createdAt: new Date().toISOString(),
        ...(timeSlot ? { timeSlot } : {}),
        ...(timerEnabled ? { durationSeconds } : {}),
      });
    }
    navigate(-1);
  };

  // 템플릿 선택 → 설정 화면으로
  const selectTemplate = (t: typeof faithRoutineTemplates[0]) => {
    if (faithRoutines.find(r => r.title === t.title)) return;
    setTitle(t.title);
    setEmoji(TEMPLATE_EMOJI[t.title] ?? '🙏');
    setTimeSlot(null);
    setTimerEnabled(false);
    setDurationSeconds(60);
    setMode('template-config');
  };

  const pageTitle = isEdit ? '신앙 루틴 수정'
    : mode === 'template-config' ? '루틴 설정'
    : '신앙 루틴 추가';

  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-white border-b border-gray-100">
        <motion.button {...tapSm} onClick={handleBack} className="p-1 -ml-1 text-gray-500">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-base font-bold text-gray-900">{pageTitle}</h1>
        <div className="w-8" />
      </div>

      {/* ── 선택 화면 ── */}
      {mode === 'choose' && !isEdit && (
        <div className="flex-1 px-4 py-8 flex flex-col gap-4">
          <p className="text-xs text-gray-400 text-center mb-2">추가 방법을 선택해 주세요</p>
          <motion.button {...tap} onClick={() => setMode('template')}
            className="bg-white border border-gray-100 rounded-2xl px-5 py-5 text-left shadow-sm hover:border-emerald-200 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">📿</span>
              <p className="text-base font-bold text-gray-900">템플릿 선택</p>
            </div>
            <p className="text-sm text-gray-500">추천 신앙 루틴 중에서 골라보세요</p>
          </motion.button>
          <motion.button {...tap} onClick={() => setMode('custom')}
            className="bg-white border border-gray-100 rounded-2xl px-5 py-5 text-left shadow-sm hover:border-emerald-200 transition-colors">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">✏️</span>
              <p className="text-base font-bold text-gray-900">직접 입력</p>
            </div>
            <p className="text-sm text-gray-500">나만의 신앙 루틴을 직접 만들어요</p>
          </motion.button>
        </div>
      )}

      {/* ── 템플릿 목록 ── */}
      {mode === 'template' && (
        <div className="flex-1 px-4 py-5 flex flex-col gap-3 pb-8">
          <p className="text-xs text-gray-400">탭해서 세부 설정 후 추가하세요</p>
          {faithRoutineTemplates.map(t => {
            const already = !!faithRoutines.find(r => r.title === t.title);
            return (
              <motion.button key={t.id} {...tap} onClick={() => selectTemplate(t)} disabled={already}
                className={`bg-white border rounded-2xl px-4 py-4 text-left shadow-sm transition-all ${already ? 'border-gray-100 opacity-40 cursor-not-allowed' : 'border-gray-100 hover:border-emerald-300 hover:bg-emerald-50/40'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{TEMPLATE_EMOJI[t.title] ?? '🙏'}</span>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{t.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{t.description}</p>
                    </div>
                  </div>
                  {already
                    ? <span className="text-xs text-emerald-500 font-medium flex-shrink-0">추가됨</span>
                    : <Check size={18} className="text-gray-300 flex-shrink-0" />
                  }
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      {/* ── 설정 화면 (템플릿 config + 직접 입력 + 수정 공용) ── */}
      {(mode === 'template-config' || mode === 'custom' || isEdit) && (
        <>
          <div className="flex-1 px-4 py-5 flex flex-col gap-5 pb-28">
            {/* 이름 */}
            <div>
              <p className="text-xs font-bold text-gray-500 mb-2">루틴 이름</p>
              <div className="flex gap-2">
                <EmojiPickerButton emoji={emoji} onChange={setEmoji} />
                <input type="text" value={title} onChange={e => setTitle(e.target.value)}
                  placeholder="신앙 루틴 이름"
                  className="flex-1 h-14 bg-white border border-gray-200 rounded-2xl px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-400 shadow-sm" />
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              {/* 시간대 */}
              <div className="px-4 py-4 border-b border-gray-50">
                <p className="text-xs font-bold text-gray-500 mb-3">시간대 (선택)</p>
                <div className="flex gap-2">
                  {TIME_SLOTS.map(ts => (
                    <motion.button key={ts.value} {...tap}
                      onClick={() => setTimeSlot(timeSlot === ts.value ? null : ts.value)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition-all ${timeSlot === ts.value ? 'border-emerald-400 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-gray-500'}`}>
                      {ts.emoji} {ts.label}
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* 타이머 토글 */}
              <div className="px-4 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Timer size={18} className="text-emerald-500" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">타이머</p>
                    <p className="text-xs text-gray-400">이 루틴 실행 시 카운트다운</p>
                  </div>
                </div>
                <button onClick={() => setTimerEnabled(v => !v)}
                  className={`w-11 h-6 rounded-full transition-colors relative ${timerEnabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <motion.div animate={{ x: timerEnabled ? 20 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className="absolute top-1 w-4 h-4 rounded-full bg-white shadow" />
                </button>
              </div>

              {/* 시간 피커 */}
              <AnimatePresence initial={false}>
                {timerEnabled && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    className="overflow-hidden border-t border-gray-50">
                    <div className="px-4 pb-4 pt-2">
                      <DurationPicker seconds={durationSeconds} onChange={setDurationSeconds} />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-white border-t border-gray-100"
            style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
            <motion.button whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
              onClick={handleSave} disabled={!title.trim()}
              className="w-full py-4 mt-3 rounded-2xl bg-emerald-500 text-white font-bold text-base disabled:opacity-40 hover:bg-emerald-600 transition-colors shadow-lg shadow-emerald-200">
              {isEdit ? '수정 완료' : '시작하기'}
            </motion.button>
          </div>
        </>
      )}
    </div>
  );
}
