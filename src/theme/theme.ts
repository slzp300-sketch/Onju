/**
 * theme.ts — 온주 "숲(Forest)" design tokens
 * ---------------------------------------------------------------------------
 * Single source of truth for the app's visual language. Works in BOTH:
 *   • React (web)         — use values directly in style objects / styled-components
 *   • React Native        — use values in StyleSheet; use `shadow.*` for elevation
 *
 * Philosophy: RICH FOREST. The app is a living grove — the user's tree grows
 * with their routines, and the palette grows with it (theme tiers unlock by
 * tree stage). Green is the primary signal; faith content uses GOLD (light)
 * so it never competes with the green primary. Gradients and organic shapes
 * are allowed where they evoke growth (hero, canopy, celebrations) — but UI
 * chrome stays calm: tinted surfaces, hairline lines, soft green-tinted
 * shadows, generous organic rounding.
 *
 * The runtime source of truth for colors is src/index.css (@theme tokens +
 * [data-theme] tier blocks). This file mirrors the base "grove" palette for
 * JS-side usage (canvas, confetti, SVG defaults).
 *
 * Fonts: rely on the platform SYSTEM font (SF Pro on iOS, Roboto on Android).
 */

export const color = {
  // ---- neutral ramp (green-tinted ink for text, gray ramp for forms) ----
  ink:      '#182420',   // primary text
  gray900:  '#24332b',
  gray800:  '#323232',
  gray700:  '#424242',   // icon default
  gray500:  '#5c6e63',   // secondary text
  gray400:  '#97a89d',   // tertiary text / placeholder / inactive icon
  gray300:  '#bdbdbd',   // disabled
  gray200:  '#dee8de',   // dividers, borders
  gray150:  '#dadada',
  gray100:  '#f0f5ee',   // subtle fill
  gray50:   '#f3f7f1',   // app canvas (warm-green tint)
  white:    '#ffffff',   // surfaces/cards

  // ---- the primary accent (interactive + growth) ----
  accent:      '#2f9e60', // forest green
  accentSoft:  '#e6f4ea',

  // ---- faith = light/gold (kept distinct from green primary) ----
  faith:     '#d9971e',
  faithSoft: '#faf0dc',

  // ---- status ----
  success: '#1f8a4c',
  warning: '#e07b27',    // streak flame, etc.
  danger:  '#d94f4f',

  // ---- semantic aliases ----
  bgCanvas:  '#ffffff',
  bgSubtle:  '#f3f7f1',
  textPrimary:   '#182420',
  textSecondary: '#5c6e63',
  textTertiary:  '#97a89d',
  border:    '#dee8de',
  divider:   '#dee8de',
} as const;

/** 숲 그라데이션 — CSS에서는 --gradient-* 변수 사용 */
export const gradient = {
  canopy: 'linear-gradient(135deg, #57b97c 0%, #2f9e60 100%)',
  hero: 'linear-gradient(180deg, #edf6ec 0%, #f9fbf7 100%)',
} as const;

/** 4pt spacing grid. Default screen gutter = space[4] (16). */
export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40,
} as const;

/** 유기적 라운딩 — 숲 컨셉에 맞춰 한 단계씩 둥글게 */
export const radius = {
  xs: 4,
  sm: 8,
  md: 12,   // chips, segmented
  lg: 16,   // buttons, list cards
  xl: 18,   // cards, sheets, modals
  pill: 999,
} as const;

export const font = {
  // System font: leave undefined in RN to inherit the platform face.
  family: undefined as string | undefined,
  webStack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif',
  size: {
    display: 32, title: 22, headline: 18, body: 16,
    callout: 15, label: 14, footnote: 13, caption: 12, micro: 10,
  },
  weight: { regular: '400', medium: '500', semibold: '600', bold: '700' } as const,
  tracking: { tight: -0.4, snug: -0.2, normal: 0, wide: 0.25 },
  lineHeight: { tight: 1.15, snug: 1.3, body: 1.5 },
} as const;

/**
 * Elevation — soft green-tinted shadows. Cards may carry a whisper of shadow
 * (the grove has depth), floating elements get more.
 */
export const shadow = {
  none: { web: 'none', native: {} },
  card: {
    web: '0 1px 3px rgba(24,52,38,0.07)',
    native: { shadowColor: '#183426', shadowOpacity: 0.07, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  },
  fab: {
    web: '0 6px 16px rgba(24,52,38,0.18)',
    native: { shadowColor: '#183426', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  },
  dialog: {
    web: '0 11px 24px rgba(24,52,38,0.16)',
    native: { shadowColor: '#183426', shadowOpacity: 0.16, shadowRadius: 16, shadowOffset: { width: 0, height: 11 }, elevation: 12 },
  },
} as const;

/** Native-feeling motion. Growth moments may use gentle springs. */
export const motion = {
  duration: { fast: 120, base: 200, slow: 300 },
  easing: { standard: 'cubic-bezier(0.2,0,0,1)', ios: 'cubic-bezier(0.25,0.1,0.25,1)' },
} as const;

export const theme = { color, gradient, space, radius, font, shadow, motion } as const;
export default theme;
