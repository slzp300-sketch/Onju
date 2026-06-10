import ProgressRing from '../ui/ProgressRing';
import { useRoutineStore } from '../../store/routineStore';
import { getTodayRates } from '../../utils/completion';
import { today } from '../../utils/date';

export default function DailyProgress() {
  const { personalRoutines, faithRoutines, logs } = useRoutineStore();
  const { personal, faith } = getTodayRates(personalRoutines, faithRoutines, logs, today());

  return (
    <div className="flex justify-around py-2">
      <ProgressRing rate={personal} color="#6366f1" label="개인 루틴" size={80} />
      <ProgressRing rate={faith} color="#1f8a4c" label="신앙 루틴" size={80} />
    </div>
  );
}
