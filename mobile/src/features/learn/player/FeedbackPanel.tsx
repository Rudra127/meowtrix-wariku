import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import type { AnswerCheck, PublicExercise } from '@/api/types';
import { AppText, Button } from '@/components/ui';
import { colors, motion, radius, spacing, themed } from '@/theme';
import { formatAnswer } from './exerciseMeta';

type Props = {
  check: AnswerCheck;
  exercise: PublicExercise;
  title: string;
  isLast: boolean;
  loading: boolean;
  onContinue: () => void;
};

/** Slides up after "Check": green praise or red correction + explanation, then Continue. */
export function FeedbackPanel({ check, exercise, title, isLast, loading, onContinue }: Props) {
  const ok = check.isCorrect;
  const [slide] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, ...(ok ? motion.spring.pop : motion.spring.ui) }).start();
  }, [slide, ok]);

  return (
    <Animated.View
      style={[
        styles.panel,
        { backgroundColor: ok ? colors.successSoft : colors.dangerSoft },
        {
          opacity: slide,
          transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [120, 0] }) }],
        },
      ]}
      accessibilityLiveRegion="polite"
    >
      <View style={styles.head}>
        <Animated.View
          style={[
            styles.icon,
            { backgroundColor: ok ? colors.success : colors.danger },
            { transform: [{ scale: slide.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }] },
          ]}
        >
          <Ionicons name={ok ? 'checkmark' : 'close'} size={22} color={colors.textOnPrimary} />
        </Animated.View>
        <AppText variant="heading" color={ok ? colors.success : colors.danger}>
          {title}
        </AppText>
      </View>
      {!ok && (
        <AppText variant="bodyStrong" color={colors.text}>
          Answer: <AppText variant="body">{formatAnswer(check.correctAnswer, exercise)}</AppText>
        </AppText>
      )}
      {!!check.explanation && (
        <AppText variant="caption" color={colors.text} numberOfLines={4}>
          {check.explanation}
        </AppText>
      )}
      <Button
        title={isLast ? 'Finish lesson' : 'Continue'}
        variant={ok ? 'brand' : 'primary'}
        loading={loading}
        onPress={onContinue}
        icon={<Ionicons name={isLast ? 'checkmark-done' : 'arrow-forward'} size={18} color={colors.textOnPrimary} />}
      />
    </Animated.View>
  );
}

const styles = themed(() => StyleSheet.create({
  panel: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.md,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
}));
