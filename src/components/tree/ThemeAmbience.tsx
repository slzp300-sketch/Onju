import { motion, useReducedMotion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { useThemeStore, THEME_TIERS, TIER_LEVEL } from '../../store/themeStore';

/**
 * 테마 앰비언스 — 티어가 오를수록 장식이 누적된다 (레벨은 themeStore의 TIER_LEVEL).
 * 애니메이션: 1 잎새 → 2 +꽃가루 → 3 +반딧불이 → 4 +낙엽
 * 정적 디자인: 2+ 풀숲, 3+ 숲 실루엣 (TierBackdrop)
 */
interface Palette {
  leaf: string;
  accent: string;
}

function LeafShape({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 20 C4 10 10 4 20 4 C20 14 14 20 4 20 Z" fill={color} />
      <path d="M6.5 17.5 L17 7" stroke="#fff" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
    </svg>
  );
}

/* 결정적 배치 — 렌더마다 흔들리지 않도록 고정 좌표 사용 */
const BUDS = [
  { left: '10%', top: '20%', size: 16, dur: 7, delay: 0 },
  { left: '80%', top: '32%', size: 13, dur: 8.5, delay: 1.4 },
  { left: '28%', top: '60%', size: 12, dur: 9.5, delay: 0.7 },
];
const POLLEN = [
  { left: '20%', size: 5, dur: 11, delay: 0 },
  { left: '58%', size: 4, dur: 13, delay: 3.5 },
  { left: '86%', size: 5, dur: 12, delay: 7 },
];
const FIREFLIES = [
  { left: '14%', top: '56%', size: 5, dur: 5.5, delay: 0 },
  { left: '68%', top: '38%', size: 4, dur: 6.5, delay: 1.8 },
  { left: '44%', top: '72%', size: 5, dur: 7, delay: 0.9 },
  { left: '88%', top: '62%', size: 4, dur: 6, delay: 2.6 },
];
const LEAVES = [
  { left: '8%', size: 17, dur: 11, delay: 0 },
  { left: '30%', size: 14, dur: 13.5, delay: 4 },
  { left: '52%', size: 16, dur: 12, delay: 8 },
  { left: '72%', size: 13, dur: 14.5, delay: 2 },
  { left: '90%', size: 15, dur: 12.5, delay: 6 },
];

/** 티어 정적 배경 — 2단계+ 풀숲, 3단계+ 숲 실루엣. offset으로 바닥 위치 조정 */
export function TierBackdrop({ level, palette, offset = '0px' }: { level: number; palette: Palette; offset?: string }) {
  if (level < 2) return null;
  return (
    <svg
      viewBox="0 0 390 90"
      className="absolute inset-x-0 w-full pointer-events-none"
      style={{ bottom: offset }}
      preserveAspectRatio="xMidYMax slice"
      aria-hidden
    >
      {/* 3단계+: 숲 실루엣 (언덕 + 나무) */}
      {level >= 3 && (
        <g fill={palette.accent}>
          <path d="M0 64 Q95 38 195 56 Q295 72 390 46 V90 H0 Z" opacity="0.08" />
          <path d="M58 62 l11 -26 l11 26 Z" opacity="0.1" />
          <rect x="67" y="62" width="4" height="8" rx="1.5" opacity="0.1" />
          <circle cx="318" cy="54" r="11" opacity="0.1" />
          <rect x="316" y="61" width="4" height="11" rx="2" opacity="0.1" />
          <path d="M150 68 l9 -20 l9 20 Z" opacity="0.07" />
        </g>
      )}
      {/* 4단계: 실루엣 나무에 맺힌 열매 */}
      {level >= 4 && (
        <g fill={palette.accent}>
          <circle cx="313" cy="51" r="2.4" opacity="0.4" />
          <circle cx="322" cy="56" r="2.4" opacity="0.35" />
          <circle cx="318" cy="47" r="2" opacity="0.3" />
          <circle cx="66" cy="50" r="2.2" opacity="0.35" />
          <circle cx="73" cy="56" r="2" opacity="0.3" />
        </g>
      )}
      {/* 2단계+: 풀숲 */}
      <g fill={palette.leaf}>
        <path d="M22 88 q2 -12 7 -16 q1 11 -4 17 Z" opacity="0.3" />
        <path d="M33 89 q-1 -9 -6 -12 q0 9 4 13 Z" opacity="0.26" />
        <path d="M196 90 q2 -10 6 -13 q1 9 -3 14 Z" opacity="0.24" />
        <path d="M286 89 q-1 -8 -5 -11 q0 8 3 12 Z" opacity="0.2" />
        <path d="M355 88 q2 -11 7 -15 q1 10 -4 16 Z" opacity="0.3" />
        <path d="M366 89 q-1 -8 -5 -11 q0 8 3 12 Z" opacity="0.26" />
      </g>
    </svg>
  );
}

/**
 * 앰비언스 입자 레이어 — 부모는 relative여야 하고, 레벨·팔레트를 명시적으로 받는다.
 * compact(미리보기)는 빠른 속도 + 위상 분산으로 여는 즉시 효과가 보인다.
 */
export function AmbienceLayer({ level, palette, compact = false }: { level: number; palette: Palette; compact?: boolean }) {
  const reduced = useReducedMotion();
  if (reduced || level < 1) return null;

  const k = compact ? 0.75 : 1; // 크기 배율
  const sp = compact ? 0.45 : 1; // 속도 배율 (미리보기는 2배 이상 빠르게)
  const travel = compact ? 300 : 980;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {/* 1단계+: 상단 앰비언트 글로우 — 티어가 오를수록 진해진다 */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(120% 55% at 50% -5%, ${palette.leaf}${level >= 4 ? '24' : level >= 2 ? '1c' : '14'} 0%, transparent 62%)`,
        }}
      />

      {/* 3단계+: 숲 사이 빛내림 */}
      {level >= 3 && [
        { left: '16%', delay: 0 },
        { left: '55%', delay: 2.4 },
      ].map((s, i) => (
        <motion.div
          key={`s${i}`}
          className="absolute"
          style={{
            left: s.left,
            top: '-12%',
            width: 70 * k,
            height: '75%',
            transform: 'rotate(16deg)',
            transformOrigin: 'top center',
            background: 'linear-gradient(180deg, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0) 75%)',
          }}
          animate={{ opacity: [0.05, 0.14, 0.05] }}
          transition={{ duration: 7 * sp, repeat: Infinity, ease: 'easeInOut', delay: -s.delay * sp }}
        />
      ))}

      {/* 4단계: 숨쉬는 노을빛 태양 */}
      {level >= 4 && (
        <motion.div
          className="absolute rounded-full"
          style={{
            top: -60 * k,
            right: -50 * k,
            width: 220 * k,
            height: 220 * k,
            background: 'radial-gradient(circle, rgba(255, 196, 110, 0.5) 0%, rgba(255, 196, 110, 0) 68%)',
          }}
          animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 6.5 * sp, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* 1단계: 떠다니는 잎새 */}
      {BUDS.map((b, i) => (
        <motion.div
          key={`b${i}`}
          className="absolute"
          style={{ left: b.left, top: b.top, opacity: compact ? 0.65 : 0.45 }}
          animate={{ y: [0, -14 * k, 0], x: [0, 8 * k, 0], rotate: [0, 14, 0] }}
          transition={{ duration: b.dur * sp, repeat: Infinity, ease: 'easeInOut', delay: -b.delay * sp }}
        >
          <LeafShape size={b.size * k} color={palette.leaf} />
        </motion.div>
      ))}

      {/* 2단계: 피어오르는 꽃가루 */}
      {level >= 2 && POLLEN.map((p, i) => (
        <motion.div
          key={`p${i}`}
          className="absolute rounded-full"
          style={{
            left: p.left,
            bottom: -8,
            width: p.size * k,
            height: p.size * k,
            backgroundColor: palette.leaf,
            boxShadow: `0 0 ${6 * k}px ${palette.leaf}`,
          }}
          animate={{ y: [0, -travel], x: [0, 10 * k, -6 * k, 8 * k], opacity: [0, 0.8, 0.8, 0] }}
          transition={{ duration: p.dur * sp, repeat: Infinity, ease: 'linear', delay: -p.delay * sp }}
        />
      ))}

      {/* 3단계: 반딧불이 */}
      {level >= 3 && FIREFLIES.map((f, i) => (
        <motion.div
          key={`f${i}`}
          className="absolute rounded-full"
          style={{
            left: f.left,
            top: f.top,
            width: f.size * k,
            height: f.size * k,
            backgroundColor: '#ffe08a',
            boxShadow: '0 0 8px 2px rgba(255, 220, 130, 0.75)',
          }}
          animate={{
            opacity: [0.1, 0.9, 0.25, 0.8, 0.1],
            x: [0, 12 * k, -8 * k, 0],
            y: [0, -10 * k, 6 * k, 0],
          }}
          transition={{ duration: f.dur * sp, repeat: Infinity, ease: 'easeInOut', delay: -f.delay * sp }}
        />
      ))}

      {/* 4단계: 흩날리는 낙엽 */}
      {level >= 4 && LEAVES.map((l, i) => (
        <motion.div
          key={`l${i}`}
          className="absolute"
          style={{ left: l.left, top: -24 }}
          animate={{
            y: [0, travel],
            x: [0, 22 * k, -12 * k, 16 * k],
            rotate: [0, 140, 300],
            opacity: [0, compact ? 0.85 : 0.7, compact ? 0.85 : 0.7, 0],
          }}
          transition={{ duration: l.dur * sp, repeat: Infinity, ease: 'linear', delay: -l.delay * sp }}
        >
          <LeafShape size={l.size * k} color={palette.accent} />
        </motion.div>
      ))}
    </div>
  );
}

/** 앱 전역 앰비언스 — 적용 중인 테마의 티어 효과(입자 + 배경 장식)를 화면 전체에 띄운다 */
export default function GlobalAmbience() {
  const theme = useThemeStore(s => s.theme);
  const { pathname } = useLocation();
  const tier = THEME_TIERS.find(t => t.id === theme) ?? THEME_TIERS[0];
  const level = TIER_LEVEL[tier.id];
  if (level < 1) return null;

  const palette = { leaf: tier.preview.leaf, accent: tier.preview.accent };
  // 인증/온보딩 화면은 자체 ForestBackdrop이 있어 바닥 장식 중복을 피한다
  const onAuthPage = ['/login', '/signup', '/onboarding', '/auth/callback'].includes(pathname);

  return (
    <div className="fixed inset-0 max-w-md mx-auto pointer-events-none" aria-hidden>
      {!onAuthPage && (
        <TierBackdrop level={level} palette={palette} offset="calc(5.5rem + env(safe-area-inset-bottom, 0px))" />
      )}
      <AmbienceLayer level={level} palette={palette} />
    </div>
  );
}
