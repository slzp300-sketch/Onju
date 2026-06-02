import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGoogleLogin } from '@react-oauth/google';
import { useAuthStore } from '../store/authStore';

interface KakaoStatic {
  isInitialized: () => boolean;
  init: (key: string) => void;
  Auth: {
    login: (options: { success: () => void; fail: () => void }) => void;
  };
  API: {
    request: (options: { url: string; success: (res: KakaoUserResponse) => void; fail: () => void }) => void;
  };
}

interface KakaoUserResponse {
  id: number;
  kakao_account?: {
    profile?: { nickname?: string };
    email?: string;
  };
}

declare global {
  interface Window {
    Kakao: KakaoStatic;
  }
}

export default function Login() {
  const navigate = useNavigate();
  const { login, socialLogin } = useAuthStore();

  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 카카오 SDK 로드
  useEffect(() => {
    if (window.Kakao) return;
    const script = document.createElement('script');
    script.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js';
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        window.Kakao.init(import.meta.env.VITE_KAKAO_JS_KEY);
      }
    };
    document.head.appendChild(script);
  }, []);

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    const result = login(email.trim(), password);
    setLoading(false);
    if (result.success) {
      navigate('/', { replace: true });
    } else {
      setError(result.error ?? '로그인에 실패했어요.');
    }
  };

  const handleGoogle = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      try {
        const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
        });
        const data = await res.json();
        socialLogin('google', { id: data.sub, name: data.name, email: data.email });
        navigate('/', { replace: true });
      } catch {
        setError('구글 로그인에 실패했어요.');
      }
    },
    onError: () => setError('구글 로그인에 실패했어요.'),
  });

  const handleKakao = () => {
    if (!window.Kakao?.isInitialized()) {
      setError('카카오 SDK가 아직 로드되지 않았어요. 잠시 후 다시 시도해주세요.');
      return;
    }
    window.Kakao.Auth.login({
      success: () => {
        window.Kakao.API.request({
          url: '/v2/user/me',
          success: (res: KakaoUserResponse) => {
            const profile = res.kakao_account?.profile;
            const email = res.kakao_account?.email;
            socialLogin('kakao', {
              id: String(res.id),
              name: profile?.nickname ?? '카카오 사용자',
              email,
            });
            navigate('/', { replace: true });
          },
          fail: () => setError('카카오 사용자 정보를 불러오지 못했어요.'),
        });
      },
      fail: () => setError('카카오 로그인에 실패했어요.'),
    });
  };

  return (
    <div className="min-h-dvh bg-white flex flex-col px-6">
      {/* 헤더 */}
      <div className="flex flex-col items-center pt-20 pb-10">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center mb-4">
          <span className="text-white text-2xl font-bold">직</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">온주</h1>
        <p className="text-sm text-gray-400 mt-1">크리스천 직장인의 루틴 파트너</p>
      </div>

      {/* 소셜 로그인 버튼들 */}
      <div className="flex flex-col gap-3">
        {/* 구글 */}
        <button
          onClick={() => handleGoogle()}
          className="w-full flex items-center justify-center gap-3 border border-gray-200 rounded-2xl py-3.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 active:bg-gray-100 transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 16 19.1 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.5 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-8H6.1C9.5 35.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          구글로 계속하기
        </button>

        {/* 카카오 */}
        <button
          onClick={handleKakao}
          className="w-full flex items-center justify-center gap-3 rounded-2xl py-3.5 text-sm font-medium text-[#3C1E1E] bg-[#FEE500] hover:bg-[#F5DC00] active:bg-[#EDD000] transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#3C1E1E">
            <path d="M12 3C6.48 3 2 6.69 2 11.25c0 2.91 1.82 5.47 4.58 6.97L5.5 21l4.27-2.27c.73.1 1.48.15 2.23.15 5.52 0 10-3.69 10-8.25S17.52 3 12 3z"/>
          </svg>
          카카오로 계속하기
        </button>

        {/* 구분선 */}
        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400">또는</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* 이메일 로그인 토글 */}
        {!showEmail ? (
          <button
            onClick={() => setShowEmail(true)}
            className="w-full border border-gray-200 rounded-2xl py-3.5 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
          >
            이메일로 로그인
          </button>
        ) : (
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="이메일"
              autoComplete="email"
              autoFocus
              className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full bg-indigo-500 text-white rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-40"
            >
              로그인
            </button>
          </form>
        )}

        {error && <p className="text-xs text-red-500 px-1 text-center">{error}</p>}
      </div>

      <p className="text-sm text-gray-400 text-center mt-6">
        계정이 없으신가요?{' '}
        <Link to="/signup" className="text-indigo-500 font-medium">
          회원가입
        </Link>
      </p>
    </div>
  );
}
