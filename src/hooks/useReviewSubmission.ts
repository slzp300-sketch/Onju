import { useSyncExternalStore } from 'react';
import { readReviewSubmission, subscribeReviewSubmission, type ReviewSubmission } from '../lib/reviewSubmission';

export function useReviewSubmission(owner: string | undefined) {
  const serialized = useSyncExternalStore(subscribeReviewSubmission, () => {
    try { return JSON.stringify({ journal: owner ? readReviewSubmission(owner) : null, error: null }); }
    catch { return JSON.stringify({journal:null,error:'리뷰 저장 상태를 읽지 못했어요. 기기 데이터를 지우지 말고 다시 불러와주세요.'}); }
  });
  return JSON.parse(serialized) as {journal:ReviewSubmission|null;error:string|null};
}
