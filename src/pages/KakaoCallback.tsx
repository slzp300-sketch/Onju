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
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const kakaoError = params.get('error');

      if (kakaoError || !code) {
        setError('카카오 로그인이 취소되었어요.');
        return;
      }

      try {
        const redirectUri = `${window.location.origin}/auth/kakao/callback`;
        const res = await fetch('/api/kakao-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, redirectUri }),
        });

        if (!res.ok) throw new Error();

        const profile = await res.json() as KakaoProfile;
        socialLogin('kakao', profile);
        navigate('/', { replace: true });
      } catch {
        setError('카카오 사용자 정보를 불러오지 못했어요.');
      }
    };

    void run();
  }, [navigate, socialLogin]);

  return (
    <div className="min-h-dvh bg-surface flex flex-col items-center justify-center px-6 text-center">
      {error ? (
        <>
          <p className="text-sm font-semibold text-gray-800">{error}</p>
          <button
            onClick={() => navigate('/login', { replace: true })}
            className="mt-5 h-12 rounded-2xl bg-indigo-500 px-6 text-sm font-bold text-white"
          >
            로그인으로 돌아가기
          </button>
        </>
      ) : (
        <>
          <LoadingSpinner />
          <p className="mt-5 text-sm text-gray-400">카카오 로그인 중이에요.</p>
        </>
      )}
    </div>
  );
}
