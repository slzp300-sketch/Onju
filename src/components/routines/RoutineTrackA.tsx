import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { useRoutineStore } from '../../store/routineStore';
import RoutineItem from './RoutineItem';
import type { DailyRoutine } from '../../types';

function SortableRoutineItem({ routine }: { routine: DailyRoutine }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: routine.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
    >
      <RoutineItem
        routine={routine}
        dragHandle={
          <button {...attributes} {...listeners} className="text-label-assistive touch-none cursor-grab">
            <GripVertical size={16} />
          </button>
        }
      />
    </div>
  );
}

export default function RoutineTrackA() {
  const { personalRoutines, reorderRoutines } = useRoutineStore();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = personalRoutines.findIndex(r => r.id === active.id);
    const newIndex = personalRoutines.findIndex(r => r.id === over.id);
    reorderRoutines('personal', oldIndex, newIndex);
  };

  if (personalRoutines.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={personalRoutines.map(r => r.id)} strategy={verticalListSortingStrategy}>
        <div className="divide-y divide-y divide-line-soft">
          {personalRoutines.map(routine => (
            <SortableRoutineItem key={routine.id} routine={routine} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
