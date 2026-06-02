/** 원형 도장 SVG — worn-ink 느낌 */
interface StampSealProps {
  label: string;
  sublabel?: string;
  color: string;
  size?: number;
}

export default function StampSeal({ label, sublabel, color, size = 200 }: StampSealProps) {
  const filterId = `worn-${color.replace('#', '')}`;
  const dots = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const r = 43;
    return { cx: 50 + r * Math.cos(angle), cy: 50 + r * Math.sin(angle) };
  });

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={{ filter: `drop-shadow(0 0 12px ${color}70)` }}
    >
      <defs>
        <filter id={filterId} x="-8%" y="-8%" width="116%" height="116%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.042"
            numOctaves="4"
            seed="9"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="2.8"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      {/* worn ink 링과 장식 */}
      <g filter={`url(#${filterId})`} opacity={0.91}>
        {/* 바깥 굵은 링 */}
        <circle cx="50" cy="50" r="47" fill="none" stroke={color} strokeWidth="4" />
        {/* 안쪽 링 */}
        <circle cx="50" cy="50" r="37" fill="none" stroke={color} strokeWidth="1.8" />
        {/* 링 위 점 장식 12개 */}
        {dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r="1.8" fill={color} />
        ))}
        {/* 하단 구분선 */}
        {sublabel && (
          <line x1="16" y1="66" x2="84" y2="66" stroke={color} strokeWidth="1.4" opacity="0.8" />
        )}
      </g>

      {/* 메인 텍스트 (필터 없이 선명하게) */}
      <text
        x="50"
        y={sublabel ? '52' : '54'}
        textAnchor="middle"
        dominantBaseline="middle"
        fill={color}
        fontSize={label.length <= 3 ? '24' : '18'}
        fontWeight="900"
        letterSpacing="-0.5"
        style={{ fontFamily: 'Pretendard, sans-serif' }}
        opacity="0.95"
      >
        {label}
      </text>

      {/* 서브 텍스트 */}
      {sublabel && (
        <text
          x="50"
          y="74"
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize="9"
          fontWeight="700"
          letterSpacing="0.5"
          style={{ fontFamily: 'Pretendard, sans-serif' }}
          opacity="0.85"
        >
          {sublabel}
        </text>
      )}
    </svg>
  );
}
