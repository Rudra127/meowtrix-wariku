import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors } from '@/theme';

/** Gradient "AI" orb. `pulse` adds a soft breathing halo (empty state). */
export function AiOrb({ size = 32, pulse = false }: { size?: number; pulse?: boolean }) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, t]);

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {pulse && (
        <Animated.View
          style={[
            styles.halo,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              opacity: t.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.1] }),
              transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [1.1, 1.45] }) }],
            },
          ]}
        />
      )}
      <LinearGradient
        colors={[colors.accent, '#6FD39B', colors.primary]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons name="sparkles" size={size * 0.45} color={colors.textOnPrimary} />
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({ halo: { position: 'absolute', backgroundColor: colors.accent } });
