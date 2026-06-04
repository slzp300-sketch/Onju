import { useState } from 'react';
import { Plus, TrendingUp, ChevronDown, ChevronLeft, Pencil, Trash2, ChevronUp } from 'lucide-react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SlotBadge from '../components/ui/SlotBadge';
import WeeklyGoalCard from '../components/goals/WeeklyGoalCard';
import GoalCreateModal from '../components/goals/GoalCreateModal';
import EmptyState from '../components/ui/EmptyState';
import { useGoalStore } from '../store/goalStore';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { getAvailableSlots, checkSlotUnlock } from '../utils/slots';
import { getWeekRangeFor, formatDateRange, elapsedDays } from '../utils/date';
import type { MonthlyGoal } from '../types';

const tapSm = { whileTap: { scale: 0.88 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };
const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

export default function Goals() {
  const navigate = useNavigate();
  const { weeklyGoals, monthlyGoals, removeMonthlyGoal } = useGoalStore();
  const { user } = useAuthStore();
  const { weekStartDay, setWeekStartDay } = useSettingsStore();

  const [showCreate, setShowCreate] = useState(false);
  const [showWeekSetting, setShowWeekSetting] = useState(false);
  const [expandedMonthly, setExpandedMonthly] = useState<Set<string>>(new Set());

  const today = format(new Date(), 'yyyy-MM-dd');
  const { start, end } = getWeekRangeFor(new Date(), weekStartDay);
  const weekStart = format(start, 'yyyy-MM-dd');
  const weekEnd   = format(end,   'yyyy-MM-dd');

  const thisWeekGoals    = weeklyGoals.filter(g => g.startDate <= today && g.endDate >= today);
  const activeMonthly    = monthlyGoals.filter(g => g.startDate <= today && g.endDate >= today);
  const pastMonthly      = monthlyGoals.filter(g => g.endDate < today);

  const slots = getAvailableSlots(user!, thisWeekGoals.length);
  const { currentRate, shouldUnlock } = checkSlotUnlock(weeklyGoals, user?.weeklyGoalSlots ?? 3);

  const getMonthlyTitle = (id?: string) => monthlyGoals.find(g => g.id === id)?.title;

  const toggleMonthly = (id: string) =>
    setExpandedMonthly(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* 헤더 */}
      <div className="px-4 pt-5 flex items-center gap-2">
        <motion.button {...tapSm} onClick={() => navigate(-1)} className="p-1 -ml-1 text-label-alt flex-shrink-0">
          <ChevronLeft size={24} />
        </motion.button>
        <div>
          <h1 className="text-heading2 font-bold text-label-strong font-brand">목표 관리</h1>
          <p className="text-caption1 text-label-alt mt-0.5">{formatDateRange(weekStart, weekEnd)}</p>
        </div>
      </div>

      {/* ── 월간 목표 ── */}
      <div className="px-4 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <p className="text-body2 font-bold text-label-strong">📅 월간 목표</p>
          <motion.button {...tapSm}
            onClick={() => navigate('/goals/monthly/new')}
            className="flex items-center gap-1 text-caption1 font-semibold text-primary">
            <Plus size={14} /> 추가
          </motion.button>
        </div>

        {[...activeMonthly, ...pastMonthly].length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-line py-8 flex flex-col items-center gap-2">
            <p className="text-body2 font-semibold text-label-alt">월간 목표가 없어요</p>
            <p className="text-caption1 text-label-assistive">나의 To-Be를 설정해 방향을 잡아보세요</p>
          </div>
        ) : (
          <>
            {activeMonthly.map(g => (
              <MonthlyCard
                key={g.id}
                goal={g}
                isOpen={expandedMonthly.has(g.id)}
                onToggle={() => toggleMonthly(g.id)}
                onEdit={() => navigate(`/goals/monthly/edit/${g.id}`)}
                onDelete={() => removeMonthlyGoal(g.id)}
              />
            ))}
            {pastMonthly.length > 0 && (
              <>
                <p className="text-caption1 text-label-assistive mt-1">종료된 목표</p>
                {pastMonthly.map(g => (
                  <MonthlyCard key={g.id} goal={g} past
                    isOpen={expandedMonthly.has(g.id)}
                    onToggle={() => toggleMonthly(g.id)}
                    onEdit={() => navigate(`/goals/monthly/edit/${g.id}`)}
                    onDelete={() => removeMonthlyGoal(g.id)}
                  />
                ))}
              </>
            )}
          </>
        )}
      </div>

      {/* 구분선 */}
      <div className="h-px bg-line-soft mx-4" />

      {/* ── 주간 목표 ── */}
      <div className="px-4 flex flex-col gap-3">
        <p className="text-body2 font-bold text-label-strong">🎯 이번 주 목표</p>

        {/* 현황 카드 */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-body2 font-semibold text-label-strong">목표 현황</p>
            <SlotBadge total={slots.total} used={slots.used} />
          </div>
          <div className={`rounded-xl p-3 text-caption1 ${shouldUnlock ? 'bg-positive/10 text-[#009632]' : 'bg-fill text-label-alt'}`}>
            <div className="flex items-center gap-1.5">
              <TrendingUp size={13} />
              {shouldUnlock
                ? <span className="font-medium">지난 주 {currentRate}% 달성! 다음 주 목표 칸이 1개 늘어나요 🎉</span>
                : <span>지난 주 달성률 {currentRate}% — 80% 이상 달성하면 목표를 더 세울 수 있어요</span>}
            </div>
          </div>

          <button onClick={() => setShowWeekSetting(v => !v)}
            className="mt-3 flex items-center gap-1 text-caption1 text-label-alt hover:text-label transition-colors">
            <span>주 시작: {WEEKDAY_NAMES[weekStartDay]}요일</span>
            <ChevronDown size={12} className={`transition-transform ${showWeekSetting ? 'rotate-180' : ''}`} />
          </button>
          {showWeekSetting && (
            <div className="mt-2 flex gap-1.5 flex-wrap">
              {WEEKDAY_NAMES.map((name, i) => (
                <button key={i} onClick={() => { setWeekStartDay(i); setShowWeekSetting(false); }}
                  className={`px-2.5 py-1 rounded-lg text-caption1 font-medium transition-all border ${
                    weekStartDay === i ? 'bg-primary text-white border-transparent' : 'border-line text-label-alt'
                  }`}>
                  {name}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* 목표 목록 */}
        <div className="flex items-center justify-between">
          <p className="text-caption1 font-semibold text-label-alt">이번 기간 목표</p>
          <Button variant="ghost" size="sm" onClick={() => setShowCreate(true)} disabled={slots.remaining <= 0}>
            <Plus size={15} /> 추가
          </Button>
        </div>

        {slots.remaining <= 0 && (
          <p className="text-caption1 text-cautionary bg-cautionary/10 rounded-xl px-3 py-2">
            목표를 모두 채웠어요. 지난 주 달성률 80% 이상이면 목표 칸이 늘어나요.
          </p>
        )}

        {thisWeekGoals.length === 0 ? (
          <EmptyState title="이번 기간 목표가 없어요" description="+ 추가 버튼으로 기간을 지정해 목표를 세워 보세요" />
        ) : (
          <div className="flex flex-col gap-2">
            {thisWeekGoals.map(goal => (
              <WeeklyGoalCard key={goal.id} goal={goal} monthlyTitle={getMonthlyTitle(goal.monthlyGoalId)} />
            ))}
          </div>
        )}
      </div>

      <GoalCreateModal isOpen={showCreate} onClose={() => setShowCreate(false)} />
    </div>
  );
}

/* ── 월간 목표 카드 (인라인) ── */
function MonthlyCard({ goal, past = false, isOpen, onToggle, onEdit, onDelete }: {
  goal: MonthlyGoal; past?: boolean; isOpen: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const { elapsed, total } = elapsedDays(goal.startDate, goal.endDate);
  const progress  = Math.round((elapsed / total) * 100);
  const habit     = goal.goalRoutines?.[0];
  const cardBg    = goal.color ? `${goal.color}18` : undefined;
  const cardBorder = goal.color ? `${goal.color}50` : undefined;
  const accentColor = goal.color ?? (past ? 'var(--color-label-assistive)' : 'var(--color-primary)');
  const todayIso  = format(new Date(), 'yyyy-MM-dd');
  const isPast    = goal.endDate < todayIso;

  return (
    <div
      className={`rounded-xl border shadow-emphasize overflow-hidden ${
        goal.color ? '' : isPast ? 'bg-fill border-line' : 'bg-surface border-line'
      }`}
      style={goal.color ? { backgroundColor: cardBg, borderColor: cardBorder } : undefined}
    >
      <button className="w-full text-left px-4 pt-4 pb-3" onClick={onToggle}>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-caption1 font-medium mb-0.5" style={{ color: accentColor }}>
              {format(new Date(goal.startDate), 'M/d', { locale: ko })} ~ {format(new Date(goal.endDate), 'M/d', { locale: ko })}
            </p>
            <p className={`text-body2 font-semibold ${isPast ? 'text-label-alt' : 'text-label-strong'}`}>
              {goal.title}
            </p>
          </div>
          <span className={`flex-shrink-0 mt-0.5 ${isPast ? 'text-label-assistive' : 'text-primary'}`}>
            {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        </div>
        {!isPast && (
          <div className="mt-2.5">
            <div className="flex justify-between text-caption2 text-label-assistive mb-1">
              <span>D+{elapsed - 1}</span><span>{elapsed}/{total}일</span>
            </div>
            <div className="bg-surface/60 rounded-full h-1.5 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: accentColor }} />
            </div>
          </div>
        )}
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="overflow-hidden">
            <div className="mx-3 mb-3 rounded-xl px-4 py-3.5 flex flex-col gap-2 bg-surface/60 border border-line-soft">
              {habit ? (
                <>
                  <p className="text-caption1 font-bold text-label-strong">💪 핵심 습관</p>
                  <p className="text-body2 text-label">📌 {habit.title}</p>
                  {habit.when  && <p className="text-body2 text-label-alt">⏰ {habit.when}</p>}
                  {habit.where && <p className="text-body2 text-label-alt">📍 {habit.where}</p>}
                  {habit.miniRoutine     && <p className="text-caption1 text-amber-600">🔥 미니: {habit.miniRoutine}</p>}
                  {habit.twoMinuteHabit && <p className="text-caption1 text-emerald-600">⚡ 2분: {habit.twoMinuteHabit}</p>}
                </>
              ) : (
                <p className="text-caption1 text-label-assistive">설정된 습관이 없어요</p>
              )}
            </div>
            <div className="flex items-center justify-end gap-1 px-4 pb-3">
              <motion.button {...tapSm} onClick={onEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption1 font-semibold text-primary bg-primary-soft">
                <Pencil size={12} /> 수정
              </motion.button>
              <motion.button {...tapSm} onClick={onDelete}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-caption1 font-semibold text-negative bg-red-50">
                <Trash2 size={12} /> 삭제
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
