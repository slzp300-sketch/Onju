import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';

export default function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuthStore();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !password) return;

    if (password !== passwordConfirm) {
      setError('비밀번호가 일치하지 않아요.');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 해요.');
      return;
    }

    setLoading(true);
    setError('');
    const result = signup(name.trim(), email.trim(), password);
    setLoading(false);

    if (result.success) {
      navigate('/onboarding', { replace: true });
    } else {
      setError(result.error ?? '회원가입에 실패했어요.');
    }
  };

  return (
    <div className="min-h-dvh bg-white flex flex-col px-6">
      {/* 헤더 */}
      <div className="flex flex-col items-center pt-16 pb-8">
        <div className="w-14 h-14 rounded-2xl bg-indigo-500 flex items-center justify-center mb-4">
          <span className="text-white text-2xl font-bold">직</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">회원가입</h1>
        <p className="text-sm text-gray-400 mt-1">함께 루틴을 만들어가요</p>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="이름"
          autoComplete="name"
          className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
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
          placeholder="비밀번호 (6자 이상)"
          autoComplete="new-password"
          className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <input
          type="password"
          value={passwordConfirm}
          onChange={e => setPasswordConfirm(e.target.value)}
          placeholder="비밀번호 확인"
          autoComplete="new-password"
          className="w-full border border-gray-200 rounded-2xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />

        {error && <p className="text-xs text-red-500 px-1">{error}</p>}

        <button
          type="submit"
          disabled={loading || !name.trim() || !email.trim() || !password || !passwordConfirm}
          className="w-full bg-indigo-500 text-white rounded-2xl py-3.5 text-sm font-semibold disabled:opacity-40 mt-1"
        >
          가입하기
        </button>
      </form>

      <p className="text-sm text-gray-400 text-center mt-6">
        이미 계정이 있으신가요?{' '}
        <Link to="/login" className="text-indigo-500 font-medium">
          로그인
        </Link>
      </p>
    </div>
  );
}
