/** 원형 도장 SVG — 크레파스로 그린 손도장 느낌 */
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
      style={{ filter: `drop-shadow(0 2px 6px ${color}45)` }}
    >
      <defs>
        <filter id={filterId} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.05 0.08"
            numOctaves="3"
            seed="9"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="3.6"
            xChannelSelector="R"
            yChannelSelector="G"
            result="d"
          />
          {/* 크레파스 칠 압력 그레인 */}
          <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" seed="13" result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.8 0" result="ga" />
          <feComposite in="d" in2="ga" operator="arithmetic" k1="0.45" k2="0.75" k3="0" k4="0" />
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

      {/* 메인 텍스트 (공백 기준 두 줄 또는 한 줄) */}
      {label.includes(' ') ? (() => {
        const spaceIdx = label.indexOf(' ');
        const line1 = label.slice(0, spaceIdx);
        const line2 = label.slice(spaceIdx + 1);
        const baseY = sublabel ? 44 : 46;
        const fs = '16';
        return (
          <>
            <text x="50" y={baseY} textAnchor="middle" dominantBaseline="middle"
              fill={color} fontSize={fs} fontWeight="900" letterSpacing="-0.3"
              style={{ fontFamily: 'Jua, system-ui, sans-serif' }} opacity="0.95">{line1}</text>
            <text x="50" y={baseY + 17} textAnchor="middle" dominantBaseline="middle"
              fill={color} fontSize={fs} fontWeight="900" letterSpacing="-0.3"
              style={{ fontFamily: 'Jua, system-ui, sans-serif' }} opacity="0.95">{line2}</text>
          </>
        );
      })() : (
        <text
          x="50"
          y={sublabel ? '52' : '54'}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={color}
          fontSize={label.length <= 3 ? '24' : '18'}
          fontWeight="900"
          letterSpacing="-0.5"
          style={{ fontFamily: 'Jua, system-ui, sans-serif' }}
          opacity="0.95"
        >
          {label}
        </text>
      )}

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
          style={{ fontFamily: 'Jua, system-ui, sans-serif' }}
          opacity="0.85"
        >
          {sublabel}
        </text>
      )}
    </svg>
  );
}
