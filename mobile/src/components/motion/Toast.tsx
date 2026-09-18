import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { AppText } from '@/components/ui/AppText';
import type { IconName } from '@/components/ui/IconButton';
import { colors, isDark, motion, radius, shadow, spacing, themed } from '@/theme';

type Props = { message: string | null; icon?: IconName; bottom?: number };

/**
 * Floating confirmation pill ("Transaction added"). Springs up from below and fades away —
 * keeps rendering the last message while it animates out so the text doesn't vanish early.
 */
export function Toast({ message, icon = 'checkmark-circle', bottom = 110 }: Props) {
  const [progress] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState<string | null>(message);
  // Show a new message immediately (derived during render); clear it only after fading out.
  if (message && message !== shown) setShown(message);

  useEffect(() => {
    if (message) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      Animated.spring(progress, { toValue: 1, useNativeDriver: true, ...motion.spring.ui }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: motion.duration.fast, easing: motion.easeOut, useNativeDriver: true }).start(
        ({ finished }) => finished && setShown(null),
      );
    }
  }, [message, progress]);

  if (!shown) return null;
  return (
    <Animated.View
      accessibilityLiveRegion="polite"
      style={[
        styles.toast,
        shadow.floating,
        {
          bottom,
          opacity: progress,
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
          ],
        },
      ]}
    >
      <Ionicons name={icon} size={18} color={isDark() ? colors.success : colors.accent} />
      <AppText variant="caption" color={colors.onInk}>
        {shown}
      </AppText>
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.ink,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    pointerEvents: 'none',
  },
}));
