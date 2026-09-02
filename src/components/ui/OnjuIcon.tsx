import { ONJU_ICONS } from '../../data/onjuIcons.generated';

const ICON_BY_EMOJI = new Map<string, (typeof ONJU_ICONS)[number]>(
  ONJU_ICONS.map(icon => [icon.emoji, icon]),
);

interface OnjuIconProps {
  emoji?: string | null;
  size?: number;
  className?: string;
  fallback?: string;
  alt?: string;
}

/**
 * 기존 유니코드 이모지 저장값을 온주 손그림 아이콘으로 표시한다.
 * 매핑되지 않은 값은 네이티브 이모지로 안전하게 폴백한다.
 */
export default function OnjuIcon({
  emoji,
  size = 24,
  className = '',
  fallback = '🌱',
  alt,
}: OnjuIconProps) {
  const value = emoji || fallback;
  const icon = ICON_BY_EMOJI.get(value);

  if (!icon) {
    return (
      <span
        className={`inline-flex items-center justify-center leading-none ${className}`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.82) }}
        role="img"
        aria-label={alt}
      >
        {value}
      </span>
    );
  }

  return (
    <img
      src={icon.src}
      width={size}
      height={size}
      className={`inline-block object-contain flex-shrink-0 ${className}`}
      alt={alt ?? icon.name}
      draggable={false}
      loading="lazy"
    />
  );
}
