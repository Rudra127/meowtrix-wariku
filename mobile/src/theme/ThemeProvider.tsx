/**
 * Light / dark mode.
 *
 *   <ThemeProvider> (app/_layout.tsx) resolves the scheme from the user's preference
 *   ("system" | "light" | "dark", saved on-device) and the OS setting, swaps the live palette,
 *   and re-renders every component that calls `useTheme()`.
 *
 * Rule: every screen/route component calls `useTheme()` (even if it only needs `colors` from
 * '@/theme'), so a theme switch re-renders the whole screen. Children created by that screen
 * re-render with it.
 */
import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform, useColorScheme } from 'react-native';
import type { ColorScheme } from './palettes';
import { applyScheme, colors } from './runtime';

export type ThemePreference = 'system' | ColorScheme;

const STORAGE_KEY = 'wariku.appearance';

type ThemeContextValue = {
  /** The scheme actually in use. */
  scheme: ColorScheme;
  isDark: boolean;
  /** What the user picked in Profile → Appearance. */
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
  colors: typeof colors;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

// SecureStore is native-only; on web fall back to localStorage so previews behave the same.
async function readPreference(): Promise<ThemePreference | null> {
  try {
    const raw = Platform.OS === 'web' ? globalThis.localStorage?.getItem(STORAGE_KEY) : await SecureStore.getItemAsync(STORAGE_KEY);
    return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : null;
  } catch {
    return null;
  }
}

async function writePreference(value: ThemePreference) {
  try {
    if (Platform.OS === 'web') globalThis.localStorage?.setItem(STORAGE_KEY, value);
    else await SecureStore.setItemAsync(STORAGE_KEY, value);
  } catch {
    // Non-fatal: the choice just won't survive a restart.
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    readPreference().then((saved) => saved && setPreferenceState(saved));
  }, []);

  const setPreference = useCallback((value: ThemePreference) => {
    setPreferenceState(value);
    writePreference(value);
  }, []);

  const scheme: ColorScheme = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  // Swap the palette BEFORE children render, so nothing paints with the previous colours.
  applyScheme(scheme);

  const value = useMemo(
    () => ({ scheme, isDark: scheme === 'dark', preference, setPreference, colors: { ...colors } }),
    [scheme, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>');
  return ctx;
}
