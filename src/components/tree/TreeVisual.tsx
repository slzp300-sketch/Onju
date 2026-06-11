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

/**
 * 개인 나무 SVG — 단계(stage 0~4) × 건강도(healthy/dry/wilted).
 * 시든 상태는 잎 색 바램 + 잎 처짐(rotate) + 낙엽으로 표현.
 */
export default function TreeVisual({ stage, health, size = 110, animateGrowth = false }: TreeVisualProps) {
  const c = HEALTH_COLORS[health];
  const droop = health === 'wilted' ? 6 : health === 'dry' ? 2.5 : 0;

  return (
    <svg
      width={size}
      height={size * 0.9}
      viewBox="0 0 200 180"
      fill="none"
      role="img"
      aria-label={`나의 나무 — ${stage}단계, ${health === 'healthy' ? '싱싱함' : health === 'dry' ? '약간 시듦' : '시듦'}`}
    >
      {/* 땅 */}
      <ellipse cx="100" cy="164" rx="72" ry="11" fill="#e2ebe0" />
      <ellipse cx="100" cy="162" rx="52" ry="7" fill="#d3e2cf" />

      {/* 풀포기 — 나무 곁에 자라는 풀 */}
      <g opacity={health === 'wilted' ? 0.5 : 0.85}>
        <path d="M48 160 q1 -9 5 -12 q1 8 -2 13 Z" fill={c.leafC} />
        <path d="M55 161 q-1 -7 -5 -9 q0 7 3 10 Z" fill={c.leafA} />
        <path d="M148 159 q1 -8 5 -11 q1 8 -2 12 Z" fill={c.leafA} />
        <path d="M155 160 q-1 -6 -4 -8 q0 6 2 9 Z" fill={c.leafC} />
        {stage >= 2 && (
          <>
            <path d="M70 165 q1 -7 4 -9 q1 6 -1 10 Z" fill={c.leafB} />
            <path d="M132 164 q1 -6 4 -8 q0 6 -2 9 Z" fill={c.leafB} />
          </>
        )}
      </g>

      {/* 낙엽 (시듦 단계에서만) */}
      {health !== 'healthy' && stage >= 1 && (
        <g opacity={health === 'wilted' ? 0.9 : 0.45}>
          <ellipse cx="60" cy="160" rx="5" ry="2.4" fill={c.leafC} transform="rotate(-18 60 160)" />
          {health === 'wilted' && (
            <ellipse cx="140" cy="158" rx="5" ry="2.4" fill={c.leafB} transform="rotate(14 140 158)" />
          )}
        </g>
      )}

      {stage === 0 && (
        /* 씨앗: 흙 둔덕 + 씨앗 + 싹 트는 점 */
        <g>
          <path d="M78 162 Q100 142 122 162 Z" fill="#c9b08a" />
          <ellipse cx="100" cy="154" rx="9" ry="11" fill="#8a6a4a" />
          <path d="M100 144 q-1 -8 5 -11" stroke={c.leafB} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="106" cy="132" r="3.2" fill={c.leafA} />
        </g>
      )}

      {stage === 1 && (
        /* 새싹: 짧은 줄기 + 잎 2장 */
        <g transform={`rotate(${droop} 100 162)`}>
          <path d="M100 162 Q99 138 100 122" stroke={c.leafB} strokeWidth="4" strokeLinecap="round" />
          <motion.g
            initial={animateGrowth ? { scale: 0 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.1 }}
            style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
          >
            <path d="M100 130 Q78 122 76 102 Q98 106 100 128 Z" fill={c.leafA} transform={`rotate(${droop * 1.5} 100 130)`} />
            <path d="M100 124 Q122 114 126 94 Q102 98 100 122 Z" fill={c.leafB} transform={`rotate(${-droop} 100 124)`} />
          </motion.g>
        </g>
      )}

      {stage === 2 && (
        /* 묘목: 줄기 + 잎뭉치 1 */
        <g>
          <path d="M100 162 Q98 130 100 104" stroke={c.trunk} strokeWidth="6" strokeLinecap="round" />
          <g transform={`rotate(${droop} 100 104)`}>
            <Canopy cx={100} cy={88} r={26} fill={c.leafB} delay={0.05} animate={animateGrowth} />
            <Canopy cx={86} cy={96} r={15} fill={c.leafA} delay={0.15} animate={animateGrowth} />
            <Canopy cx={114} cy={96} r={14} fill={c.leafC} delay={0.22} animate={animateGrowth} />
          </g>
        </g>
      )}

      {stage === 3 && (
        /* 어린나무: 가지 2 + 잎뭉치 3 */
        <g>
          <path d="M100 162 Q98 120 100 92" stroke={c.trunk} strokeWidth="8" strokeLinecap="round" />
          <path d="M100 124 Q84 114 76 102" stroke={c.trunk} strokeWidth="5" strokeLinecap="round" />
          <path d="M100 116 Q118 106 126 96" stroke={c.trunk} strokeWidth="5" strokeLinecap="round" />
          <g transform={`rotate(${droop} 100 100)`}>
            <Canopy cx={74} cy={92} r={18} fill={c.leafA} delay={0.05} animate={animateGrowth} />
            <Canopy cx={128} cy={86} r={19} fill={c.leafC} delay={0.13} animate={animateGrowth} />
            <Canopy cx={100} cy={66} r={28} fill={c.leafB} delay={0.21} animate={animateGrowth} />
          </g>
        </g>
      )}

      {stage === 4 && (
        /* 큰나무: 굵은 줄기 + 풍성한 잎 5 + 열매(싱싱할 때만) */
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
    </svg>
  );
}
