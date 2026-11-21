/**
 * ResiliFarm Mobile — design tokens.
 *
 * Single source of truth for colours, spacing, radii and typography so every
 * screen looks consistent. Keep it deliberately small: a farmer-facing app
 * should feel calm and uncluttered, not like an enterprise dashboard.
 */

export const colors = {
  /** Natural green — the ResiliFarm brand colour. */
  primary: '#1F7A4D',
  primaryDark: '#155A38',
  /** Very light green used for tinted surfaces and selected states. */
  primarySoft: '#E7F2EB',

  /** Warm off-white app background. */
  background: '#F6F7F4',
  /** White cards sitting on the background. */
  surface: '#FFFFFF',
  /** Subtle card / divider border. */
  border: '#E3E8E1',

  /** Main readable text. */
  text: '#22332B',
  /** Secondary / supporting text. */
  textMuted: '#6B7A70',
  /** Text on dark or coloured surfaces. */
  textOnPrimary: '#FFFFFF',

  /** Status colours (used for advice cards, alerts, badges). */
  success: '#1F7A4D',
  successSoft: '#E7F2EB',
  warning: '#B4602B',
  warningSoft: '#FBEEE3',
  danger: '#C0392B',
  dangerSoft: '#FBE9E7',
  info: '#2F6FBD',
  infoSoft: '#E8F0FA',

  /** Neutral grey used when data is unavailable. */
  neutral: '#8A968D',
  neutralSoft: '#EEF1EE',
} as const;

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Background + foreground colour pair for a given semantic tone. */
export const toneStyles: Record<StatusTone, { bg: string; fg: string }> = {
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: colors.warning },
  danger: { bg: colors.dangerSoft, fg: colors.danger },
  info: { bg: colors.infoSoft, fg: colors.info },
  neutral: { bg: colors.neutralSoft, fg: colors.neutral },
};

/** 4-pt spacing scale. Use these instead of hard-coded numbers. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 999,
} as const;

export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, lineHeight: 34 },
  title: { fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
  subtitle: { fontSize: 18, fontWeight: '600' as const, lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  bodyStrong: { fontSize: 16, fontWeight: '600' as const, lineHeight: 22 },
  small: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '500' as const, lineHeight: 16 },
} as const;

/** Minimum touch target size recommended by iOS/Android accessibility guides. */
export const touchTarget = 48;
