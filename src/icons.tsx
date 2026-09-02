/**
 * 온주 아이콘 세트 — lucide 호환 별칭 모듈.
 * 모든 화면은 lucide-react 대신 이 모듈에서 아이콘을 가져온다.
 * 브랜드 정체성 아이콘(연속일 잎, 목표 나이테, 십자가, 건강 잎, 책, 통계, 새싹, 카메라)은
 * 여기서 손그림 커스텀으로 오버라이드하고, 나머지는 lucide를 그대로 통과시킨다
 * (전역 svg.lucide 크레파스 필터가 일괄 적용됨).
 */
/* eslint-disable react-refresh/only-export-components */
export * from 'lucide-react';

interface OnjuIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  strokeWidth?: number | string;
}

function OnjuSvg({
  size = 24, strokeWidth = 2, className = '', children, ...rest
}: OnjuIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`lucide ${className}`}
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  );
}

/** 연속일 — 잎맥이 있는 잎 물방울 (lucide Flame 대체) */
export function Flame(props: OnjuIconProps) {
  return (
    <OnjuSvg {...props}>
      <path d="M12 3 C7.5 8 5.5 11.5 5.5 15 a6.5 6.5 0 0 0 13 0 C18.5 11.5 16.5 8 12 3 Z" />
      <path d="M12 9 V18" />
      <path d="M12 13.5 Q10 12.5 9 11" />
      <path d="M12 15.5 Q14 14.5 15 13" />
    </OnjuSvg>
  );
}

/** 목표 — 나이테 속 새싹 (lucide Target 대체) */
export function Target(props: OnjuIconProps) {
  return (
    <OnjuSvg {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5.6" />
      <path d="M12 14.8 V11.6" />
      <path d="M12 12.4 C12 10.6 10.8 9.4 9.2 9.4 C9.2 11.2 10.4 12.5 12 12.4 Z" />
      <path d="M12 11.4 C12 9.9 13 8.8 14.7 8.8 C14.7 10.4 13.6 11.6 12 11.4 Z" />
    </OnjuSvg>
  );
}

/** 신앙 — 언덕 위 십자가 (lucide Church 대체) */
export function Church(props: OnjuIconProps) {
  return (
    <OnjuSvg {...props}>
      <path d="M12 4 V16" />
      <path d="M8 8 H16" />
      <path d="M5 20 Q12 16.5 19 20" />
    </OnjuSvg>
  );
}

/** 건강/개인 습관 — 잎 한 장 (lucide Dumbbell 대체) */
export function Dumbbell(props: OnjuIconProps) {
  return (
    <OnjuSvg {...props}>
      <path d="M5.5 18.5 C5.5 10.5 11 5.5 18.5 5.5 C18.5 13 13.5 18.5 5.5 18.5 Z" />
      <path d="M7.5 16.5 L16 7.5" />
    </OnjuSvg>
  );
}

/** 말씀/기록 — 펼친 책 (lucide BookOpen 대체) */
export function BookOpen(props: OnjuIconProps) {
  return (
    <OnjuSvg {...props}>
      <path d="M12 6 C10 4.4 7 4 4 4.4 V18.6 C7 18.2 10 18.6 12 20 C14 18.6 17 18.2 20 18.6 V4.4 C17 4 14 4.4 12 6 Z" />
      <path d="M12 6 V20" />
    </OnjuSvg>
  );
}

/** 통계 — 자라는 막대 + 잎 (lucide BarChart3 대체) */
export function BarChart3(props: OnjuIconProps) {
  return (
    <OnjuSvg {...props}>
      <path d="M6 20 V14" />
      <path d="M11 20 V9" />
      <path d="M16 20 V12" />
      <path d="M16 12 C16 9.8 17.4 8.4 19.6 8.4 C19.6 10.6 18.2 12.1 16 12 Z" />
      <path d="M4 20.5 H20" />
    </OnjuSvg>
  );
}

/** 새싹 (lucide Sprout 대체) */
export function Sprout(props: OnjuIconProps) {
  return (
    <OnjuSvg {...props}>
      <path d="M12 20.5 V12" />
      <path d="M12 14.5 C12 10.2 9.2 7.6 5.4 7.6 C5.4 11.8 8.2 14.7 12 14.5 Z" />
      <path d="M12 12 C12 8.6 14.4 6 18.6 6 C18.6 9.6 16 12.2 12 12 Z" />
      <path d="M7 20.5 Q12 19 17 20.5" />
    </OnjuSvg>
  );
}

/** 인증 카메라 — 잎이 앉은 카메라 (lucide Camera 대체) */
export function Camera(props: OnjuIconProps) {
  return (
    <OnjuSvg {...props}>
      <path d="M4.5 7.5 H8 L9.6 4.8 H14.4 L16 7.5 H19.5 A1.8 1.8 0 0 1 21.3 9.3 V17.7 A1.8 1.8 0 0 1 19.5 19.5 H4.5 A1.8 1.8 0 0 1 2.7 17.7 V9.3 A1.8 1.8 0 0 1 4.5 7.5 Z" />
      <circle cx="12" cy="13.2" r="3.4" />
      <path d="M18.6 10.2 C18.6 9 19.4 8.2 20.6 8.2" strokeWidth="1.2" opacity="0.8" />
    </OnjuSvg>
  );
}
