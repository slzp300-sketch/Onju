import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { motion } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { useGoalStore } from '../store/goalStore';
import type { GoalRoutineItem, MonthlyGoal } from '../types';

const tapSm = { whileTap: { scale: 0.92 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };

const todayStr   = () => format(new Date(), 'yyyy-MM-dd');
const defaultEnd = () => format(addDays(new Date(), 29), 'yyyy-MM-dd');

/* ── 입력 필드 공통 스타일 ── */
const inputCls = 'w-full bg-fill border border-line rounded-xl px-4 py-3 text-body2 font-medium focus:outline-none focus:border-primary focus:bg-surface transition-all placeholder:text-label-assistive';

export default function MonthlyGoalNew() {
  const navigate = useNavigate();
  const { addMonthlyGoal } = useGoalStore();

  // 섹션 1: To-Be
  const [toBeStatement, setToBeStatement] = useState('');

  // 섹션 2: 기간
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate]     = useState(defaultEnd);

  // 섹션 3: 핵심 습관 (1개)
  const [habitTitle, setHabitTitle]         = useState('');
  const [habitWhen, setHabitWhen]           = useState('');
  const [habitWhere, setHabitWhere]         = useState('');
  const [miniHabit, setMiniHabit]           = useState('');
  const [twoMinuteHabit, setTwoMinuteHabit] = useState('');

  const canSave = toBeStatement.trim().length > 0 && startDate && endDate;

  const handleSave = () => {
    if (!canSave) return;
    const s = new Date(startDate);

    const habit: GoalRoutineItem | undefined = habitTitle.trim() ? {
      id: `gr-${Date.now()}`,
      title: habitTitle.trim(),
      when: habitWhen.trim() || undefined,
      where: habitWhere.trim() || undefined,
      miniRoutine: miniHabit.trim() || undefined,
      twoMinuteHabit: twoMinuteHabit.trim() || undefined,
    } : undefined;

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
    };

    addMonthlyGoal(newGoal);
    navigate('/goals/monthly');
  };

  return (
    <div className="min-h-dvh bg-surface-alt flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-surface border-b border-line-soft flex-shrink-0">
        <motion.button {...tapSm} onClick={() => navigate(-1)} className="p-1 -ml-1 text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">목표 추가하기</h1>
        <div className="w-8" />
      </div>

      {/* 스크롤 영역 */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-5 flex flex-col gap-5 pb-28">

          {/* ── 섹션 1: To-Be 선언 ── */}
          <div className="bg-surface rounded-xl border border-line shadow-emphasize">
            <div className="px-4 py-3.5 border-b border-line-soft">
              <p className="text-body2 font-bold text-label-strong">🌟 나의 To-Be 선언</p>
              <p className="text-caption1 text-label-alt mt-0.5">내가 되고 싶은 모습을 구체적인 문장으로</p>
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

          {/* ── 섹션 2: 목표 기간 ── */}
          <div className="bg-surface rounded-xl border border-line shadow-emphasize">
            <div className="px-4 py-3.5 border-b border-line-soft">
              <p className="text-body2 font-bold text-label-strong">📅 목표 기간</p>
            </div>
            <div className="px-4 py-4 flex items-center gap-3">
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="flex-1 border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-primary transition-colors bg-fill text-label" />
              <span className="text-label-assistive text-body2 flex-shrink-0">~</span>
              <input type="date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)}
                className="flex-1 border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-primary transition-colors bg-fill text-label" />
            </div>
          </div>

          {/* ── 섹션 3: 핵심 습관 ── */}
          <div className="bg-surface rounded-xl border border-line shadow-emphasize">
            <div className="px-4 py-3.5 border-b border-line-soft">
              <p className="text-body2 font-bold text-label-strong">💪 핵심 습관</p>
              <p className="text-caption1 text-label-alt mt-0.5">목표를 이루기 위해 매일 할 습관을 구체화해요</p>
            </div>
            <div className="px-4 py-4 flex flex-col gap-3">
              {/* 습관명 */}
              <input value={habitTitle} onChange={e => setHabitTitle(e.target.value)}
                placeholder="습관명 (예: 러닝 30분)"
                className={inputCls} />

              {/* 언제 */}
              <input value={habitWhen} onChange={e => setHabitWhen(e.target.value)}
                placeholder="⏰ 언제 (예: 출근 전 6시)"
                className={inputCls} />

              {/* 어디서 */}
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
          </div>

        </div>
      </div>

      {/* 하단 저장 버튼 */}
      <div className="flex-shrink-0 px-4 bg-surface border-t border-line-soft"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <motion.button
          whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
          onClick={handleSave}
          disabled={!canSave}
          className="w-full h-12 mt-3 rounded-xl bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors"
        >
          목표 시작하기
        </motion.button>
      </div>
    </div>
  );
}
