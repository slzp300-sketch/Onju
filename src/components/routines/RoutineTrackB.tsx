import { useRoutineStore } from '../../store/routineStore';
import RoutineItem from './RoutineItem';

export default function RoutineTrackB() {
  const { faithRoutines } = useRoutineStore();

  if (faithRoutines.length === 0) return null;

  return (
    <div className="divide-y divide-gray-50">
      {faithRoutines.map(routine => (
        <RoutineItem key={routine.id} routine={routine} />
      ))}
    </div>
  );
}
