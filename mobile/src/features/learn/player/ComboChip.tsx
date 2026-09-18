import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, fonts, isDark, radius, spacing, themed } from '@/theme';

/** "🔥 x3" chip that pops each time the in-lesson combo grows. Hidden below 2. */
export function ComboChip({ combo }: { combo: number }) {
  const [pop] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (combo < 2) return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 14 }).start();
  }, [combo, pop]);

  if (combo < 2) return null;
  return (
    <Animated.View
      style={[
        styles.chip,
        { transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }], opacity: pop },
      ]}
      accessibilityLabel={`${combo} correct in a row`}
    >
      <Ionicons name="flame" size={15} color="#F97316" />
      <AppText variant="caption" color={colors.text} style={styles.text}>
        x{combo}
      </AppText>
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: isDark() ? 'rgba(249,115,22,0.16)' : '#FFF1E6',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  text: { fontFamily: fonts.extrabold },
}));
