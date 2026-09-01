import { useEffect } from 'react';
import { useUIStore } from '../store/uiStore';
import { checkWeeklySlotUnlock } from '../lib/slotUnlock';

/** hydrate 완료 시점에 지난 주 달성률로 주간 슬롯 해금을 판정한다 (TreeStageWatcher 패턴) */
export default function SlotUnlockWatcher() {
  const dataHydrated = useUIStore(s => s.dataHydrated);

  useEffect(() => {
    if (dataHydrated) checkWeeklySlotUnlock();
  }, [dataHydrated]);

  return null;
}
