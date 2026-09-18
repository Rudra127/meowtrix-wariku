import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Animated, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { motion } from '@/theme/motion';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** Style for the outer Pressable (e.g. `{ flex: 1 }` when the inner view should stretch). */
  containerStyle?: StyleProp<ViewStyle>;
  scaleTo?: number;
  haptic?: boolean;
};

/** Pressable that springs down slightly on touch and gives a light haptic tick. Base for all tappables. */
export function PressableScale({
  children,
  style,
  containerStyle,
  scaleTo = 0.97,
  haptic = true,
  onPressIn,
  onPressOut,
  onPress,
  ...rest
}: Props) {
  const [scale] = useState(() => new Animated.Value(1));
  const springTo = (toValue: number) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, ...motion.spring.press }).start();

  return (
    <Pressable
      style={containerStyle}
      onPressIn={(e) => {
        springTo(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        springTo(1);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (haptic) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children as React.ReactNode}</Animated.View>
    </Pressable>
  );
}
