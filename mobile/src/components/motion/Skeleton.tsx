import { useEffect, useState } from 'react';
import { Animated, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { colors, radius as radii } from '@/theme';

type Props = { width?: DimensionValue; height?: number; radius?: number; tone?: 'light' | 'dark'; style?: StyleProp<ViewStyle> };

/** Placeholder block that gently breathes while content loads. Feels faster than a spinner. */
export function Skeleton({ width = '100%', height = 14, radius = radii.sm, tone = 'light', style }: Props) {
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 750, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);
  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: tone === 'dark' ? colors.primaryMuted : colors.surfaceMuted,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.55] }),
        },
        style,
      ]}
    />
  );
}
