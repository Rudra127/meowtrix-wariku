import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/ui';
import { colors, fonts, radius, shadow, spacing } from '@/theme';
import type { Lesson } from './sampleData';

type Props = { lesson: Lesson; offset: number; onPress: (lesson: Lesson) => void };

const SIZE = 72;

/** One circle on the learning path. Current lesson pulses; locked lessons shake when tapped. */
export function LessonNode({ lesson, offset, onPress }: Props) {
  const [pulse] = useState(() => new Animated.Value(0));
  const [shake] = useState(() => new Animated.Value(0));
  const [press] = useState(() => new Animated.Value(0));
  const isCurrent = lesson.status === 'current';

  useEffect(() => {
    if (!isCurrent) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [isCurrent, pulse]);

  const handlePress = () => {
    if (lesson.status === 'locked') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      Animated.sequence(
        [8, -8, 6, -6, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 50, useNativeDriver: true })),
      ).start();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }
    onPress(lesson);
  };

  const palette =
    lesson.status === 'done'
      ? { bg: colors.primary, fg: colors.accent, rim: colors.primaryPressed }
      : lesson.status === 'current'
        ? { bg: colors.accent, fg: colors.primary, rim: '#A7D24A' }
        : { bg: colors.surfaceMuted, fg: colors.textSubtle, rim: colors.border };

  const icon = lesson.status === 'done' ? 'checkmark' : lesson.status === 'locked' ? 'lock-closed' : lesson.icon;
  const translateY = press.interpolate({ inputRange: [0, 1], outputRange: [0, 5] });

  return (
    <View style={[styles.wrap, { transform: [{ translateX: offset }] }]}>
      {isCurrent && (
        <View style={[styles.tooltip, shadow.card]}>
          <AppText variant="label" color={colors.primary} style={styles.tooltipText}>
            Start
          </AppText>
          <View style={styles.tooltipArrow} />
        </View>
      )}
      <Animated.View style={{ transform: [{ translateX: shake }] }}>
        {isCurrent && (
          <Animated.View
            style={[
              styles.halo,
              {
                opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] }) }],
              },
            ]}
          />
        )}
        <Pressable
          onPress={handlePress}
          onPressIn={() => Animated.timing(press, { toValue: 1, duration: 80, useNativeDriver: true }).start()}
          onPressOut={() => Animated.timing(press, { toValue: 0, duration: 120, useNativeDriver: true }).start()}
          accessibilityRole="button"
          accessibilityLabel={`${lesson.title}, ${lesson.status}`}
        >
          {/* 3D "coin" look: rim underneath, face on top that sinks when pressed */}
          <View style={[styles.rim, { backgroundColor: palette.rim }]} />
          <Animated.View style={[styles.face, { backgroundColor: palette.bg, transform: [{ translateY }] }]}>
            <Ionicons name={icon} size={30} color={palette.fg} />
          </Animated.View>
        </Pressable>
      </Animated.View>
      <AppText variant="caption" center color={lesson.status === 'locked' ? colors.textSubtle : colors.text} style={styles.title} numberOfLines={2}>
        {lesson.title}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: 140, gap: spacing.sm },
  rim: { position: 'absolute', top: 6, width: SIZE, height: SIZE, borderRadius: SIZE / 2 },
  face: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: colors.accent },
  title: { fontFamily: fonts.semibold, marginTop: spacing.xs },
  tooltip: {
    backgroundColor: colors.surface,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    marginBottom: 2,
  },
  tooltipText: { fontFamily: fonts.extrabold },
  tooltipArrow: {
    position: 'absolute',
    bottom: -5,
    alignSelf: 'center',
    width: 10,
    height: 10,
    backgroundColor: colors.surface,
    transform: [{ rotate: '45deg' }],
  },
});
