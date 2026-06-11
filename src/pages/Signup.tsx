import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle, XCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const DOMAIN_OPTIONS = [
  { label: '도메인 선택', value: '' },
  { label: 'naver.com', value: 'naver.com' },
  { label: 'gmail.com', value: 'gmail.com' },
  { label: 'daum.net', value: 'daum.net' },
  { label: 'kakao.com', value: 'kakao.com' },
  { label: 'hanmail.net', value: 'hanmail.net' },
  { label: 'nate.com', value: 'nate.com' },
  { label: 'outlook.com', value: 'outlook.com' },
  { label: 'icloud.com', value: 'icloud.com' },
  { label: 'yahoo.com', value: 'yahoo.com' },
  { label: '직접입력', value: 'custom' },
];

function getPasswordStrength(pw: string): { level: 0 | 1 | 2 | 3; label: string; color: string } {
  if (pw.length === 0) return { level: 0, label: '', color: '' };
  const hasNumber = /\d/.test(pw);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pw);
  if (pw.length >= 8 && hasNumber && hasSpecial) return { level: 3, label: '강함', color: 'bg-positive' };
  if (pw.length >= 6 && hasNumber) return { level: 2, label: '보통', color: 'bg-yellow-400' };
  return { level: 1, label: '약함', color: 'bg-negative' };
}

export default function Signup() {
  const navigate = useNavigate();
  const { signup } = useAuthStore();

  const [name, setName] = useState('');
  const [emailLocal, setEmailLocal] = useState('');
  const [emailDomain, setEmailDomain] = useState('');
  const [emailCustomDomain, setEmailCustomDomain] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isCustomDomain = emailDomain === 'custom';
  const resolvedDomain = isCustomDomain ? emailCustomDomain.trim() : emailDomain;
  const fullEmail = emailLocal.trim() && resolvedDomain ? `${emailLocal.trim()}@${resolvedDomain}` : '';
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fullEmail);
  const isNameValid = name.trim().length >= 2;
  const passwordStrength = getPasswordStrength(password);
  const isPasswordValid = password.length >= 6;
  const isPasswordMatch = password === passwordConfirm && passwordConfirm.length > 0;
  const isPasswordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;

  const canSubmit =
    isNameValid &&
    isEmailValid &&
    isPasswordValid &&
    isPasswordMatch &&
    !loading;

  // 이메일 중복은 가입 시점에 서버가 판정한다
  function handleDomainChange(newDomain: string) {
    setEmailDomain(newDomain);
    setEmailCustomDomain('');
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    const result = await signup(name.trim(), fullEmail, password);
    setLoading(false);
    if (result.success) {
      navigate('/onboarding', { replace: true });
    } else {
      setError(result.error ?? '회원가입에 실패했어요.');
    }
  };

  return (
    <div className="min-h-dvh bg-surface flex flex-col px-6">
      <div className="flex flex-col items-center pt-16 pb-8">
        <div className="w-14 h-14 rounded-xl bg-primary flex items-center justify-center mb-4 border border-line">
          <span className="text-white text-2xl font-bold font-brand">직</span>
        </div>
        <h1 className="text-heading2 font-bold text-label-strong font-brand">회원가입</h1>
        <p className="text-label2 text-label-alt mt-1">함께 루틴을 만들어가요</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        {/* 이름 */}
        <div className="flex flex-col gap-1">
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="이름 (2자 이상)"
            autoComplete="name"
            className="input-base"
          />
          {name.length > 0 && !isNameValid && (
            <p className="text-caption1 text-negative px-1 flex items-center gap-1">
              <AlertCircle size={12} />
              이름은 2자 이상 입력해주세요.
            </p>
          )}
        </div>

        {/* 이메일 */}
        <div className="flex flex-col gap-1.5">
          {/* local @ domain 한 줄 */}
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={emailLocal}
              onChange={e => setEmailLocal(e.target.value)}
              placeholder="이메일 앞자리"
              autoComplete="email"
              className="input-base flex-1 min-w-0"
              style={{ width: 0 }}
            />
            <span className="text-label-alt text-body2 shrink-0 select-none">@</span>
            <div className="relative flex-1 min-w-0" style={{ width: 0 }}>
              <select
                value={emailDomain}
                onChange={e => handleDomainChange(e.target.value)}
                className="input-base appearance-none pr-8 w-full"
                style={{ cursor: 'pointer' }}
              >
                {DOMAIN_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} disabled={opt.value === ''}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={15}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-label-alt pointer-events-none"
              />
            </div>
          </div>

          {/* 직접입력 시 도메인 텍스트 입력 */}
          {isCustomDomain && (
            <input
              type="text"
              value={emailCustomDomain}
              onChange={e => setEmailCustomDomain(e.target.value)}
              placeholder="도메인 직접 입력 (예: company.com)"
              autoComplete="off"
              className="input-base"
            />
          )}

        </div>

        {/* 비밀번호 */}
        <div className="flex flex-col gap-1">
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호 (6자 이상)"
              autoComplete="new-password"
              className="input-base pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-label-alt"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {password.length > 0 && (
            <div className="px-1 flex flex-col gap-1">
              <div className="flex gap-1 h-1">
                {[1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`flex-1 rounded-full transition-colors ${
                      passwordStrength.level >= i ? passwordStrength.color : 'bg-fill-alt'
                    }`}
                  />
                ))}
              </div>
              {passwordStrength.label && (
                <p className={`text-caption1 ${
                  passwordStrength.level === 3 ? 'text-positive' :
                  passwordStrength.level === 2 ? 'text-yellow-500' : 'text-negative'
                }`}>
                  비밀번호 강도: {passwordStrength.label}
                  {passwordStrength.level < 3 && ' — 숫자·특수문자를 추가하면 더 안전해요'}
                </p>
              )}
            </div>
          )}
        </div>

        {/* 비밀번호 확인 */}
        <div className="flex flex-col gap-1">
          <div className="relative">
            <input
              type={showPasswordConfirm ? 'text' : 'password'}
              value={passwordConfirm}
              onChange={e => setPasswordConfirm(e.target.value)}
              placeholder="비밀번호 확인"
              autoComplete="new-password"
              className="input-base pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPasswordConfirm(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-label-alt"
            >
              {showPasswordConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {isPasswordMatch && (
            <p className="text-caption1 text-positive px-1 flex items-center gap-1">
              <CheckCircle size={12} />
              비밀번호가 일치해요.
            </p>
          )}
          {isPasswordMismatch && (
            <p className="text-caption1 text-negative px-1 flex items-center gap-1">
              <XCircle size={12} />
              비밀번호가 일치하지 않아요.
            </p>
          )}
        </div>

        {error && (
          <p className="text-caption1 text-negative px-1 flex items-center gap-1">
            <AlertCircle size={12} />
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full bg-primary text-white rounded-lg h-12 text-body2 font-bold disabled:opacity-30 enabled:hover:bg-primary-strong transition-colors mt-1"
        >
          가입하기
        </button>
      </form>

      <p className="text-body2 text-label-alt text-center mt-6 pb-8">
        이미 계정이 있으신가요?{' '}
        <Link to="/login" className="text-primary font-medium">
          로그인
        </Link>
      </p>
    </div>
  );
}
