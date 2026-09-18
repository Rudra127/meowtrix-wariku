/**
 * Design tokens. Import from '@/theme' — never hard-code colors, radii or fonts in screens.
 *
 * Visual language: warm off-white canvas, white cards, deep forest-green hero surfaces,
 * lime accent, black pill CTAs, big numbers with muted decimals, floating pill tab bar.
 * Light + dark palettes live in ./palettes.ts; the active one is swapped at runtime (./runtime.ts).
 */
import { colors, themed } from './runtime';

export { colors, themed, applyScheme, currentScheme, isDark } from './runtime';
export type { ColorScheme, Palette } from './palettes';

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

export const typography = themed(() => ({
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
}));

export type TypographyVariant = keyof typeof typography;

/** CSS-style shadows (supported on iOS/Android with the New Architecture, and on web). */
export const shadow = themed(() => ({
  card: { boxShadow: `0px 6px 16px ${colors.shadowCard}` },
  floating: { boxShadow: `0px 10px 24px ${colors.shadowFloating}` },
}));

/** Space to leave at the bottom of tab screens so content clears the floating tab bar. */
export const TAB_BAR_CLEARANCE = 110;

export { motion } from './motion';
export { ThemeProvider, useTheme } from './ThemeProvider';
