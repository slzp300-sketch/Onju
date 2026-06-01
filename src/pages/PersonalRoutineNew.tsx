import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, Timer, GripVertical } from 'lucide-react';
import DurationPicker from '../components/ui/DurationPicker';
import { useHabitStore } from '../store/habitStore';
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

const tap = { whileTap: { scale: 0.94 }, transition: { type: 'spring' as const, stiffness: 600, damping: 20 } };
const tapSm = { whileTap: { scale: 0.88 }, transition: { type: 'spring' as const, stiffness: 700, damping: 22 } };

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
      setHabitDurations(prev => ({ ...prev, [hId]: 60 }));
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
      addPersonalRoutine({ id: `pr-${Date.now()}`, userId: 'user-1', createdAt: new Date().toISOString(), ...data });
    }
    navigate(-1);
  };


  return (
    <div className="min-h-dvh bg-gray-50 flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 pt-5 pb-3 bg-white border-b border-gray-100">
        <motion.button {...tapSm} onClick={() => navigate(-1)} className="p-1 -ml-1 text-gray-500">
          <ChevronLeft size={24} />
        </motion.button>
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
            <EmojiPickerButton emoji={emoji} onChange={setEmoji} />
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="루틴 이름을 입력하세요" autoFocus
              className="flex-1 h-14 bg-white border border-gray-200 rounded-2xl px-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-400 shadow-sm" />
          </div>
        </div>

        {/* 언제 + 타이머 */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-4 py-4 border-b border-gray-50">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xl">⏰</span>
              <span className="text-sm font-semibold text-gray-800">언제 할래요?</span>
            </div>
            <input type="text" value={when} onChange={e => setWhen(e.target.value)}
              placeholder="예) 아침 7시, 출근 전"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div className="px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Timer size={20} className="text-indigo-500" />
              <div>
                <p className="text-sm font-semibold text-gray-800">타이머 기능</p>
                <p className="text-xs text-gray-400">습관마다 시간을 설정해 순서대로 진행</p>
              </div>
            </div>
            <button onClick={() => setTimerEnabled(v => !v)}
              className={`w-11 h-6 rounded-full transition-colors relative ${timerEnabled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
              <motion.div animate={{ x: timerEnabled ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow" />
            </button>
          </div>
        </div>

        {/* 습관 선택 + 시간 설정 통합 */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-500">습관 선택</p>
            <div className="flex items-center gap-2">
              {timerEnabled && selectedIds.length > 0 && (
                <span className="text-xs font-semibold text-gray-400">{totalDisplay}</span>
              )}
              <span className={`text-xs font-bold ${selectedIds.length >= 2 ? 'text-indigo-500' : 'text-gray-400'}`}>
                {selectedIds.length}개 (최소 2개)
              </span>
            </div>
          </div>

          {habits.length === 0 ? (
            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-4 text-center">
              <p className="text-sm font-semibold text-amber-700">등록된 습관이 없어요</p>
              <p className="text-xs text-amber-600 mt-0.5">먼저 습관을 추가해 주세요</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {/* 선택된 습관 — 드래그 순서 변경 */}
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={selectedIds} strategy={verticalListSortingStrategy}>
                  {selectedIds.map((hId, order) => {
                    const h = habits.find(x => x.id === hId);
                    if (!h) return null;
                    const secs = habitDurations[hId] ?? 60;
                    const m = Math.floor(secs / 60);
                    const s = secs % 60;
                    const display = m > 0 ? `${m}분 ${s > 0 ? `${s}초` : ''}`.trim() : `${s}초`;
                    return (
                      <SortableHabitCard
                        key={hId}
                        habit={h}
                        order={order + 1}
                        secs={secs}
                        display={display}
                        timerEnabled={timerEnabled}
                        onToggle={() => toggle(hId)}
                        onDurationChange={val => setDuration(hId, val)}
                      />
                    );
                  })}
                </SortableContext>
              </DndContext>

              {/* 미선택 습관 — 탭해서 추가 */}
              {habits.filter(h => !selectedIds.includes(h.id)).map(h => (
                <motion.button key={h.id} {...tap} onClick={() => toggle(h.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-gray-100 bg-white text-left">
                  <div className="w-7 h-7 rounded-full border-2 border-gray-200 flex-shrink-0" />
                  <span className="text-2xl">{h.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{h.title}</p>
                    {h.when && <p className="text-xs text-gray-400 truncate">{h.when}</p>}
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* 하단 버튼 */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto px-4 bg-white border-t border-gray-100"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <motion.button whileTap={{ scale: 0.97 }} transition={{ type: 'spring', stiffness: 600, damping: 20 }}
          onClick={handleSubmit}
          disabled={!title.trim() || selectedIds.length < 2}
          className="w-full py-4 mt-3 rounded-2xl bg-indigo-500 text-white font-bold text-base disabled:opacity-40 hover:bg-indigo-600 transition-colors shadow-lg shadow-indigo-200">
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
  display: string;
  timerEnabled: boolean;
  onToggle: () => void;
  onDurationChange: (val: number) => void;
}

function SortableHabitCard({
  habit, order, secs, display, timerEnabled, onToggle, onDurationChange,
}: SortableHabitCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: habit.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}
      className="rounded-2xl border border-indigo-300 bg-indigo-50/60 overflow-hidden">
      {/* 습관 행 */}
      <div className="flex items-center gap-3 px-4 py-3.5">
        {/* 순서 번호 (탭해서 선택 해제) */}
        <button onClick={onToggle}
          className="w-7 h-7 rounded-full bg-indigo-500 text-white flex items-center justify-center flex-shrink-0 text-sm font-bold">
          {order}
        </button>
        <span className="text-2xl">{habit.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">{habit.title}</p>
          {habit.when && <p className="text-xs text-gray-400 truncate">{habit.when}</p>}
        </div>
        {timerEnabled && (
          <span className="text-xs font-semibold text-indigo-500 bg-white px-2 py-0.5 rounded-full border border-indigo-100">
            {display}
          </span>
        )}
        {/* 드래그 핸들 */}
        <button {...listeners} {...attributes}
          className="text-gray-400 hover:text-gray-600 touch-none p-1 cursor-grab active:cursor-grabbing">
          <GripVertical size={18} />
        </button>
      </div>

      {/* 타이머 피커 */}
      <AnimatePresence initial={false}>
        {timerEnabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 35 }}
            className="overflow-hidden border-t border-indigo-100"
          >
            <div className="px-4 pb-3 pt-1">
              <DurationPicker seconds={secs} onChange={onDurationChange} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
