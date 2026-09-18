/**
 * Design tokens. Import from '@/theme' — never hard-code colors/spacing in screens.
 * Light theme only for now; add a dark palette here when needed.
 */
export const colors = {
  primary: '#16A34A',
  primaryPressed: '#15803D',
  primarySoft: '#E8F7EE',
  text: '#0F172A',
  textMuted: '#64748B',
  textOnPrimary: '#FFFFFF',
  background: '#FFFFFF',
  surface: '#F8FAFC',
  border: '#E2E8F0',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  success: '#16A34A',
  warning: '#D97706',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const typography = {
  title: { fontSize: 28, fontWeight: '700' as const, color: colors.text },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 16, color: colors.text },
  caption: { fontSize: 13, color: colors.textMuted },
} as const;
