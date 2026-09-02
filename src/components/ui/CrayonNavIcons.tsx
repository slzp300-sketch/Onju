/**
 * 하단 네비 손그림 아이콘 — 브랜드 모티프 세트.
 * 홈=침엽수 나무, 통계=나이테, 소모임=새싹, 마이페이지=사람.
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

/** 홈 — 침엽수 나무 */
export function NavTree({ size, strokeWidth = 1.8 }: IconProps) {
  return (
    <CrayonSvg size={size}>
      <g strokeWidth={strokeWidth}>
        <path d="M12 3.5 L8.2 9 H10 L6.8 14 H9 L5.8 19 H18.2 L15 14 H17.2 L14 9 H15.8 Z" />
        <path d="M12 19 V21.5" />
      </g>
    </CrayonSvg>
  );
}

/** 통계 — 나이테 (자라난 기록의 결) */
export function NavBars({ size, strokeWidth = 1.8 }: IconProps) {
  return (
    <CrayonSvg size={size}>
      <g strokeWidth={strokeWidth}>
        <circle cx="12" cy="12" r="8.8" />
        <path d="M12 6.2 A5.8 5.8 0 1 1 6.2 12" />
        <path d="M12 9.2 A2.8 2.8 0 1 1 9.2 12" />
        <circle cx="12" cy="12" r="0.4" fill="currentColor" />
      </g>
    </CrayonSvg>
  );
}

/** 소모임 — 함께 자라는 새싹 */
export function NavPeople({ size, strokeWidth = 1.8 }: IconProps) {
  return (
    <CrayonSvg size={size}>
      <g strokeWidth={strokeWidth}>
        <path d="M12 21 V12.5" />
        <path d="M12 14.5 C12 10.2 9 7.5 5.2 7.5 C5.2 11.8 8.2 14.7 12 14.5 Z" />
        <path d="M12 12 C12 8.4 14.6 5.6 18.8 5.6 C18.8 9.4 16 12.2 12 12 Z" />
        <path d="M6.5 21 Q12 19.2 17.5 21" />
      </g>
    </CrayonSvg>
  );
}

/** 마이페이지 — 사람 */
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
