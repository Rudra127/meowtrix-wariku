/**
 * Motion tokens. Every animation in the app should use these so the whole product moves the
 * same way — quick, critically-damped springs (no wobble) for UI, a touch of overshoot only for
 * celebration moments. Modeled on iOS system motion.
 */
import { Easing } from 'react-native';

export const motion = {
  duration: { instant: 120, fast: 180, base: 260, slow: 380 },
  /** iOS-style ease-out: fast start, long gentle settle. */
  easeOut: Easing.bezier(0.2, 0.8, 0.2, 1),
  easeInOut: Easing.bezier(0.45, 0, 0.2, 1),
  spring: {
    /** Press feedback — snappy, zero overshoot. */
    press: { stiffness: 500, damping: 32, mass: 1 },
    /** Sheets, reveals, layout moves — smooth settle. */
    ui: { stiffness: 260, damping: 28, mass: 1 },
    /** Celebrations (badges, XP, medals) — a little playful overshoot. */
    pop: { stiffness: 300, damping: 16, mass: 1 },
  },
  /** Delay between siblings in a staggered entrance. */
  stagger: 45,
} as const;
