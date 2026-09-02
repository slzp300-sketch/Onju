/**
 * 하단 네비 크레파스 아이콘 — lucide 대체 손그림 세트.
 * lucide와 동일한 {size, strokeWidth} 인터페이스라 App의 NavItem에 그대로 꽂힌다.
 */
interface IconProps {
  size?: number;
  strokeWidth?: number;
}

function CrayonSvg({ children, size = 22 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <defs>
        <filter id="nav-crayon" x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence type="fractalNoise" baseFrequency="0.25 0.35" numOctaves="2" seed="8" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="0.9" />
        </filter>
      </defs>
      <g
        filter="url(#nav-crayon)"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

/** 홈 — 언덕 위 작은 나무 */
export function NavTree({ size, strokeWidth = 1.8 }: IconProps) {
  return (
    <CrayonSvg size={size}>
      <g strokeWidth={strokeWidth}>
        <path d="M12 20 V13.5" />
        <circle cx="12" cy="8" r="3.6" />
        <circle cx="8.6" cy="11" r="2.6" />
        <circle cx="15.4" cy="11" r="2.6" />
        <path d="M6 20.5 Q12 17.5 18 20.5" />
      </g>
    </CrayonSvg>
  );
}

/** 통계 — 삐뚤한 막대 셋 */
export function NavBars({ size, strokeWidth = 1.8 }: IconProps) {
  return (
    <CrayonSvg size={size}>
      <g strokeWidth={strokeWidth + 0.6}>
        <path d="M6 19.5 L6.2 13" />
        <path d="M12 19.5 L11.8 6.5" />
        <path d="M18 19.5 L18.1 10.5" />
      </g>
      <path d="M4 20 Q12 19.2 20 20" strokeWidth={strokeWidth * 0.8} opacity="0.6" />
    </CrayonSvg>
  );
}

/** 소모임 — 나란한 두 사람 */
export function NavPeople({ size, strokeWidth = 1.8 }: IconProps) {
  return (
    <CrayonSvg size={size}>
      <g strokeWidth={strokeWidth}>
        <circle cx="9" cy="8.5" r="2.8" />
        <path d="M4.5 19 Q4.8 13.8 9 13.8 Q13.2 13.8 13.5 19" />
        <circle cx="16.3" cy="9.5" r="2.3" />
        <path d="M14.8 13.6 Q19.4 13.8 19.7 18.6" />
      </g>
    </CrayonSvg>
  );
}

/** 마이페이지 — 동그라미 속 사람 */
export function NavProfile({ size, strokeWidth = 1.8 }: IconProps) {
  return (
    <CrayonSvg size={size}>
      <g strokeWidth={strokeWidth}>
        <circle cx="12" cy="12" r="8.6" />
        <circle cx="12" cy="10" r="2.7" />
        <path d="M6.8 18.4 Q7.6 14.6 12 14.6 Q16.4 14.6 17.2 18.4" />
      </g>
    </CrayonSvg>
  );
}
