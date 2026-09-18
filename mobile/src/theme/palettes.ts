/**
 * Colour palettes. Both must have exactly the same keys — `darkPalette` is type-checked against
 * `lightPalette`. Components never import these directly; they read the live `colors` object
 * from '@/theme', which holds whichever palette is active.
 */
export const lightPalette = {
  // Surfaces
  background: '#F3F4EF', // app canvas
  surface: '#FFFFFF', // cards
  surfaceMuted: '#ECEEE7', // inputs, chips, tiles on white
  border: '#E3E6DE',

  // Brand
  primary: '#0F3B2E', // deep forest green — hero cards, tab bar
  primaryPressed: '#0A2C22',
  primaryMuted: '#1E5241', // secondary elements on primary surfaces
  brand: '#0F3B2E', // brand green used as a FOREGROUND (icons, links, focus borders) — see dark value
  accent: '#C8F169', // lime — highlights, active states on dark
  accentSoft: '#EDF9D0',
  mint: '#DCEFE5', // gradient tops, soft fills
  ink: '#0B0D0C', // high-contrast pill buttons (black in light mode)
  onInk: '#FFFFFF', // text/icons on `ink`

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

  // Effects
  shadowCard: 'rgba(15, 59, 46, 0.06)',
  shadowFloating: 'rgba(0, 0, 0, 0.18)',
  backdrop: 'rgba(8, 20, 16, 0.45)',
};

export type Palette = typeof lightPalette;

/**
 * Dark mode keeps the brand: a deep green-black canvas (not grey), slightly lifted forest-green
 * hero cards so they still read as "the brand", the same lime accent, and inverted pill buttons.
 */
export const darkPalette: Palette = {
  background: '#0A110E',
  surface: '#131B18',
  surfaceMuted: '#1B2521',
  border: '#24302B',

  primary: '#14432F',
  primaryPressed: '#103727',
  primaryMuted: '#215A42',
  brand: '#8FD46E',
  accent: '#C8F169',
  accentSoft: '#1F2D17',
  mint: '#183326',
  ink: '#EEF2EC',
  onInk: '#0A110E',

  text: '#EEF2EE',
  textMuted: '#98A29C',
  textSubtle: '#5F6A64',
  textOnPrimary: '#FFFFFF',
  textOnPrimaryMuted: 'rgba(255,255,255,0.64)',
  textOnAccent: '#0F3B2E',

  success: '#4CC38A',
  successSoft: '#12291E',
  danger: '#F2555A',
  dangerSoft: '#2D1617',
  warning: '#F0B232',
  warningSoft: '#2C2210',

  shadowCard: 'rgba(0, 0, 0, 0.32)',
  shadowFloating: 'rgba(0, 0, 0, 0.55)',
  backdrop: 'rgba(0, 0, 0, 0.6)',
};

export type ColorScheme = 'light' | 'dark';
export const palettes: Record<ColorScheme, Palette> = { light: lightPalette, dark: darkPalette };
