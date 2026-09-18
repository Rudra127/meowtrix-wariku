import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '@/theme';

type Props = { value: number; color?: string; trackColor?: string; height?: number; style?: StyleProp<ViewStyle> };

/** Animated horizontal progress (value 0–1). */
export function ProgressBar({ value, color = colors.primary, trackColor = colors.surfaceMuted, height = 8, style }: Props) {
  const [progress] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(progress, { toValue: Math.min(1, Math.max(0, value)), duration: 700, useNativeDriver: false }).start();
  }, [value, progress]);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[styles.track, { height, backgroundColor: trackColor }, style]} accessibilityRole="progressbar">
      <Animated.View style={[styles.fill, { width, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
});
