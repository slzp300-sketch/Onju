import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { useGoalStore } from '../store/goalStore';
import type { GoalRoutineItem, MonthlyGoal } from '../types';

const tapSm = { whileTap: { scale: 0.92 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };

const todayStr   = () => format(new Date(), 'yyyy-MM-dd');
const defaultEnd = () => format(addDays(new Date(), 29), 'yyyy-MM-dd');

const inputCls = 'w-full bg-fill border border-line rounded-xl px-4 py-3 text-body2 font-medium focus:outline-none focus:border-primary focus:bg-surface transition-all placeholder:text-label-assistive';

const COLORS = [
  '#6366f1', '#ef4444', '#f59e0b', '#10b981',
  '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6',
  '#f97316', '#84cc16', '#06b6d4', '#64748b',
];

export default function MonthlyGoalNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { monthlyGoals, addMonthlyGoal, updateMonthlyGoal } = useGoalStore();

  const existing = id ? monthlyGoals.find(g => g.id === id) : null;
  const isEdit = !!existing;
  const existingHabit = existing?.goalRoutines?.[0];

  const [toBeStatement, setToBeStatement] = useState(existing?.toBeStatement ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? todayStr());
  const [endDate, setEndDate]     = useState(existing?.endDate ?? defaultEnd());
  const [habitTitle, setHabitTitle]         = useState(existingHabit?.title ?? '');
  const [habitWhen, setHabitWhen]           = useState(existingHabit?.when ?? '');
  const [habitWhere, setHabitWhere]         = useState(existingHabit?.where ?? '');
  const [miniHabit, setMiniHabit]           = useState(existingHabit?.miniRoutine ?? '');
  const [twoMinuteHabit, setTwoMinuteHabit] = useState(existingHabit?.twoMinuteHabit ?? '');
  const [category, setCategory] = useState<'personal' | 'faith'>(existing?.category ?? 'personal');
  const [colorEnabled, setColorEnabled] = useState(!!existing?.color);
  const [selectedColor, setSelectedColor] = useState<string>(existing?.color ?? '');

  const canSave = toBeStatement.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const s = new Date(startDate);

    const habit: GoalRoutineItem | undefined = habitTitle.trim() ? {
      id: existingHabit?.id ?? `gr-${Date.now()}`,
      title: habitTitle.trim(),
      when: habitWhen.trim() || undefined,
      where: habitWhere.trim() || undefined,
      miniRoutine: miniHabit.trim() || undefined,
      twoMinuteHabit: twoMinuteHabit.trim() || undefined,
    } : undefined;

    const color = colorEnabled && selectedColor ? selectedColor : undefined;

    if (isEdit && existing) {
      updateMonthlyGoal(existing.id, {
        title: toBeStatement.trim(),
        month: s.getMonth() + 1,
        year: s.getFullYear(),
        startDate,
        endDate,
        toBeStatement: toBeStatement.trim(),
        goalRoutines: habit ? [habit] : undefined,
        color,
        category,
      });
    } else {
      const newGoal: MonthlyGoal = {
        id: `mg-${Date.now()}`,
        userId: 'user-1',
        title: toBeStatement.trim(),
        month: s.getMonth() + 1,
        year: s.getFullYear(),
        startDate,
        endDate,
        status: 'active',
        createdAt: new Date().toISOString(),
        toBeStatement: toBeStatement.trim(),
        goalRoutines: habit ? [habit] : undefined,
        color,
        category,
      };
      addMonthlyGoal(newGoal);
    }
    navigate('/goals/monthly', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-surface-alt flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-surface border-b border-line-soft flex-shrink-0">
        <motion.button {...tapSm} onClick={() => navigate(-1)} className="p-1 -ml-1 text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">
          {isEdit ? '목표 수정하기' : '목표 추가하기'}
        </h1>
        <div className="w-8" />
      </div>

      {/* 스크롤 콘텐츠 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 flex flex-col gap-5 pb-28">

          {/* ── 카테고리 선택 ── */}
          <div className="bg-surface rounded-xl border border-line shadow-emphasize">
            <div className="px-4 py-4">
              <p className="text-body2 font-bold text-label-strong mb-3">목표 유형</p>
              <div className="flex gap-3">
                {([
                  { value: 'personal', label: '개인', emoji: '💪', desc: '개인 습관·루틴 목표' },
                  { value: 'faith',    label: '신앙', emoji: '🙏', desc: '신앙 루틴 목표' },
                ] as const).map(opt => (
                  <motion.button
                    key={opt.value}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => setCategory(opt.value)}
                    className={`flex-1 flex flex-col items-center gap-1.5 py-3.5 rounded-xl border-2 transition-all ${
                      category === opt.value
                        ? 'border-primary bg-primary-soft'
                        : 'border-line bg-fill'
                    }`}
                  >
                    <span className="text-2xl">{opt.emoji}</span>
                    <p className={`text-body2 font-bold ${category === opt.value ? 'text-primary' : 'text-label-alt'}`}>
                      {opt.label}
                    </p>
                    <p className={`text-caption2 ${category === opt.value ? 'text-primary/70' : 'text-label-assistive'}`}>
                      {opt.desc}
                    </p>
                  </motion.button>
                ))}
              </div>
            </div>
          </div>

          {/* ── To-Be 선언 ── */}
          <div className="bg-surface rounded-xl border border-line shadow-emphasize">
            <div className="px-4 py-4 border-b border-line-soft">
              <p className="text-body2 font-bold text-label-strong mb-0.5">🌟 나의 To-Be 선언</p>
              <p className="text-caption1 text-label-alt">내가 되고 싶은 모습을 구체적인 문장으로</p>
            </div>
            <div className="px-4 py-4">
              <textarea
                value={toBeStatement}
                onChange={e => setToBeStatement(e.target.value)}
                placeholder="두 발로 꾸준히 달리며 체력과 의지를 쌓아가는 사람"
                rows={3}
                autoFocus
                className="w-full bg-fill border border-line rounded-xl px-4 py-3 text-body2 font-medium focus:outline-none focus:border-primary focus:bg-surface resize-none transition-all placeholder:text-label-assistive leading-relaxed"
              />
              <p className="text-caption2 text-label-assistive mt-1.5">
                💡 내가 되고 싶은 모습을 구체적인 문장으로 적어주세요
              </p>
            </div>
          </div>

          {/* ── 목표 기간 ── */}
          <div className="bg-surface rounded-xl border border-line shadow-emphasize">
            <div className="px-4 py-4 border-b border-line-soft">
              <p className="text-body2 font-bold text-label-strong">📅 목표 기간</p>
            </div>
            <div className="px-4 py-4 flex items-center gap-3">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="flex-1 border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-primary bg-fill text-label" />
              <span className="text-label-assistive text-body2 flex-shrink-0">~</span>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                className="flex-1 border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-primary bg-fill text-label" />
            </div>
          </div>

          {/* ── 핵심 습관 ── */}
          <div className="bg-surface rounded-xl border border-line shadow-emphasize">
            <div className="px-4 py-4 border-b border-line-soft">
              <p className="text-body2 font-bold text-label-strong mb-0.5">💪 핵심 습관</p>
              <p className="text-caption1 text-label-alt">무엇을, 언제, 어디서 할지 구체화해요</p>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              <input value={habitTitle} onChange={e => setHabitTitle(e.target.value)}
                placeholder="습관명 (예: 러닝 30분)"
                className={inputCls} />
              <input value={habitWhen} onChange={e => setHabitWhen(e.target.value)}
                placeholder="⏰ 언제 (예: 출근 전 6시)"
                className={inputCls} />
              <input value={habitWhere} onChange={e => setHabitWhere(e.target.value)}
                placeholder="📍 어디서 (예: 공원)"
                className={inputCls} />
            </div>

            {/* 미니 습관 */}
            <div className="mx-4 mb-4 bg-amber-50 rounded-xl px-4 py-3.5 border border-amber-200/60">
              <p className="text-caption1 font-bold text-amber-600 mb-2">🔥 미니 습관 (대체용)</p>
              <input value={miniHabit} onChange={e => setMiniHabit(e.target.value)}
                placeholder="하기 힘든 날의 대체 습관 (예: 10분 스트레칭)"
                className="w-full bg-white/80 border border-amber-200 rounded-lg px-3 py-2.5 text-body2 focus:outline-none focus:border-amber-400 transition-all placeholder:text-amber-300" />
              <p className="text-caption2 text-amber-500 mt-1.5">
                💡 쉬운 버전을 만들어두면 포기하지 않을 수 있어요
              </p>
            </div>

            {/* 2분 습관 */}
            <div className="mx-4 mb-4 bg-emerald-50 rounded-xl px-4 py-3.5 border border-emerald-200/60">
              <p className="text-caption1 font-bold text-emerald-600 mb-1">⚡ 2분 습관 (시작 트리거)</p>
              <p className="text-caption2 text-emerald-500 mb-2">
                시작을 쉽게 만드는 2분 이내의 작은 행동을 적어요
              </p>
              <input value={twoMinuteHabit} onChange={e => setTwoMinuteHabit(e.target.value)}
                placeholder="예: 운동복으로 갈아입기, 러닝화 신기"
                className="w-full bg-white/80 border border-emerald-200 rounded-lg px-3 py-2.5 text-body2 focus:outline-none focus:border-emerald-400 transition-all placeholder:text-emerald-300" />
              <p className="text-caption2 text-emerald-500 mt-1.5">
                💡 "일단 시작"하게 만드는 초소형 행동이에요
              </p>
            </div>
          </div>{/* 핵심 습관 카드 닫기 */}

          {/* ── 색상 선택 ── */}
          <div className="bg-surface rounded-xl border border-line shadow-emphasize">
            {/* 토글 헤더 */}
            <div className="px-4 py-4 flex items-center justify-between">
              <div>
                <p className="text-body2 font-bold text-label-strong">🎨 색상 선택</p>
                <p className="text-caption1 text-label-alt mt-0.5">카드에 표시될 색상을 골라요</p>
              </div>
              <button
                onClick={() => { setColorEnabled(v => !v); if (colorEnabled) setSelectedColor(''); }}
                className={`relative w-11 h-6 rounded-full transition-colors ${colorEnabled ? 'bg-primary' : 'bg-fill-strong'}`}
              >
                <motion.div
                  animate={{ x: colorEnabled ? 20 : 2 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-sm pointer-events-none"
                />
              </button>
            </div>

            {/* 색상 그리드 — 항상 표시, 비활성 시 채도 낮음 */}
            <div className="px-4 pb-4">
              <div className="grid grid-cols-6 gap-2.5">
                {COLORS.map(c => {
                  const isSelected = colorEnabled && selectedColor === c;
                  return (
                    <motion.button
                      key={c}
                      whileTap={colorEnabled ? { scale: 0.85 } : {}}
                      onClick={() => colorEnabled && setSelectedColor(prev => prev === c ? '' : c)}
                      className="w-full aspect-square rounded-full flex items-center justify-center transition-all"
                      style={{
                        backgroundColor: c,
                        filter: colorEnabled ? 'none' : 'saturate(0.2) brightness(0.85)',
                        boxShadow: isSelected ? `0 0 0 3px var(--color-surface), 0 0 0 5px ${c}` : 'none',
                        transform: isSelected ? 'scale(1.1)' : 'scale(1)',
                        cursor: colorEnabled ? 'pointer' : 'default',
                      }}
                    >
                      {isSelected && (
                        <Check size={14} className="text-white" strokeWidth={3} />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* 하단 고정 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-surface border-t border-line-soft"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <motion.button
          whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
          onClick={handleSave}
          disabled={!canSave}
          className="w-full h-12 mt-3 rounded-xl bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors"
        >
          {isEdit ? '수정 완료' : '목표 시작하기'}
        </motion.button>
      </div>
    </div>
  );
}
