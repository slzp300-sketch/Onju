import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
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

  return (
    <div className="min-h-dvh bg-white flex flex-col px-6">
      {/* 헤더 */}
      <div className="flex flex-col items-center pt-20 pb-10">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center mb-4">
          <span className="text-white text-2xl font-bold">직</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">직장생활조</h1>
        <p className="text-sm text-gray-400 mt-1">크리스천 직장인의 루틴 파트너</p>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="이메일"
          autoComplete="email"
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

        {error && <p className="text-xs text-red-500 px-1">{error}</p>}

        <button
          type="submit"
          disabled={loading || !email.trim() || !password}
          className="w-full bg-indigo-500 text-white rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-40 mt-1"
        >
          로그인
        </button>
      </form>

      <p className="text-sm text-gray-400 text-center mt-6">
        계정이 없으신가요?{' '}
        <Link to="/signup" className="text-indigo-500 font-medium">
          회원가입
        </Link>
      </p>
    </div>
  );
}
