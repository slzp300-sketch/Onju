import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { loginWithGoogle, loginWithKakao } from '../lib/authActions';

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated } = useAuthStore();

  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // 소셜/이메일 어떤 경로든 세션이 생기면 홈으로 (웹 OAuth 리다이렉트 복귀 포함)
  useEffect(() => {
    if (isAuthenticated) navigate('/', { replace: true });
  }, [isAuthenticated, navigate]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');
    const result = await login(email.trim(), password);
    setLoading(false);
    if (!result.success) {
      setError(result.error ?? '로그인에 실패했어요.');
    }
  };

  const handleSocial = async (provider: 'google' | 'kakao') => {
    setError('');
    try {
      await (provider === 'google' ? loginWithGoogle() : loginWithKakao());
    } catch {
      setError(`${provider === 'kakao' ? '카카오' : '구글'} 로그인에 실패했어요.`);
    }
  };

  return (
    <div className="min-h-dvh bg-surface flex flex-col px-6">
      {/* 헤더 */}
      <div className="flex flex-col items-center pt-20 pb-10">
        <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mb-4 border border-line">
          <span className="text-white text-2xl font-bold font-brand">직</span>
        </div>
        <h1 className="text-heading2 font-bold text-label-strong font-brand">온주</h1>
        <p className="text-label2 text-label-alt mt-1">크리스천 직장인의 루틴 파트너</p>
      </div>

      {/* 소셜 로그인 */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => handleSocial('google')}
          className="w-full flex items-center justify-center gap-3 border border-line rounded-lg h-12 text-body2 font-medium text-label bg-surface hover:bg-fill transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/>
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 16 19.1 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 35.5 26.8 36 24 36c-5.2 0-9.6-3.3-11.3-8H6.1C9.5 35.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.3-2.3 4.2-4.2 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/>
          </svg>
          구글로 계속하기
        </button>

        <button
          onClick={() => handleSocial('kakao')}
          className="w-full flex items-center justify-center gap-3 rounded-lg h-12 text-body2 font-medium text-[#3C1E1E] bg-[#FEE500] hover:bg-[#F5DC00] transition-colors"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#3C1E1E">
            <path d="M12 3C6.48 3 2 6.69 2 11.25c0 2.91 1.82 5.47 4.58 6.97L5.5 21l4.27-2.27c.73.1 1.48.15 2.23.15 5.52 0 10-3.69 10-8.25S17.52 3 12 3z"/>
          </svg>
          카카오로 계속하기
        </button>

        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-line-soft" />
          <span className="text-caption1 text-label-assistive">또는</span>
          <div className="flex-1 h-px bg-line-soft" />
        </div>

        {!showEmail ? (
          <button
            onClick={() => setShowEmail(true)}
            className="w-full border border-line rounded-lg h-12 text-body2 font-medium text-label-alt hover:bg-fill transition-colors"
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
              className="input-base"
            />
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호"
              autoComplete="current-password"
              className="input-base"
            />
            <button
              type="submit"
              disabled={loading || !email.trim() || !password}
              className="w-full bg-primary text-white rounded-lg h-12 text-body2 font-bold disabled:opacity-30 hover:bg-primary-strong transition-colors"
            >
              로그인
            </button>
          </form>
        )}

        {error && <p className="text-caption1 text-negative px-1 text-center">{error}</p>}
      </div>

      <p className="text-body2 text-label-alt text-center mt-6">
        계정이 없으신가요?{' '}
        <Link to="/signup" className="text-primary font-medium">
          회원가입
        </Link>
      </p>
    </div>
  );
}
