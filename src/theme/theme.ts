/**
 * theme.ts — Wireframe UI Kit design tokens
 * ---------------------------------------------------------------------------
 * Single source of truth for the app's visual language. Works in BOTH:
 *   • React (web)         — use values directly in style objects / styled-components
 *   • React Native        — use values in StyleSheet; use `shadow.*` for elevation
 *
 * Philosophy: grayscale + flat + minimal. Color is a SIGNAL, never decoration —
 * exactly ONE accent carries interactive/primary meaning. Everything else is
 * the neutral ramp. No gradients, no soft drop-shadows on cards (use hairline
 * borders instead).
 *
 * Fonts: rely on the platform SYSTEM font (SF Pro on iOS, Roboto on Android).
 * Do not bundle a custom UI font. (RN: omit fontFamily to get the system face.)
 */

export const color = {
  // ---- neutral ramp (the spine of the system) ----
  ink:      '#020202',   // primary text, dark fills, mono accent
  gray900:  '#212121',
  gray800:  '#323232',
  gray700:  '#424242',   // icon default
  gray500:  '#757575',   // secondary text
  gray400:  '#9e9e9e',   // tertiary text / placeholder / inactive icon
  gray300:  '#bdbdbd',   // hairline-strong, disabled
  gray200:  '#e0e0e0',   // dividers, borders, skeleton bars, segmented track
  gray150:  '#dadada',
  gray100:  '#f5f5f5',   // app canvas / subtle fill
  gray50:   '#fafafa',   // raised surface
  white:    '#ffffff',   // surfaces/cards

  // ---- the single accent (interactive + primary) ----
  // Brand blue. To go fully monochrome, set accent = ink.
  accent:      '#1f6bff',
  accentSoft:  '#eaf1ff', // tint background (selected chip, etc.)

  // ---- status (use sparingly) ----
  success: '#1f8a4c',
  warning: '#ff7a1a',    // streak flame, etc.
  danger:  '#e5484d',

  // ---- semantic aliases ----
  bgCanvas:  '#ffffff',
  bgSubtle:  '#f5f5f5',
  textPrimary:   '#020202',
  textSecondary: '#757575',
  textTertiary:  '#9e9e9e',
  border:    '#e0e0e0',
  divider:   '#e0e0e0',
} as const;

/** 4pt spacing grid. Default screen gutter = space[4] (16). */
export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40,
} as const;

export const radius = {
  xs: 2,    // skeleton bars
  sm: 4,    // small controls
  md: 8,    // chips, segmented
  lg: 12,   // buttons, list cards
  xl: 14,   // cards, sheets, modals
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
  // iOS-style heading tracking is slightly negative; labels slightly positive.
  tracking: { tight: -0.4, snug: -0.2, normal: 0, wide: 0.25 },
  lineHeight: { tight: 1.15, snug: 1.3, body: 1.5 },
} as const;

/**
 * Elevation. The system is mostly FLAT — prefer a 1px border over a shadow.
 * Reserve shadows for floating elements only: FAB, dialogs, bottom sheets.
 * `web` = CSS box-shadow string. `native` = RN style fragment (iOS + Android).
 */
export const shadow = {
  none: { web: 'none', native: {} },
  card: {
    web: '0 1px 2px rgba(0,0,0,0.06)',
    native: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  },
  fab: {
    web: '0 6px 16px rgba(0,0,0,0.22)',
    native: { shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  },
  dialog: {
    web: '0 11px 24px rgba(0,0,0,0.20)',
    native: { shadowColor: '#000', shadowOpacity: 0.20, shadowRadius: 16, shadowOffset: { width: 0, height: 11 }, elevation: 12 },
  },
} as const;

/** Native-feeling motion. No bounces / spring overshoot on UI chrome. */
export const motion = {
  duration: { fast: 120, base: 200, slow: 300 },
  easing: { standard: 'cubic-bezier(0.2,0,0,1)', ios: 'cubic-bezier(0.25,0.1,0.25,1)' },
} as const;

export const theme = { color, space, radius, font, shadow, motion } as const;
export default theme;
