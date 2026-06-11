import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, Timer, GripVertical, Dumbbell, Flame, Clock } from 'lucide-react';
import DurationPickerSheet from '../components/ui/DurationPickerSheet';
import { fmtDuration } from '../utils/duration';
import { format } from 'date-fns';
import { useHabitStore } from '../store/habitStore';
import { useGoalStore } from '../store/goalStore';
import type { Habit } from '../types';
import EmojiPickerButton from '../components/ui/EmojiPickerButton';
import {
  DndContext, closestCenter, PointerSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, verticalListSortingStrategy,
  useSortable, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { newId } from '../utils/id';

const tap = { whileTap: { scale: 0.94 }, transition: { type: 'spring' as const, stiffness: 600, damping: 20 } };
const tapSm = { whileTap: { scale: 0.88 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };

export default function PersonalRoutineNew() {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { habits, personalRoutines, addPersonalRoutine, updatePersonalRoutine } = useHabitStore();
  const { monthlyGoals } = useGoalStore();

  const todayIso = format(new Date(), 'yyyy-MM-dd');
  const activeGoalRoutines = monthlyGoals
    .filter(g => g.startDate <= todayIso && g.endDate >= todayIso && g.goalRoutines?.length && g.category === 'personal')
    .flatMap(g => (g.goalRoutines ?? []).map(r => ({ ...r, goalTitle: g.title })));

  const existing = id ? personalRoutines.find(r => r.id === id) : null;
  const isEdit = !!existing;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '');
  const [when, setWhen] = useState(existing?.when ?? '');
  const [selectedIds, setSelectedIds] = useState<string[]>(existing?.habitIds ?? []);
  const [timerEnabled, setTimerEnabled] = useState(existing?.timerEnabled ?? false);
  const [habitDurations, setHabitDurations] = useState<Record<string, number>>(
    existing?.habitDurations ?? {}
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (over && active.id !== over.id) {
      setSelectedIds(ids => {
        const oldIdx = ids.indexOf(String(active.id));
        const newIdx = ids.indexOf(String(over.id));
        return arrayMove(ids, oldIdx, newIdx);
      });
    }
  };

  const toggle = (hId: string) => {
    setSelectedIds(ids => ids.includes(hId) ? ids.filter(x => x !== hId) : [...ids, hId]);
    if (!habitDurations[hId]) {
      const habit = habits.find(h => h.id === hId);
      setHabitDurations(prev => ({ ...prev, [hId]: habit?.durationSeconds ?? 60 }));
    }
  };

  const setDuration = (hId: string, val: number) => {
    setHabitDurations(prev => ({ ...prev, [hId]: Math.max(5, Math.min(3600, val)) }));
  };

  const totalSeconds = selectedIds.reduce((sum, hId) => sum + (habitDurations[hId] ?? 60), 0);
  const totalDisplay = totalSeconds >= 60
    ? `${Math.floor(totalSeconds / 60)}분 ${totalSeconds % 60 > 0 ? `${totalSeconds % 60}초` : ''}`.trim()
    : `${totalSeconds}초`;

  const handleSubmit = () => {
    if (!title.trim() || selectedIds.length < 2) return;
    const data = {
      title: title.trim(), emoji, when: when.trim(),
      habitIds: selectedIds, timerEnabled,
      habitDurations: timerEnabled ? habitDurations : undefined,
    };
    if (isEdit && existing) {
      updatePersonalRoutine(existing.id, data);
    } else {
      addPersonalRoutine({ id: newId(), userId: '', createdAt: new Date().toISOString(), ...data });
    }
    navigate(-1);
  };


  return (
    <div className="min-h-dvh bg-surface-alt flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-surface border-b border-line-soft">
        <motion.button {...tapSm} onClick={() => navigate(-1)} className="p-1 -ml-1 text-label-alt">
          <ChevronLeft size={24} />
        </motion.button>
        <h1 className="flex-1 text-center text-headline1 font-bold text-label-strong">
          {isEdit ? '루틴 수정하기' : '루틴 추가하기'}
        </h1>
        <div className="w-8" />
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 flex flex-col gap-5 pb-28">

        {/* 월간 목표에서 루틴 가져오기 */}
        {!isEdit && activeGoalRoutines.length > 0 && (
          <div>
            <p className="text-caption1 font-bold text-label-alt mb-2 flex items-center gap-1.5"><Dumbbell size={14} strokeWidth={1.9} /> 월간 목표 습관에서 가져오기</p>
            <div className="flex flex-col gap-2">
              {activeGoalRoutines.map(r => (
                <motion.button key={r.id}
                  whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
                  onClick={() => { setTitle(r.title); if (r.when) setWhen(r.when); }}
                  className="w-full flex items-start gap-3 px-4 py-3 rounded-xl border border-line bg-surface text-left hover:border-primary hover:bg-primary-soft/20 transition-all">
                  <div className="flex-1 min-w-0">
                    <p className="text-body2 font-semibold text-label-strong truncate">{r.title}</p>
                    <p className="text-caption1 text-label-alt mt-0.5">
                      {[r.when, r.where].filter(Boolean).join(' · ')}
                    </p>
                    {r.miniRoutine && (
                      <p className="text-caption1 text-amber-500 mt-0.5 flex items-center gap-1"><Flame size={13} strokeWidth={1.9} /> 미니: {r.miniRoutine}</p>
                    )}
                  </div>
                  <span className="text-caption2 text-primary bg-primary-soft px-2 py-0.5 rounded-lg flex-shrink-0 mt-0.5">
                    가져오기
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        )}

        {/* 루틴 이름 + 이모지 */}
        <div>
          <p className="text-caption1 font-bold text-label-alt mb-2">루틴 이름</p>
          <div className="flex gap-2">
            <EmojiPickerButton emoji={emoji} onChange={setEmoji} />
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="루틴 이름을 입력하세요" autoFocus
              className="flex-1 h-12 bg-surface border border-line rounded-lg px-4 text-body2 font-medium focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgba(0,102,255,0.15)] shadow-emphasize transition-all" />
          </div>
        </div>

        {/* 언제 + 타이머 */}
        <div className="bg-surface rounded-xl border border-line overflow-hidden">
          <div className="px-4 py-4 border-b border-line-soft">
            <div className="flex items-center gap-3 mb-2">
              <Clock size={20} strokeWidth={1.9} className="text-label-strong" />
              <span className="text-body2 font-semibold text-label-strong">언제 할래요?</span>
            </div>
            <input type="text" value={when} onChange={e => setWhen(e.target.value)}
              placeholder="예) 아침 7시, 출근 전"
              className="w-full bg-fill border border-line rounded-lg px-3 py-2.5 text-body2 focus:outline-none focus:border-primary focus:bg-surface transition-all" />
          </div>
          <div className="px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Timer size={20} className="text-primary" />
              <div>
                <p className="text-body2 font-semibold text-label-strong">타이머 기능</p>
                <p className="text-caption1 text-label-alt">습관마다 시간을 설정해 순서대로 진행</p>
              </div>
            </div>
            <button onClick={() => setTimerEnabled(v => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative ${timerEnabled ? 'bg-primary' : 'bg-fill-strong'}`}>
              <motion.div animate={{ x: timerEnabled ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow" />
            </button>
          </div>
        </div>

        {/* 습관 선택 + 시간 설정 통합 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-caption1 font-bold text-label-alt">습관 선택</p>
            <div className="flex items-center gap-2">
              {timerEnabled && selectedIds.length > 0 && (
                <span className="text-caption1 font-semibold text-label-alt">{totalDisplay}</span>
              )}
              <span className={`text-caption1 font-bold ${selectedIds.length >= 2 ? 'text-primary' : 'text-label-assistive'}`}>
                {selectedIds.length}개 (최소 2개)
              </span>
            </div>
          </div>

          {habits.length === 0 ? (
            <div className="bg-cautionary/10 border border-cautionary/20 rounded-xl px-4 py-4 text-center">
              <p className="text-body2 font-semibold text-[#d47800]">등록된 습관이 없어요</p>
              <p className="text-caption1 text-cautionary mt-0.5">먼저 습관을 추가해 주세요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={selectedIds} strategy={verticalListSortingStrategy}>
                  {selectedIds.map((hId, order) => {
                    const h = habits.find(x => x.id === hId);
                    if (!h) return null;
                    const secs = habitDurations[hId] ?? 60;
                    return (
                      <SortableHabitCard
                        key={hId}
                        habit={h}
                        order={order + 1}
                        secs={secs}
                        timerEnabled={timerEnabled}
                        onToggle={() => toggle(hId)}
                        onDurationChange={val => setDuration(hId, val)}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>

              {habits.filter(h => !selectedIds.includes(h.id)).map(h => {
                const secs = h.durationSeconds;
                const durLabel = secs
                  ? secs >= 60
                    ? `${Math.floor(secs / 60)}분${secs % 60 > 0 ? ` ${secs % 60}초` : ''}`
                    : `${secs}초`
                  : null;
                return (
                  <motion.button key={h.id} {...tap} onClick={() => toggle(h.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-line bg-surface text-left hover:bg-fill transition-colors">
                    <div className="w-7 h-7 rounded-full border-2 border-line flex-shrink-0" />
                    <span className="text-2xl">{h.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-body2 font-semibold text-label">{h.title}</p>
                      {h.when && <p className="text-caption1 text-label-alt truncate">{h.when}</p>}
                    </div>
                    {durLabel && (
                      <span className="text-caption2 font-semibold text-primary bg-primary-soft px-2 py-0.5 rounded-lg flex-shrink-0 inline-flex items-center gap-1">
                        <Timer size={13} strokeWidth={1.9} /> {durLabel}
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* 하단 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-surface border-t border-line-soft"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <motion.button whileTap={{ scale: 0.98 }} transition={{ duration: 0.12 }}
          onClick={handleSubmit}
          disabled={!title.trim() || selectedIds.length < 2}
          className="w-full h-12 mt-3 rounded-lg bg-primary text-white font-bold text-body1 disabled:opacity-30 hover:bg-primary-strong transition-colors">
          {isEdit ? '수정 완료' : '시작하기'}
        </motion.button>
      </div>
    </div>
  );
}

/* ── 드래그 가능한 선택된 습관 카드 ── */
interface SortableHabitCardProps {
  habit: Habit;
  order: number;
  secs: number;
  timerEnabled: boolean;
  onToggle: () => void;
  onDurationChange: (val: number) => void;
}

function SortableHabitCard({
  habit, order, secs, timerEnabled, onToggle, onDurationChange,
}: SortableHabitCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: habit.id });
  const [showSheet, setShowSheet] = useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <>
      <div ref={setNodeRef} style={style}
        className="rounded-xl border border-primary/30 bg-primary-soft/40 overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5">
          <button onClick={onToggle}
            className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center flex-shrink-0 text-label1 font-bold">
            {order}
          </button>
          <span className="text-2xl">{habit.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-body2 font-semibold text-label-strong">{habit.title}</p>
            {habit.when && <p className="text-caption1 text-label-alt truncate">{habit.when}</p>}
          </div>
          {timerEnabled && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={() => setShowSheet(true)}
              className="text-caption2 font-semibold text-primary bg-surface px-2.5 py-1 rounded-lg border border-primary/30 flex-shrink-0"
            >
              {fmtDuration(secs)}
            </motion.button>
          )}
          <button {...listeners} {...attributes}
            className="text-label-assistive hover:text-label-alt touch-none p-1 cursor-grab active:cursor-grabbing">
            <GripVertical size={18} />
          </button>
        </div>
      </div>

      <DurationPickerSheet
        isOpen={showSheet}
        seconds={secs}
        onConfirm={onDurationChange}
        onClose={() => setShowSheet(false)}
        title={`⏱️ ${habit.emoji} ${habit.title}`}
      />
    </>
  );
}
