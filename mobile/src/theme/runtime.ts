/**
 * Live theme state. `colors` is ONE object whose values are swapped in place when the scheme
 * changes, so `colors.text` read during render is always current.
 *
 * Module-level style objects capture values at creation, so wrap them in `themed()`: it rebuilds
 * lazily the first time it's read after a scheme change.
 *
 *   const styles = themed(() => StyleSheet.create({ card: { backgroundColor: colors.surface } }));
 */
import { palettes, type ColorScheme, type Palette } from './palettes';

export const colors: Palette = { ...palettes.light };

let version = 0;
let current: ColorScheme = 'light';

export const currentScheme = () => current;
export const isDark = () => current === 'dark';

/** Swaps the active palette. Components re-render via ThemeProvider (see useTheme). */
export function applyScheme(scheme: ColorScheme) {
  if (scheme === current) return;
  current = scheme;
  Object.assign(colors, palettes[scheme]);
  version += 1;
}

/** Lazily (re)built object that always reflects the active scheme. Same type as the factory's result. */
export function themed<T extends object>(factory: () => T): T {
  let cache: T | undefined;
  let builtFor = -1;
  const get = (): T => {
    if (builtFor !== version || cache === undefined) {
      cache = factory();
      builtFor = version;
    }
    return cache;
  };
  return new Proxy({} as T, {
    get: (_t, key) => (get() as Record<PropertyKey, unknown>)[key],
    has: (_t, key) => key in get(),
    ownKeys: () => Reflect.ownKeys(get()),
    getOwnPropertyDescriptor: (_t, key) => {
      const d = Reflect.getOwnPropertyDescriptor(get(), key);
      return d ? { ...d, configurable: true } : undefined;
    },
  });
}
