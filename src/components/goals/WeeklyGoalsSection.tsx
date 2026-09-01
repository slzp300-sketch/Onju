import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Check, Link2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAuthStore } from '../../store/authStore';
import { useGoalStore } from '../../store/goalStore';
import { useHabitStore } from '../../store/habitStore';
import { useRoutineStore } from '../../store/routineStore';
import { useSettingsStore } from '../../store/settingsStore';
import { toast } from '../../store/toastStore';
import { currentWeek, currentYear, getWeekRangeFor } from '../../utils/date';
import { countWeeklyGoalDone, weeklyGoalRate } from '../../utils/weeklyGoalProgress';
import { newId } from '../../utils/id';
import type { WeeklyGoal } from '../../types';

const MAX_TARGET = 7;

interface Linkable {
  id: string;
  title: string;
  emoji?: string;
  kind: 'habit' | 'routine';
  isFaith: boolean;
}

/** 목표 관리 상단 "이번 주 목표" — 습관·루틴 연동 횟수 목표, 진행률은 체크 로그에서 자동 */
export default function WeeklyGoalsSection() {
  const user = useAuthStore(s => s.user);
  const { weeklyGoals, addWeeklyGoal, removeWeeklyGoal } = useGoalStore();
  const { habits, habitLogs } = useHabitStore();
  const { personalRoutines, faithRoutines, logs: routineLogs } = useRoutineStore();
  const weekStartDay = useSettingsStore(s => s.weekStartDay);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [target, setTarget] = useState(3);

  const slots = user?.weeklyGoalSlots ?? 3;
  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const { start, end } = getWeekRangeFor(new Date(), weekStartDay);
  const weekStartIso = format(start, 'yyyy-MM-dd');
  const weekEndIso = format(end, 'yyyy-MM-dd');

  const thisWeekGoals = weeklyGoals.filter(g => g.startDate <= todayIso && g.endDate >= todayIso);

  const linkables = useMemo<Linkable[]>(() => [
    ...habits.map(h => ({ id: h.id, title: h.title, emoji: h.emoji, kind: 'habit' as const, isFaith: false })),
    ...[...personalRoutines, ...faithRoutines]
      .filter(r => r.isActive)
      .map(r => ({ id: r.id, title: r.title, emoji: r.emoji, kind: 'routine' as const, isFaith: r.type === 'faith' })),
  ], [habits, personalRoutines, faithRoutines]);

  const linkedIds = new Set(thisWeekGoals.map(g => g.linkedId));
  const remainDays = Math.max(1, Math.round((new Date(weekEndIso + 'T12:00:00').getTime() - new Date(todayIso + 'T12:00:00').getTime()) / 86400000) + 1);

  const openSheet = () => {
    setPickedId(null);
    setTarget(3);
    setSheetOpen(true);
  };

  const create = () => {
    const item = linkables.find(l => l.id === pickedId);
    if (!item) return;
    const goal: WeeklyGoal = {
      id: newId(),
      userId: '',
      title: item.title,
      emoji: item.emoji,
      weekNumber: currentWeek(),
      year: currentYear(),
      startDate: weekStartIso,
      endDate: weekEndIso,
      status: 'active',
      completionRate: 0,
      targetCount: target,
      linkedKind: item.kind,
      linkedId: item.id,
      linkedRoutineIds: [],
      createdAt: new Date().toISOString(),
    };
    addWeeklyGoal(goal);
    setSheetOpen(false);
    toast.success('이번 주 목표를 심었어요 🌱');
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <p className="text-caption1 font-semibold text-label-alt">이번 주 목표</p>
        <div className="flex items-center gap-1.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${
              i < thisWeekGoals.length ? 'bg-primary' : i < slots ? 'bg-primary/25' : 'bg-fill-strong'
            }`} />
          ))}
          <span className="text-caption2 text-label-alt font-medium ml-0.5">{thisWeekGoals.length}/{slots}</span>
        </div>
      </div>

      {thisWeekGoals.map(g => {
        const done = countWeeklyGoalDone(g, habitLogs, routineLogs);
        const rate = weeklyGoalRate(g, done);
        const achieved = rate >= 100;
        return (
          <div key={g.id}
            className={`bg-surface border rounded-xl px-4 py-3.5 ${achieved ? 'border-positive/35' : 'border-line-soft'}`}>
            <div className="flex items-center gap-2.5">
              <span className="text-lg">{g.emoji ?? '🎯'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-body2 font-bold text-label-strong truncate">{g.title} 주 {g.targetCount}회</p>
                <p className="text-caption2 text-primary-strong font-semibold mt-0.5 flex items-center gap-1">
                  <Link2 size={10} /> {g.linkedKind === 'habit' ? '습관' : '루틴'} 체크에서 자동 계산
                </p>
              </div>
              <span className="text-body2 font-bold text-label-strong tabular-nums flex-shrink-0">
                {done}<span className="text-caption2 text-label-assistive font-semibold">/{g.targetCount}회</span>
              </span>
              <button onClick={() => removeWeeklyGoal(g.id)} aria-label={`${g.title} 목표 삭제`}
                className="text-label-assistive hover:text-negative p-1 flex-shrink-0">
                <X size={13} />
              </button>
            </div>
            <div className="flex gap-1 mt-2.5">
              {Array.from({ length: g.targetCount }).map((_, i) => (
                <div key={i} className={`flex-1 h-1.5 rounded-full transition-colors ${
                  i < done ? (achieved ? 'bg-positive' : 'bg-primary') : 'bg-fill-strong'
                }`} />
              ))}
            </div>
            <p className={`text-caption2 mt-2 ${achieved ? 'text-positive font-bold' : 'text-label-alt'}`}>
              {achieved
                ? '이번 주 달성! 나무가 쑥 자랐어요 🌳'
                : `${g.targetCount - done}회 남았어요 · ${remainDays}일 남음`}
            </p>
          </div>
        );
      })}

      {thisWeekGoals.length < slots ? (
        <button onClick={openSheet}
          className="w-full rounded-xl border-2 border-dashed border-line py-3.5 flex items-center justify-center gap-1.5 text-label-assistive hover:border-primary hover:text-primary transition-all text-body2 font-semibold">
          <Plus size={16} /> 주간 목표 추가
        </button>
      ) : (
        <p className="text-caption2 text-label-assistive text-center py-1">
          슬롯이 가득 찼어요 — 달성률 80% 이상이면 다음 주에 한 칸 늘어나요
        </p>
      )}

      {/* 목표 추가 시트 */}
      <AnimatePresence>
        {sheetOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 bg-black/40 z-50" onClick={() => setSheetOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 38 }}
              className="fixed left-0 right-0 bottom-0 z-50 bg-surface rounded-t-3xl px-5 pt-5 pb-7 max-w-lg mx-auto max-h-[85vh] overflow-y-auto"
            >
              <h3 className="text-headline1 font-bold text-label-strong">이번 주 목표 만들기</h3>
              <p className="text-caption1 text-label-alt mt-1">어떤 습관·루틴을 몇 번 할까요?</p>

              <div className="mt-2">
                {linkables.length === 0 && (
                  <p className="text-caption1 text-label-assistive text-center py-6">
                    연동할 습관·루틴이 아직 없어요 — 홈에서 먼저 만들어 보세요
                  </p>
                )}
                {linkables.map(l => {
                  const used = linkedIds.has(l.id);
                  const on = pickedId === l.id;
                  return (
                    <button key={l.id} disabled={used}
                      onClick={() => setPickedId(l.id)}
                      className="w-full flex items-center gap-3 py-3 border-b border-line-soft text-left disabled:opacity-40"
                    >
                      <span className="text-lg">{l.emoji ?? '🌱'}</span>
                      <span className="flex-1 text-body2 font-semibold text-label-strong truncate">{l.title}</span>
                      <span className="text-caption2 text-label-assistive flex-shrink-0">
                        {used ? '이미 목표 있음' : l.kind === 'habit' ? '습관' : l.isFaith ? '신앙루틴' : '루틴'}
                      </span>
                      <span className={`w-5 h-5 rounded-full border flex items-center justify-center text-white transition-colors flex-shrink-0 ${
                        on ? 'bg-primary border-primary' : 'border-line'
                      }`}>{on && <Check size={11} strokeWidth={3} />}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-5 mt-5">
                <motion.button whileTap={{ scale: 0.92 }} aria-label="횟수 줄이기"
                  onClick={() => setTarget(n => Math.max(1, n - 1))}
                  className="w-10 h-10 rounded-xl bg-fill text-label font-bold text-lg">−</motion.button>
                <p className="text-2xl font-bold text-label-strong tabular-nums min-w-[76px] text-center">
                  {target}<span className="text-caption1 text-label-alt font-semibold">회 / 주</span>
                </p>
                <motion.button whileTap={{ scale: 0.92 }} aria-label="횟수 늘리기"
                  onClick={() => setTarget(n => Math.min(MAX_TARGET, n + 1))}
                  className="w-10 h-10 rounded-xl bg-fill text-label font-bold text-lg">＋</motion.button>
              </div>

              <button
                onClick={create}
                disabled={!pickedId}
                className="mt-5 w-full bg-primary text-white text-body2 font-bold py-3 rounded-xl disabled:opacity-35"
              >
                목표 추가
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
