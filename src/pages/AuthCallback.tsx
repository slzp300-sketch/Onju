import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import LoadingSpinner from '../components/ui/LoadingSpinner';

/**
 * 웹 OAuth(구글/카카오) 리다이렉트 복귀 지점.
 * supabase-js가 URL의 인가코드를 자동 교환(detectSessionInUrl)하므로
 * 여기서는 세션이 생기길 기다렸다가 홈으로 보낸다.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const { isAuthenticated, authReady } = useAuthStore();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 10000);
    return () => clearTimeout(t);
  }, []);

  if (timedOut && authReady && !isAuthenticated) {
    return (
      <div className="min-h-dvh bg-surface flex flex-col items-center justify-center gap-3 px-6">
        <p className="text-body2 text-label-alt">로그인에 실패했어요. 다시 시도해주세요.</p>
        <button
          onClick={() => navigate('/login', { replace: true })}
          className="text-body2 font-medium text-primary"
        >
          로그인으로 돌아가기
        </button>
      </div>
    );
  }

  return <LoadingSpinner />;
}
