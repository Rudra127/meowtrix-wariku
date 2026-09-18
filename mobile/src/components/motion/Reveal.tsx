import { useEffect, useState } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { motion } from '@/theme';

type Props = {
  children: React.ReactNode;
  /** Position in a staggered group — each step adds `motion.stagger` ms of delay. */
  index?: number;
  delay?: number;
  /** Distance to rise from, in dp. */
  offset?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Fades + rises its children in once, on mount — the subtle "content settles into place" entrance
 * used across screens. Native-driven; respects Reduce Motion (plain fade, no movement).
 */
export function Reveal({ children, index = 0, delay = 0, offset = 14, style }: Props) {
  const reduced = useReducedMotion();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const wait = delay + Math.min(index, 10) * motion.stagger;
    const anim = reduced
      ? Animated.timing(progress, { toValue: 1, duration: motion.duration.fast, delay: wait, useNativeDriver: true })
      : Animated.spring(progress, { toValue: 1, delay: wait, useNativeDriver: true, ...motion.spring.ui });
    anim.start();
    return () => anim.stop();
  }, [progress, index, delay, reduced]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progress,
          transform: reduced ? [] : [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [offset, 0] }) }],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
