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
    <div className="min-h-dvh bg-surface flex flex-col px-6">
      {/* 헤더 */}
      <div className="flex flex-col items-center pt-16 pb-8">
        <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mb-4 shadow-strong">
          <span className="text-white text-2xl font-bold font-brand">직</span>
        </div>
        <h1 className="text-heading2 font-bold text-label-strong font-brand">회원가입</h1>
        <p className="text-label2 text-label-alt mt-1">함께 루틴을 만들어가요</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="이름"
          autoComplete="name"
          className="input-base"
        />
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="이메일"
          autoComplete="email"
          className="input-base"
        />
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="비밀번호 (6자 이상)"
          autoComplete="new-password"
          className="input-base"
        />
        <input
          type="password"
          value={passwordConfirm}
          onChange={e => setPasswordConfirm(e.target.value)}
          placeholder="비밀번호 확인"
          autoComplete="new-password"
          className="input-base"
        />

        {error && <p className="text-caption1 text-negative px-1">{error}</p>}

        <button
          type="submit"
          disabled={loading || !name.trim() || !email.trim() || !password || !passwordConfirm}
          className="w-full bg-primary text-white rounded-lg h-12 text-body2 font-bold disabled:opacity-30 hover:bg-primary-strong transition-colors mt-1"
        >
          가입하기
        </button>
      </form>

      <p className="text-body2 text-label-alt text-center mt-6">
        이미 계정이 있으신가요?{' '}
        <Link to="/login" className="text-primary font-medium">
          로그인
        </Link>
      </p>
    </div>
  );
}
