import { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';
import { useReducedMotion } from './useReducedMotion';

/**
 * Returns a number that glides from its previous value to `target` (integers only).
 * The first render shows `target` immediately unless `fromZero` is set — counters only animate
 * when the value actually changes (e.g. the balance after adding a transaction).
 */
export function useAnimatedNumber(target: number, { duration = 700, fromZero = false } = {}) {
  const reduced = useReducedMotion();
  const [value] = useState(() => new Animated.Value(fromZero ? 0 : target));
  const [display, setDisplay] = useState(fromZero ? 0 : target);
  const first = useRef(true);

  useEffect(() => {
    const id = value.addListener(({ value: v }) => setDisplay(Math.round(v)));
    return () => value.removeListener(id);
  }, [value]);

  useEffect(() => {
    if (first.current && !fromZero) {
      first.current = false;
      return;
    }
    first.current = false;
    if (reduced) {
      value.setValue(target);
      return;
    }
    Animated.timing(value, { toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [target, duration, fromZero, reduced, value]);

  return display;
}
