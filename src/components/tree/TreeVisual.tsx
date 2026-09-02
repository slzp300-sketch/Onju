import { motion } from 'framer-motion';
import type { TreeStage, TreeHealth } from '../../utils/treeGrowth';
import { HEALTH_COLORS } from './treePalette';

interface TreeVisualProps {
  stage: TreeStage;
  health: TreeHealth;
  size?: number;
  /** true면 잎뭉치가 자라나는 스프링 연출 (단계 상승 모달 등) */
  animateGrowth?: boolean;
}

/** 잎뭉치 — 바닥 기준으로 자라나는 blob */
function Canopy({
  cx, cy, r, fill, delay, animate,
}: { cx: number; cy: number; r: number; fill: string; delay: number; animate: boolean }) {
  return (
    <motion.circle
      cx={cx}
      cy={cy}
      r={r}
      fill={fill}
      initial={animate ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, delay }}
      style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
    />
  );
}

/** 낱장 잎 — stage 2(가지가 뻗어나다)의 개별 잎사귀 */
function Leaf({
  cx, cy, rot, fill, delay, animate,
}: { cx: number; cy: number; rot: number; fill: string; delay: number; animate: boolean }) {
  return (
    <motion.ellipse
      cx={cx}
      cy={cy}
      rx="9.5"
      ry="5.5"
      fill={fill}
      transform={`rotate(${rot} ${cx} ${cy})`}
      initial={animate ? { scale: 0, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 18, delay }}
      style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
    />
  );
}

/**
 * 개인 나무 SVG — 성장 여정 6단계(stage 0~5) × 건강도(healthy/dry/wilted).
 * 크레파스 그림체: 노이즈 변위(가장자리) + 그레인 합성(칠 압력)으로 손그림 질감.
 * 0 새싹의 시작 → 1 싹이 자라다 → 2 가지가 뻗어나다 → 3 나무가 되다
 * → 4 풍성한 나무 → 5 나무와 함께 걷다 (벤치·새)
 */
export default function TreeVisual({ stage, health, size = 110, animateGrowth = false }: TreeVisualProps) {
  const c = HEALTH_COLORS[health];
  const droop = health === 'wilted' ? 6 : health === 'dry' ? 2.5 : 0;
  const grown = stage >= 3; // 수관형 나무 여부

  return (
    <svg
      width={size}
      height={size * 0.9}
      viewBox="0 0 200 180"
      fill="none"
      role="img"
      aria-label={`나의 나무 — ${stage}단계, ${health === 'healthy' ? '싱싱함' : health === 'dry' ? '약간 시듦' : '시듦'}`}
    >
      <defs>
        {/* 크레파스 질감 — 가장자리 흔들림 + 칠 압력 그레인 */}
        <filter id="tree-crayon" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.06 0.1" numOctaves="3" seed="5" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="4" result="d" />
          <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="11" result="g" />
          <feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.8 0" result="ga" />
          <feComposite in="d" in2="ga" operator="arithmetic" k1="0.45" k2="0.75" k3="0" k4="0" />
        </filter>
      </defs>
      <g filter="url(#tree-crayon)">

      {/* 나이테 링 — 브랜드 시그니처, 나무 뒤에 은은하게 */}
      <g stroke="#d9c8a6" fill="none" opacity="0.4">
        <circle cx="100" cy="96" r="42" strokeWidth="2.2" />
        <circle cx="100" cy="96" r="62" strokeWidth="1.8" opacity="0.7" />
        <circle cx="100" cy="96" r="82" strokeWidth="1.5" opacity="0.45" />
      </g>

      {/* 언덕 — stage 0은 흙, 이후엔 풀 언덕 */}
      {stage === 0 ? (
        <>
          <path d="M18 176 Q100 138 182 176 Z" fill="#a58455" opacity="0.75" />
          <path d="M42 172 Q100 148 158 172 Z" fill="#8a6a4a" opacity="0.5" />
        </>
      ) : (
        <>
          <path d="M14 176 Q100 130 186 176 Z" fill={c.leafC} opacity="0.75" />
          <path d="M38 172 Q100 140 162 172 Z" fill={c.leafB} opacity="0.4" />
        </>
      )}

      {/* 풀포기 */}
      {stage >= 1 && (
        <g opacity={health === 'wilted' ? 0.5 : 0.85}>
          <path d="M44 162 q1 -9 5 -12 q1 8 -2 13 Z" fill={c.leafB} />
          <path d="M152 160 q1 -8 5 -11 q1 8 -2 12 Z" fill={c.leafA} />
          {stage >= 3 && (
            <>
              <path d="M66 168 q1 -7 4 -9 q1 6 -1 10 Z" fill={c.leafB} />
              <path d="M136 167 q1 -6 4 -8 q0 6 -2 9 Z" fill={c.leafA} />
            </>
          )}
        </g>
      )}

      {/* 낙엽 (시듦 단계에서만) */}
      {health !== 'healthy' && stage >= 1 && (
        <g opacity={health === 'wilted' ? 0.9 : 0.45}>
          <ellipse cx="58" cy="162" rx="5" ry="2.4" fill={c.leafC} transform="rotate(-18 58 162)" />
          {health === 'wilted' && (
            <ellipse cx="142" cy="160" rx="5" ry="2.4" fill={c.leafB} transform="rotate(14 142 160)" />
          )}
        </g>
      )}

      {stage === 0 && (
        /* 새싹의 시작: 흙 위로 막 올라온 작은 새싹 */
        <g transform={`rotate(${droop} 100 156)`}>
          <path d="M100 156 Q99 144 100 134" stroke={c.leafB} strokeWidth="3.5" strokeLinecap="round" />
          <path d="M100 140 Q86 134 84 120 Q99 124 100 138 Z" fill={c.leafA} />
          <path d="M100 136 Q113 129 116 116 Q101 120 100 134 Z" fill={c.leafB} />
        </g>
      )}

      {stage === 1 && (
        /* 싹이 자라다: 한 뼘 자란 두 잎 새싹 */
        <g transform={`rotate(${droop} 100 160)`}>
          <path d="M100 160 Q99 134 100 116" stroke={c.leafB} strokeWidth="4.5" strokeLinecap="round" />
          <motion.g
            initial={animateGrowth ? { scale: 0 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
            style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
          >
            <path d="M100 126 Q74 116 72 92 Q98 98 100 124 Z" fill={c.leafA} transform={`rotate(${droop * 1.5} 100 126)`} />
            <path d="M100 119 Q126 107 130 84 Q102 90 100 117 Z" fill={c.leafB} transform={`rotate(${-droop} 100 119)`} />
          </motion.g>
        </g>
      )}

      {stage === 2 && (
        /* 가지가 뻗어나다: 얇은 줄기·가지 + 낱장 잎들 */
        <g>
          <path d="M100 160 Q98 122 100 96" stroke={c.trunk} strokeWidth="5" strokeLinecap="round" />
          <path d="M100 126 Q84 116 74 104" stroke={c.trunk} strokeWidth="3.4" strokeLinecap="round" />
          <path d="M100 116 Q118 104 130 92" stroke={c.trunk} strokeWidth="3.4" strokeLinecap="round" />
          <g transform={`rotate(${droop} 100 100)`}>
            <Leaf cx={72} cy={98} rot={-38} fill={c.leafA} delay={0.05} animate={animateGrowth} />
            <Leaf cx={84} cy={86} rot={-64} fill={c.leafC} delay={0.1} animate={animateGrowth} />
            <Leaf cx={100} cy={78} rot={-90} fill={c.leafB} delay={0.15} animate={animateGrowth} />
            <Leaf cx={116} cy={82} rot={-116} fill={c.leafA} delay={0.2} animate={animateGrowth} />
            <Leaf cx={132} cy={88} rot={-142} fill={c.leafB} delay={0.25} animate={animateGrowth} />
            <Leaf cx={124} cy={102} rot={-30} fill={c.leafC} delay={0.3} animate={animateGrowth} />
          </g>
        </g>
      )}

      {stage === 3 && (
        /* 나무가 되다: 단단한 줄기 + 수관 */
        <g>
          <path d="M100 162 Q98 122 100 94" stroke={c.trunk} strokeWidth="8" strokeLinecap="round" />
          <path d="M100 126 Q86 116 78 106" stroke={c.trunk} strokeWidth="4.5" strokeLinecap="round" />
          <path d="M100 118 Q116 108 124 98" stroke={c.trunk} strokeWidth="4.5" strokeLinecap="round" />
          <g transform={`rotate(${droop} 100 100)`}>
            <Canopy cx={76} cy={92} r={19} fill={c.leafA} delay={0.05} animate={animateGrowth} />
            <Canopy cx={126} cy={88} r={20} fill={c.leafC} delay={0.13} animate={animateGrowth} />
            <Canopy cx={100} cy={68} r={28} fill={c.leafB} delay={0.21} animate={animateGrowth} />
          </g>
        </g>
      )}

      {(stage === 4 || stage === 5) && (
        /* 풍성한 나무 / 나무와 함께 걷다: 굵은 줄기 + 풍성한 잎 + 열매 */
        <g>
          <path d="M97 162 Q95 116 99 84 M103 162 Q105 116 101 84" stroke={c.trunk} strokeWidth="7" strokeLinecap="round" />
          <path d="M100 118 Q78 106 68 92" stroke={c.trunk} strokeWidth="5.5" strokeLinecap="round" />
          <path d="M100 108 Q124 96 134 84" stroke={c.trunk} strokeWidth="5.5" strokeLinecap="round" />
          <g transform={`rotate(${droop} 100 90)`}>
            <Canopy cx={62} cy={82} r={20} fill={c.leafA} delay={0.05} animate={animateGrowth} />
            <Canopy cx={138} cy={76} r={21} fill={c.leafC} delay={0.12} animate={animateGrowth} />
            <Canopy cx={82} cy={54} r={22} fill={c.leafB} delay={0.19} animate={animateGrowth} />
            <Canopy cx={120} cy={50} r={23} fill={c.leafA} delay={0.26} animate={animateGrowth} />
            <Canopy cx={100} cy={38} r={24} fill={c.leafB} delay={0.33} animate={animateGrowth} />
            {health === 'healthy' && (
              <g>
                <circle cx="84" cy="62" r="4" fill={c.fruit} />
                <circle cx="122" cy="58" r="4" fill={c.fruit} />
                <circle cx="103" cy="44" r="4" fill={c.fruit} />
              </g>
            )}
          </g>
        </g>
      )}

      {stage === 5 && (
        /* 나무와 함께 걷다: 그늘의 벤치 + 하늘의 새 */
        <g>
          {/* 벤치 */}
          <g stroke={c.trunk} strokeWidth="3" strokeLinecap="round" opacity="0.9">
            <path d="M138 148 H166" />
            <path d="M138 138 H166" />
            <path d="M141 148 V158" />
            <path d="M163 148 V158" />
          </g>
          {/* 새 */}
          <path d="M158 26 q4 -5 8 0 q4 -5 8 0" stroke={c.trunk} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7" />
        </g>
      )}

      {/* 자란 나무의 그림자 보정 */}
      {grown && <ellipse cx="100" cy="164" rx="52" ry="6" fill={c.leafB} opacity="0.15" />}
      </g>
    </svg>
  );
}
