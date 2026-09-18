import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated } from 'react-native';
import { colors } from '@/theme';

/** Flame icon that gently flickers while a streak is alive (grey when it's 0). */
export function StreakFlame({ active, size = 16 }: { active: boolean; size?: number }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, t]);
  return (
    <Animated.View
      style={{
        transform: [
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '4deg'] }) },
        ],
      }}
    >
      <Ionicons name="flame" size={size} color={active ? '#F97316' : colors.textSubtle} />
    </Animated.View>
  );
}
