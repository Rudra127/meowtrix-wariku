import { useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, StyleSheet, View } from 'react-native';
import { colors, themed } from '@/theme';

const palette = () => [colors.accent, colors.primary, '#F97316', '#3B6FD8', '#E5484D', '#7A5AF8', '#FFFFFF'];

type Piece = { x: number; delay: number; drift: number; spin: number; size: number; color: string; round: boolean };

/** One-shot confetti burst from the top of its container. Pointer-transparent. */
export function Confetti({ count = 40, duration = 2600 }: { count?: number; duration?: number }) {
  const { width, height } = Dimensions.get('window');
  const [pieces] = useState<Piece[]>(() =>
    Array.from({ length: count }, (_, i) => ({
      x: Math.random() * width,
      delay: Math.random() * 400,
      drift: (Math.random() - 0.5) * 160,
      spin: (Math.random() - 0.5) * 900,
      size: 6 + Math.random() * 7,
      color: palette()[i % 7],
      round: Math.random() > 0.6,
    })),
  );
  const [progress] = useState(() => pieces.map(() => new Animated.Value(0)));

  useEffect(() => {
    Animated.parallel(
      progress.map((p, i) =>
        Animated.timing(p, {
          toValue: 1,
          duration: duration - pieces[i].delay,
          delay: pieces[i].delay,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [progress, pieces, duration]);

  return (
    <View style={styles.layer}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -20,
            width: p.size,
            height: p.round ? p.size : p.size * 1.6,
            borderRadius: p.round ? p.size / 2 : 2,
            backgroundColor: p.color,
            opacity: progress[i].interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
            transform: [
              { translateY: progress[i].interpolate({ inputRange: [0, 1], outputRange: [0, height * 0.9] }) },
              { translateX: progress[i].interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
              { rotate: progress[i].interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: 50 },
}));
