/**
 * Design tokens. Import from '@/theme' — never hard-code colors, radii or fonts in screens.
 *
 * Visual language: warm off-white canvas, white cards, deep forest-green hero surfaces,
 * lime accent, black pill CTAs, big numbers with muted decimals, floating pill tab bar.
 * Light theme only for now; add a dark palette here when needed.
 */
export const colors = {
  // Surfaces
  background: '#F3F4EF', // app canvas
  surface: '#FFFFFF', // cards
  surfaceMuted: '#ECEEE7', // inputs, chips, tiles on white
  border: '#E3E6DE',

  // Brand
  primary: '#0F3B2E', // deep forest green — hero cards, tab bar
  primaryPressed: '#0A2C22',
  primaryMuted: '#1E5241', // secondary elements on primary surfaces
  accent: '#C8F169', // lime — highlights, active states on dark
  accentSoft: '#EDF9D0',
  mint: '#DCEFE5', // gradient tops, soft fills
  ink: '#0B0D0C', // black pill buttons

  // Text
  text: '#101413',
  textMuted: '#6C736E',
  textSubtle: '#A3A9A4',
  textOnPrimary: '#FFFFFF',
  textOnPrimaryMuted: 'rgba(255,255,255,0.62)',
  textOnAccent: '#0F3B2E',

  // Feedback
  success: '#2E9D62',
  successSoft: '#E3F5EA',
  danger: '#E5484D',
  dangerSoft: '#FDECEC',
  warning: '#E09A1B',
  warningSoft: '#FDF3E1',
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28, xxxl: 40 } as const;

export const radius = { sm: 10, md: 16, lg: 24, xl: 32, pill: 999 } as const;

/** Manrope, loaded in app/_layout.tsx. Use weights via family (don't set fontWeight — breaks on Android). */
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
} as const;

export const typography = {
  display: { fontFamily: fonts.bold, fontSize: 38, lineHeight: 44, letterSpacing: -1.2, color: colors.text },
  title: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34, letterSpacing: -0.6, color: colors.text },
  heading: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, letterSpacing: -0.3, color: colors.text },
  subheading: { fontFamily: fonts.semibold, fontSize: 16, lineHeight: 22, color: colors.text },
  body: { fontFamily: fonts.medium, fontSize: 15, lineHeight: 22, color: colors.text },
  bodyStrong: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 22, color: colors.text },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.textMuted },
  /** Small uppercase labels ("TOTAL BALANCE", "TODAY"). */
  label: {
    fontFamily: fonts.semibold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.1,
    textTransform: 'uppercase' as const,
    color: colors.textMuted,
  },
} as const;

export type TypographyVariant = keyof typeof typography;

/** CSS-style shadows (supported on iOS/Android with the New Architecture, and on web). */
export const shadow = {
  card: { boxShadow: '0px 6px 16px rgba(15, 59, 46, 0.06)' },
  floating: { boxShadow: '0px 10px 24px rgba(0, 0, 0, 0.18)' },
} as const;

/** Space to leave at the bottom of tab screens so content clears the floating tab bar. */
export const TAB_BAR_CLEARANCE = 110;

export { motion } from './motion';
