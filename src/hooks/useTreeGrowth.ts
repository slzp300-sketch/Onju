import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useHabitStore } from '../store/habitStore';
import { useRoutineStore } from '../store/routineStore';
import { useDiaryStore } from '../store/diaryStore';
import { fetchReviews } from '../api/reviews';
import { calcTreeGrowth, type TreeGrowth } from '../utils/treeGrowth';

/** 나무 성장 상태 — 스토어/리뷰가 바뀔 때만 재계산 */
export function useTreeGrowth(): TreeGrowth {
  const habits = useHabitStore(s => s.habits);
  const habitLogs = useHabitStore(s => s.habitLogs);
  const faithRoutines = useRoutineStore(s => s.faithRoutines);
  const routineLogs = useRoutineStore(s => s.logs);
  const diaryEntries = useDiaryStore(s => s.entries);
  const { data: reviews } = useQuery({ queryKey: ['reviews'], queryFn: fetchReviews });

  return useMemo(
    () => calcTreeGrowth(habits, habitLogs, faithRoutines, routineLogs, diaryEntries, reviews ?? []),
    [habits, habitLogs, faithRoutines, routineLogs, diaryEntries, reviews],
  );
}
