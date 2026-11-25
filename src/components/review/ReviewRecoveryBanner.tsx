import { Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useReviewSubmission } from '../../hooks/useReviewSubmission';

export default function ReviewRecoveryBanner() {
  const owner=useAuthStore(s=>s.user?.id);
  const {journal,error}=useReviewSubmission(owner);
  if(!journal && !error) return null;
  const done=journal?.steps.filter(s=>s.status==='done').length??0;
  return <Link to="/review" className="block mx-4 mb-4 rounded-2xl border border-primary/20 bg-primary-soft p-4 text-body2">
    <p className="font-bold text-primary">이어서 저장할 주간 리뷰가 있어요</p>
    <p className="mt-1 text-caption1 text-label-alt">{error??`${journal!.weekStart} 주 · ${done}개 저장 완료. 남은 항목을 확인해주세요.`}</p>
    <p className="mt-2 font-semibold text-primary">저장 상태 확인 →</p>
  </Link>;
}
