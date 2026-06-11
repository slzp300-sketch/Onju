import { useEffect } from 'react';
import { useTreeGrowth } from './useTreeGrowth';
import { useTreeStore } from '../store/treeStore';
import { useUIStore } from '../store/uiStore';

/**
 * 나무 단계 상승 감지 → StageUpModal 트리거.
 * - hydrate 완료 전에는 판단하지 않음 (빈 스토어 → hydrate 점프 오발 방지)
 * - lastCelebratedStage가 null(첫 실행)이면 무음 동기화 — 기존 기록 보유자가
 *   가입 후 첫 화면에서 축하 모달 연타를 맞지 않도록
 */
export function useTreeStageWatcher() {
  const { stage } = useTreeGrowth();
  const { lastCelebratedStage, setLastCelebratedStage } = useTreeStore();
  const dataHydrated = useUIStore(s => s.dataHydrated);
  const setPendingStageUp = useUIStore(s => s.setPendingStageUp);

  useEffect(() => {
    if (!dataHydrated) return;
    if (lastCelebratedStage === null) {
      setLastCelebratedStage(stage);
      return;
    }
    if (stage > lastCelebratedStage) {
      setPendingStageUp(stage);
      setLastCelebratedStage(stage);
    }
  }, [stage, lastCelebratedStage, dataHydrated, setLastCelebratedStage, setPendingStageUp]);
}
