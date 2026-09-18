import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let cached = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    cached = v;
  })
  .catch(() => {});

/**
 * True when the user turned on "Reduce Motion" (iOS) / "Remove animations" (Android).
 * Decorative animations must be skipped or cut to a simple fade when this is on.
 */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(cached);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      cached = v;
      setReduced(v);
    });
    return () => sub.remove();
  }, []);
  return reduced;
}
