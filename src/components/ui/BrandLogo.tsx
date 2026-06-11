/**
 * 온주 브랜드 마크 — 자라나는 나무.
 * 로그인/회원가입/온보딩 등 인증·브랜딩 화면에서 사용.
 */
export default function BrandLogo({ size = 56 }: { size?: number }) {
  return (
    <div
      className="rounded-2xl flex items-center justify-center"
      style={{ width: size, height: size, background: 'var(--gradient-canopy)' }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 48 48" fill="none">
        {/* 줄기 */}
        <path d="M24 42 Q23 30 24 22" stroke="#ffffff" strokeWidth="3.4" strokeLinecap="round" />
        {/* 가지 */}
        <path d="M24 30 Q18 26 15 21" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M24 27 Q30 23 33 18" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" />
        {/* 잎뭉치 */}
        <circle cx="13.5" cy="18" r="5.5" fill="#ffffff" opacity="0.92" />
        <circle cx="34.5" cy="15" r="6" fill="#ffffff" opacity="0.92" />
        <circle cx="24" cy="10.5" r="7" fill="#ffffff" />
        {/* 땅 */}
        <path d="M14 42 H34" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity="0.7" />
      </svg>
    </div>
  );
}
