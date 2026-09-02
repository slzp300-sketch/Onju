/**
 * 화면 하단의 은은한 숲 실루엣 — 로그인/회원가입/온보딩 등 브랜딩 화면용.
 * 콘텐츠 뒤(z-0)에 깔리는 장식이므로 포인터 이벤트 차단 안 함.
 * 크레파스 스케치 스타일: feTurbulence 변위로 거친 손그림 가장자리를 낸다.
 */
export default function ForestBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 max-w-md mx-auto" aria-hidden>
      <svg viewBox="0 0 390 140" className="w-full" preserveAspectRatio="xMidYMax slice">
        <defs>
          {/* 크레파스 가장자리 — 노이즈 변위로 선을 흔든다 */}
          <filter id="crayon-edge" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.05 0.12" numOctaves="3" seed="7" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="5" />
          </filter>
          <filter id="crayon-edge-soft" x="-5%" y="-5%" width="110%" height="110%">
            <feTurbulence type="fractalNoise" baseFrequency="0.03 0.08" numOctaves="3" seed="3" result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale="7" />
          </filter>
        </defs>
        {/* 뒷줄 언덕 */}
        <path d="M0 90 Q90 56 195 78 Q300 98 390 66 V140 H0 Z" fill="var(--color-primary)" opacity="0.09" filter="url(#crayon-edge-soft)" />
        {/* 뒷줄 나무들 */}
        <g fill="var(--color-primary)" opacity="0.16" filter="url(#crayon-edge)">
          <path d="M48 92 l13 -30 l13 30 Z" />
          <rect x="59" y="92" width="4" height="9" rx="1.5" />
          <path d="M300 84 l15 -34 l15 34 Z" />
          <rect x="313" y="84" width="4" height="10" rx="1.5" />
        </g>
        {/* 앞줄 언덕 */}
        <path d="M0 116 Q120 88 230 108 Q320 122 390 104 V140 H0 Z" fill="var(--color-primary)" opacity="0.13" filter="url(#crayon-edge-soft)" />
        {/* 앞줄 나무·풀 */}
        <g fill="var(--color-primary)" opacity="0.24" filter="url(#crayon-edge)">
          <circle cx="130" cy="96" r="14" />
          <rect x="127.5" y="104" width="5" height="14" rx="2" />
          <path d="M226 118 q2 -10 7 -13 q0 9 -4 14 Z" />
          <path d="M236 119 q-1 -8 -6 -11 q0 8 3 12 Z" />
          <path d="M30 124 q2 -9 6 -12 q0 8 -3 13 Z" />
          <path d="M352 120 q2 -9 6 -12 q0 8 -3 13 Z" />
        </g>
      </svg>
    </div>
  );
}
