import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { format, addDays } from 'date-fns';
import { useGoalStore } from '../store/goalStore';
import type { GoalRoutineItem, MonthlyGoal } from '../types';

const tapSm = { whileTap: { scale: 0.92 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };
const tap   = { whileTap: { scale: 0.97 }, transition: { type: 'spring' as const, stiffness: 600, damping: 20 } };

const todayStr   = () => format(new Date(), 'yyyy-MM-dd');
const defaultEnd = () => format(addDays(new Date(), 29), 'yyyy-MM-dd');

function makeRoutine(): GoalRoutineItem {
  return { id: `gr-${Date.now()}-${Math.random()}`, title: '', when: '', where: '', miniRoutine: '' };
}

export default function MonthlyGoalNew() {
  const navigate = useNavigate();
  const { addMonthlyGoal } = useGoalStore();

  const [toBeStatement, setToBeStatement] = useState('');
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate]     = useState(defaultEnd);
  const [routines, setRoutines]   = useState<GoalRoutineItem[]>([makeRoutine()]);

  const updateRoutine = (id: string, patch: Partial<GoalRoutineItem>) =>
    setRoutines(rs => rs.map(r => r.id === id ? { ...r, ...patch } : r));

  const addRoutine = () =>
    setRoutines(rs => [...rs, makeRoutine()]);

  const removeRoutine = (id: string) =>
    setRoutines(rs => rs.filter(r => r.id !== id));

  const canSave = toBeStatement.trim().length > 0 && startDate && endDate;

  const handleSave = () => {
    if (!canSave) return;
    const s = new Date(startDate);
    const filledRoutines = routines.filter(r => r.title.trim());
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
      goalRoutines: filledRoutines.length > 0 ? filledRoutines : undefined,
    };
    addMonthlyGoal(newGoal);

    // 루틴이 있으면 바로 습관 추가 제안
    if (filledRoutines.length > 0) {
      navigate('/goals/monthly', { state: { newGoalId: newGoal.id } });
    } else {
      navigate('/goals/monthly');
    }
  };

  return (
    <div className="min-h-dvh bg-surface-alt flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-surface border-b border-line-soft">
        <motion.button {...tapSm} onClick={() => navigate(-1)} className="p-1 -ml-1 text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">목표 추가하기</h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5 pb-28">

        {/* ── 섹션 1: To-Be 선언 ── */}
        <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
          <div className="px-4 py-4 border-b border-line-soft">
            <p className="text-body2 font-bold text-label-strong mb-0.5">🌟 나의 To-Be 선언</p>
            <p className="text-caption1 text-label-alt">내가 되고 싶은 모습을 구체적인 문장으로</p>
          </div>
          <div className="px-4 py-4">
            <textarea
              value={toBeStatement}
              onChange={e => setToBeStatement(e.target.value)}
              placeholder={"나는 출근 전 30분을 나를 위해 쓰는 사람이야"}
              rows={3}
              autoFocus
              className="w-full bg-fill border border-line rounded-xl px-4 py-3 text-body2 font-medium focus:outline-none focus:border-primary focus:bg-surface resize-none transition-all placeholder:text-label-assistive leading-relaxed"
            />
            <p className="text-caption2 text-label-assistive mt-1.5 px-0.5">
              💡 "나는 ~하는 사람이야" 형태로 쓰면 정체성이 더 강화돼요
            </p>
          </div>
        </div>

        {/* ── 섹션 2: 목표 기간 ── */}
        <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
          <div className="px-4 py-4 border-b border-line-soft">
            <p className="text-body2 font-bold text-label-strong">📅 목표 기간</p>
          </div>
          <div className="px-4 py-4 flex items-center gap-3">
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="flex-1 border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-primary transition-colors bg-fill text-label"
            />
            <span className="text-label-assistive text-body2 flex-shrink-0">~</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              className="flex-1 border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-primary transition-colors bg-fill text-label"
            />
          </div>
        </div>

        {/* ── 섹션 3: 루틴으로 쪼개기 ── */}
        <div className="bg-surface rounded-xl border border-line shadow-emphasize overflow-hidden">
          <div className="px-4 py-4 border-b border-line-soft">
            <p className="text-body2 font-bold text-label-strong mb-0.5">📋 목표를 루틴으로</p>
            <p className="text-caption1 text-label-alt">무엇을, 언제, 어디서 할지 구체화해요</p>
          </div>

          <div className="flex flex-col divide-y divide-line-soft">
            <AnimatePresence initial={false}>
              {routines.map((r, idx) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-4 flex flex-col gap-3">
                    {/* 루틴 번호 + 삭제 */}
                    <div className="flex items-center justify-between">
                      <span className="text-caption1 font-bold text-primary bg-primary-soft px-2 py-0.5 rounded-lg">
                        루틴 {idx + 1}
                      </span>
                      {routines.length > 1 && (
                        <motion.button {...tapSm} onClick={() => removeRoutine(r.id)}
                          className="text-label-assistive hover:text-negative transition-colors p-1">
                          <Trash2 size={14} />
                        </motion.button>
                      )}
                    </div>

                    {/* 루틴명 */}
                    <input
                      value={r.title}
                      onChange={e => updateRoutine(r.id, { title: e.target.value })}
                      placeholder="루틴명 (예: 러닝 30분)"
                      className="w-full bg-fill border border-line rounded-xl px-4 py-2.5 text-body2 focus:outline-none focus:border-primary focus:bg-surface transition-all"
                    />

                    {/* 언제 / 어디서 */}
                    <div className="flex gap-2">
                      <input
                        value={r.when ?? ''}
                        onChange={e => updateRoutine(r.id, { when: e.target.value })}
                        placeholder="⏰ 언제 (예: 출근 전 6시)"
                        className="flex-1 bg-fill border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-primary focus:bg-surface transition-all"
                      />
                      <input
                        value={r.where ?? ''}
                        onChange={e => updateRoutine(r.id, { where: e.target.value })}
                        placeholder="📍 어디서"
                        className="flex-1 bg-fill border border-line rounded-xl px-3 py-2.5 text-body2 focus:outline-none focus:border-primary focus:bg-surface transition-all"
                      />
                    </div>

                    {/* 미니루틴 */}
                    <div className="bg-amber-50 rounded-xl px-4 py-3 border border-amber-200/60">
                      <p className="text-caption1 font-bold text-amber-600 mb-1.5">🔥 미니루틴 (대체용)</p>
                      <input
                        value={r.miniRoutine ?? ''}
                        onChange={e => updateRoutine(r.id, { miniRoutine: e.target.value })}
                        placeholder="하기 힘든 날의 대체 루틴 (예: 10분 스트레칭)"
                        className="w-full bg-white/80 border border-amber-200 rounded-lg px-3 py-2 text-body2 focus:outline-none focus:border-amber-400 transition-all"
                      />
                      <p className="text-caption2 text-amber-500 mt-1">
                        💡 쉬운 버전을 만들어두면 포기하지 않을 수 있어요
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {/* 루틴 추가 버튼 */}
            <div className="px-4 py-3">
              <motion.button {...tap} onClick={addRoutine}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-dashed border-line text-label-assistive hover:border-primary hover:text-primary hover:bg-primary-soft/20 transition-all text-body2 font-medium">
                <Plus size={16} />
                루틴 추가
              </motion.button>
            </div>
          </div>
        </div>

      </div>

      {/* 하단 저장 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-surface border-t border-line-soft"
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
