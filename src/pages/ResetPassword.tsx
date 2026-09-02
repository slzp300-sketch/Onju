import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { updatePassword } from '../lib/authActions';
import BrandLogo from '../components/ui/BrandLogo';
import ForestBackdrop from '../components/tree/ForestBackdrop';

/**
 * 비밀번호 재설정 — 메일의 재설정 링크로 진입한다.
 * 링크를 열면 Supabase가 복구 세션을 만들어 주므로(isAuthenticated),
 * 세션이 없으면 만료·직접 접근으로 안내한다.
 */
export default function ResetPassword() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuthStore();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      setError('비밀번호는 6자 이상이어야 해요.');
      return;
    }
    if (password !== confirm) {
      setError('비밀번호가 서로 달라요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await updatePassword(password);
      navigate('/', { replace: true });
    } catch {
      setError('비밀번호 변경에 실패했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-dvh bg-surface flex flex-col px-6">
      <ForestBackdrop />
      <div className="flex flex-col items-center pt-20 pb-10">
        <div className="mb-4">
          <BrandLogo size={56} />
        </div>
        <h1 className="text-heading2 font-bold text-label-strong font-brand">비밀번호 재설정</h1>
      </div>

      {isAuthenticated ? (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="새 비밀번호 (6자 이상)"
            autoComplete="new-password"
            autoFocus
            className="input-base"
          />
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="새 비밀번호 확인"
            autoComplete="new-password"
            className="input-base"
          />
          <button
            type="submit"
            disabled={loading || !password || !confirm}
            className="w-full bg-primary text-white rounded-lg h-12 text-body2 font-bold disabled:opacity-30 hover:bg-primary-strong transition-colors"
          >
            비밀번호 변경
          </button>
          {error && <p className="text-caption1 text-negative px-1 text-center">{error}</p>}
        </form>
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-body2 text-label-alt leading-relaxed">
            재설정 링크가 만료됐거나 잘못된 접근이에요.{'\n'}
            로그인 화면에서 재설정 메일을 다시 요청해주세요.
          </p>
          <Link to="/login" className="text-primary font-medium text-body2">
            로그인 화면으로
          </Link>
        </div>
      )}
    </div>
  );
}
