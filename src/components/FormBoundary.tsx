import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import LoadingSpinner from './ui/LoadingSpinner';
import EmptyState from './ui/EmptyState';

export default function FormBoundary({ id, exists, children }: { id?: string; exists: boolean; children: ReactNode }) {
  const hydrated = useUIStore(s => s.dataHydrated);
  const owner = useAuthStore(s => s.user?.id);
  const navigate = useNavigate();
  if (!hydrated) return <LoadingSpinner />;
  if (id && !exists) return <EmptyState title="수정할 항목을 찾지 못했어요" description="삭제되었거나 다른 계정의 항목일 수 있어요. 홈에서 다시 확인해주세요."
    action={<button className="min-h-11 px-4 font-bold text-primary" onClick={() => navigate('/', { replace: true })}>홈으로</button>} />;
  return <div key={`${owner}:${id ?? 'new'}`}>{children}</div>;
}
