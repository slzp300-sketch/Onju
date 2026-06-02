import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import LoadingSpinner from '../components/ui/LoadingSpinner';
import { useAuthStore } from '../store/authStore';

interface KakaoProfile {
  id: string;
  name: string;
  email?: string;
}

export default function KakaoCallback() {
  const navigate = useNavigate();
  const socialLogin = useAuthStore(s => s.socialLogin);
  const [error, setError] = useState('');

  useEffect(() => {
    const loginWithKakao = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const kakaoError = params.get('error');

      if (kakaoError) {
        setError('카카오 로그인이 취소되었어요.');
        return;
      }

      if (!code) {
        setError('카카오 인증 코드를 찾을 수 없어요.');
        return;
      }

      try {
        const redirectUri = `${window.location.origin}/auth/kakao/callback`;
        const response = await fetch('/api/kakao-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri }),
        });

        if (!response.ok) throw new Error('Kakao profile request failed');

        const profile = await response.json() as KakaoProfile;
        socialLogin('kakao', profile);
        navigate('/', { replace: true });
      } catch {
        setError('카카오 사용자 정보를 불러오지 못했어요.');
      }
    };

    void loginWithKakao();
  }, [navigate, socialLogin]);

  return (
    <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6 text-center">
      {error ? (
        <>
          <p className="text-body1 font-semibold text-label-strong">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="mt-5 h-12 rounded-lg bg-primary px-6 text-body2 font-bold text-white"
          >
            로그인으로 돌아가기
          </button>
        </>
      ) : (
        <>
          <LoadingSpinner />
          <p className="mt-5 text-body2 text-label-alt">카카오 로그인 중이에요.</p>
        </>
      )}
    </div>
  );
}
