/**
 * First-run questionnaire: experience level + main goal. Answers are saved with
 * PUT /users/me/onboarding and personalise Learn (path), Money (focus card) and Ask AI
 * (suggestions + answer tone). The root layout shows this until `user.isOnboarded`.
 */
import { useAuth } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { usersApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import type { Goal, Level } from '@/api/types';
import { useApi } from '@/api/useApi';
import { AppText, Badge, Button, FormError, IconButton, Screen } from '@/components/ui';
import { BrandMark } from '@/features/auth/BrandMark';
import { getErrorMessage } from '@/lib/errors';
import { colors, radius, spacing } from '@/theme';
import { GOAL_OPTIONS, LEVEL_OPTIONS, goalPlan, levelOption } from './options';
import { OptionCard } from './OptionCard';

type Step = 0 | 1 | 2 | 3; // welcome, level, goal, plan

/** The device's IANA zone, or undefined if the platform won't say (the backend then keeps its default). */
const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
};

export function OnboardingScreen() {
  const api = useApi();
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [level, setLevel] = useState<Level | null>(null);
  const [goal, setGoal] = useState<Goal | null>(null);
  const [enter] = useState(() => new Animated.Value(1));

  // Slide + fade each step in.
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [step, enter]);

  const finish = useMutation({
    // The device timezone rides along silently: the backend needs it to decide which calendar month
    // a transaction belongs to (a 00:30 IST purchase is the previous day in UTC).
    mutationFn: (answers: { level: Level; goal: Goal }) =>
      usersApi.completeOnboarding(api, { ...answers, timezone: deviceTimezone() }),
    onSuccess: ({ user }) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Updating the cached user flips the root guard from (onboarding) to (tabs).
      queryClient.setQueryData([...queryKeys.me, userId], user);
    },
  });

  const pick = <T,>(setter: (v: T) => void, value: T, next: Step) => {
    setter(value);
    setTimeout(() => setStep(next), 260); // let the selection animation register first
  };

  const back = () => setStep((s) => (s > 0 ? ((s - 1) as Step) : s));

  const animatedStyle = {
    flex: 1,
    opacity: enter,
    transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [28, 0] }) }],
  };

  return (
    <Screen contentStyle={styles.content}>
      {step > 0 && (
        <View style={styles.topBar}>
          <IconButton icon="arrow-back" tone="surface" size={40} onPress={back} accessibilityLabel="Back" />
          <View style={styles.progress}>
            {[1, 2, 3].map((i) => (
              <View key={i} style={[styles.progressSeg, i <= step && styles.progressSegActive]} />
            ))}
          </View>
          <AppText variant="caption" style={styles.stepCount}>
            {step}/3
          </AppText>
        </View>
      )}

      <Animated.View style={animatedStyle}>
        {step === 0 && (
          <View style={styles.welcome}>
            <View style={styles.welcomeHero}>
              <View style={[styles.ring, { width: 300, height: 300, top: -120, right: -100 }]} />
              <View style={[styles.ring, { width: 180, height: 180, top: -40, right: -30 }]} />
              <BrandMark size={56} />
              <AppText variant="display" color={colors.textOnPrimary}>
                Let’s make Wariku{'\n'}
                <AppText variant="display" color={colors.accent}>
                  yours.
                </AppText>
              </AppText>
              <AppText variant="body" color={colors.textOnPrimaryMuted}>
                Two quick questions and we’ll tailor your lessons, your money dashboard and your AI coach.
              </AppText>
            </View>
            <View style={styles.welcomePoints}>
              {[
                { icon: 'school' as const, text: 'A lesson path at your level' },
                { icon: 'wallet' as const, text: 'A dashboard built around your goal' },
                { icon: 'sparkles' as const, text: 'AI answers in your language' },
              ].map((p) => (
                <View key={p.text} style={styles.point}>
                  <View style={styles.pointIcon}>
                    <Ionicons name={p.icon} size={16} color={colors.primary} />
                  </View>
                  <AppText variant="bodyStrong">{p.text}</AppText>
                </View>
              ))}
            </View>
            <View style={styles.spacer} />
            <Button title="Let’s go" onPress={() => setStep(1)} icon={<Ionicons name="arrow-forward" size={18} color={colors.textOnPrimary} />} />
            <Button
              title="Skip for now"
              variant="ghost"
              size="sm"
              loading={finish.isPending}
              onPress={() => finish.mutate({ level: 'beginner', goal: 'learning' })}
            />
            <FormError message={finish.error ? getErrorMessage(finish.error) : null} />
          </View>
        )}

        {step === 1 && (
          <View style={styles.question}>
            <AppText variant="label">Question 1</AppText>
            <AppText variant="title">How would you rate your money skills?</AppText>
            <AppText variant="body" color={colors.textMuted}>
              We’ll pitch lessons and AI answers at the right level. You can change this later.
            </AppText>
            <View style={styles.options}>
              {LEVEL_OPTIONS.map((o) => (
                <OptionCard key={o.value} {...o} selected={level === o.value} onPress={() => pick(setLevel, o.value, 2)} />
              ))}
            </View>
          </View>
        )}

        {step === 2 && (
          <View style={styles.question}>
            <AppText variant="label">Question 2</AppText>
            <AppText variant="title">What’s your main goal right now?</AppText>
            <AppText variant="body" color={colors.textMuted}>
              Your dashboard will focus on this first.
            </AppText>
            <View style={styles.options}>
              {GOAL_OPTIONS.map((o) => (
                <OptionCard
                  key={o.value}
                  icon={o.icon}
                  label={o.label}
                  description={o.description}
                  selected={goal === o.value}
                  onPress={() => pick(setGoal, o.value, 3)}
                />
              ))}
            </View>
          </View>
        )}

        {step === 3 && level && goal && (
          <PlanSummary
            level={level}
            goal={goal}
            loading={finish.isPending}
            error={finish.error ? getErrorMessage(finish.error) : null}
            onStart={() => finish.mutate({ level, goal })}
          />
        )}
      </Animated.View>
    </Screen>
  );
}

function PlanSummary({ level, goal, loading, error, onStart }: { level: Level; goal: Goal; loading: boolean; error: string | null; onStart: () => void }) {
  const plan = goalPlan(goal);
  const lvl = levelOption(level);
  return (
    <View style={styles.question}>
      <AppText variant="label">Your plan is ready</AppText>
      <View style={styles.planCard}>
        <View style={[styles.ring, { width: 240, height: 240, top: -100, right: -90 }]} />
        <View style={styles.planBadges}>
          <Badge tone="accent" icon={lvl.icon} label={lvl.label} />
          <Badge tone="glass" icon={plan.icon} label={plan.label} />
        </View>
        <AppText variant="title" color={colors.textOnPrimary}>
          {plan.headline}
        </AppText>
        <View style={styles.planPoints}>
          {plan.planPoints.map((p) => (
            <View key={p} style={styles.planPoint}>
              <View style={styles.check}>
                <Ionicons name="checkmark" size={14} color={colors.primary} />
              </View>
              <AppText variant="body" color={colors.textOnPrimary} style={styles.flex}>
                {p}
              </AppText>
            </View>
          ))}
        </View>
      </View>
      <AppText variant="caption" center>
        Change your level or goal anytime in Profile.
      </AppText>
      <View style={styles.spacer} />
      <FormError message={error} />
      <Button title="Start my journey" loading={loading} onPress={onStart} icon={<Ionicons name="sparkles" size={18} color={colors.textOnPrimary} />} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  progress: { flex: 1, flexDirection: 'row', gap: 6 },
  progressSeg: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.surfaceMuted },
  progressSegActive: { backgroundColor: colors.primary },
  stepCount: { minWidth: 28, textAlign: 'right' },
  welcome: { flex: 1, gap: spacing.lg },
  welcomeHero: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    gap: spacing.lg,
    overflow: 'hidden',
  },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(200,241,105,0.18)' },
  welcomePoints: { gap: spacing.md, paddingHorizontal: spacing.xs },
  point: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pointIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  spacer: { flex: 1, minHeight: spacing.lg },
  question: { flex: 1, gap: spacing.md, paddingTop: spacing.sm },
  options: { gap: spacing.md, marginTop: spacing.sm },
  planCard: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.lg, overflow: 'hidden' },
  planBadges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  planPoints: { gap: spacing.md },
  planPoint: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
});
