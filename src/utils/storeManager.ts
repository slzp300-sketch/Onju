import { useRoutineStore } from '../store/routineStore';
import { useGoalStore } from '../store/goalStore';
import { useGroupStore } from '../store/groupStore';

export function saveUserData(userId: string) {
  const routineRaw = localStorage.getItem('routine-store');
  const goalRaw = localStorage.getItem('goal-store');
  const groupRaw = localStorage.getItem('group-store');
  if (routineRaw) localStorage.setItem(`routine-store-${userId}`, routineRaw);
  if (goalRaw) localStorage.setItem(`goal-store-${userId}`, goalRaw);
  if (groupRaw) localStorage.setItem(`group-store-${userId}`, groupRaw);
}

export function restoreUserData(userId: string) {
  const routineRaw = localStorage.getItem(`routine-store-${userId}`);
  const goalRaw = localStorage.getItem(`goal-store-${userId}`);
  const groupRaw = localStorage.getItem(`group-store-${userId}`);

  if (routineRaw) {
    try {
      const { state } = JSON.parse(routineRaw);
      if (state) {
        useRoutineStore.setState({
          personalRoutines: state.personalRoutines ?? [],
          faithRoutines: state.faithRoutines ?? [],
          logs: state.logs ?? [],
        });
      }
    } catch { /* 손상된 데이터는 무시 */ }
  } else {
    useRoutineStore.setState({ personalRoutines: [], faithRoutines: [], logs: [] });
  }

  if (goalRaw) {
    try {
      const { state } = JSON.parse(goalRaw);
      if (state) {
        useGoalStore.setState({
          monthlyGoals: state.monthlyGoals ?? [],
          weeklyGoals: state.weeklyGoals ?? [],
        });
      }
    } catch { /* 손상된 데이터는 무시 */ }
  } else {
    useGoalStore.setState({ monthlyGoals: [], weeklyGoals: [] });
  }

  if (groupRaw) {
    try {
      const { state } = JSON.parse(groupRaw);
      if (state) {
        useGroupStore.setState({
          groups: state.groups ?? [],
          myGroupIds: state.myGroupIds ?? [],
        });
      }
    } catch { /* 손상된 데이터는 무시 */ }
  } else {
    useGroupStore.setState({ groups: [], myGroupIds: [] });
  }
}

export function clearStores() {
  useRoutineStore.setState({ personalRoutines: [], faithRoutines: [], logs: [] });
  useGoalStore.setState({ monthlyGoals: [], weeklyGoals: [] });
  useGroupStore.setState({ groups: [], myGroupIds: [] });
  localStorage.removeItem('routine-store');
  localStorage.removeItem('goal-store');
  localStorage.removeItem('group-store');
}
