import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/ui/LoadingSpinner';

// 팝업 방식 사용으로 이 페이지는 사용되지 않음
// 혹시 redirect로 유입된 경우 로그인으로 보냄
export default function KakaoCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/login', { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-dvh bg-surface flex flex-col items-center justify-center">
      <LoadingSpinner />
    </div>
  );
}
