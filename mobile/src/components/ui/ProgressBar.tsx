import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '@/theme/motion';
import { colors, radius, themed } from '@/theme';

type Props = { value: number; color?: string; trackColor?: string; height?: number; style?: StyleProp<ViewStyle> };

/**
 * Animated horizontal progress (value 0–1). The fill slides in from the left on the native
 * thread (translateX inside a clipped track), so it stays smooth even when JS is busy and keeps
 * its rounded end at every value.
 */
export function ProgressBar({ value, color = colors.brand, trackColor = colors.surfaceMuted, height = 8, style }: Props) {
  const [width, setWidth] = useState(0);
  const [progress] = useState(() => new Animated.Value(0));
  const clamped = Math.min(1, Math.max(0, value || 0));

  useEffect(() => {
    Animated.timing(progress, { toValue: clamped, duration: 650, easing: motion.easeOut, useNativeDriver: true }).start();
  }, [clamped, progress]);

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-width, 0] });

  return (
    <View
      style={[styles.track, { height, backgroundColor: trackColor }, style]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      {width > 0 && (
        <Animated.View style={[styles.fill, { width, backgroundColor: color, transform: [{ translateX }] }]} />
      )}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  track: { borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
}));
