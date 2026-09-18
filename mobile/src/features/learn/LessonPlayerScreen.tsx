/**
 * Full-screen lesson player (route: app/lesson/[slug].tsx).
 *
 *   play    → one exercise at a time: pick → "Check" (POST …/check, instant feedback, answer
 *             locks) → Continue. Correct streaks build an in-lesson combo.
 *   submit  → POST /learn/lessons/:slug/submit re-grades every answer server-side; that result
 *             is the source of truth for XP, progress and streaks.
 *   results → celebration/encouragement, XP + streak, per-question review, retry.
 *
 * Pieces live in ./player (inputs, results, helpers).
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AnswerCheck, LessonAnswer } from '@/api/types';
import { AppText, Badge, Button, FormError, IconButton, ProgressBar, Sheet } from '@/components/ui';
import { KEYBOARD_BEHAVIOR } from '@/hooks/useKeyboardVisible';
import { getErrorMessage } from '@/lib/errors';
import { colors, fonts, radius, spacing, themed, useTheme } from '@/theme';
import { nudge, praise } from './gamification';
import { ComboChip } from './player/ComboChip';
import { EXERCISE_META, fillMissing, isAnswered } from './player/exerciseMeta';
import { ExerciseInput } from './player/ExerciseInput';
import { FeedbackPanel } from './player/FeedbackPanel';
import { ResultsView } from './player/ResultsView';
import { useCheckAnswer, useLearningPath, useLessonDetail, useSubmitLesson } from './useLearn';

type Props = { slug: string };

export function LessonPlayerScreen({ slug }: Props) {
  useTheme(); // re-render on light/dark switch
  const router = useRouter();
  const detail = useLessonDetail(slug);
  const submit = useSubmitLesson(slug);
  const check = useCheckAnswer(slug);
  // Stats before this lesson — lets the results screen detect level-ups / new badges.
  const statsBefore = useLearningPath().data?.stats;
  const [startStats] = useState(() => statsBefore);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<LessonAnswer[]>([]);
  const [checks, setChecks] = useState<(AnswerCheck | undefined)[]>([]);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [shake] = useState(() => new Animated.Value(0));
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [enter] = useState(() => new Animated.Value(1));

  const lesson = detail.data?.lesson;
  const exercises = lesson?.exercises ?? [];
  const total = exercises.length;
  const current = exercises[index];
  const isLast = index === total - 1;
  const answered = isAnswered(current, answers[index]);
  const feedback = checks[index];
  const answeredCount = exercises.filter((ex, i) => isAnswered(ex, answers[i])).length;

  // Slide each question in.
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index, enter]);

  const setAnswer = (value: LessonAnswer) =>
    setAnswers((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });

  const runShake = () =>
    Animated.sequence(
      [10, -10, 7, -7, 3, 0].map((toValue) => Animated.timing(shake, { toValue, duration: 55, useNativeDriver: true })),
    ).start();

  /** Step 1: grade this answer for instant feedback (nothing is stored yet). */
  const checkCurrent = () => {
    if (!answered || check.isPending || feedback) return;
    check.mutate(
      { index, answer: answers[index] ?? null },
      {
        onSuccess: (res) => {
          setChecks((prev) => {
            const next = prev.slice();
            next[index] = res;
            return next;
          });
          if (res.isCorrect) {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            const nextCombo = combo + 1;
            setCombo(nextCombo);
            setBestCombo((b) => Math.max(b, nextCombo));
          } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
            setCombo(0);
            runShake();
          }
        },
      },
    );
  };

  /** Step 2: next question, or submit the whole lesson for official grading. */
  const advance = () => {
    if (submit.isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isLast) submit.mutate(fillMissing(answers, total));
    else setIndex((i) => i + 1);
  };

  const retry = () => {
    submit.reset();
    check.reset();
    setAnswers([]);
    setChecks([]);
    setCombo(0);
    setBestCombo(0);
    setIndex(0);
  };

  const leave = () => {
    setConfirmLeave(false);
    router.back();
  };
  // Only ask for confirmation if there's progress to lose.
  const requestClose = () => (answeredCount > 0 && !submit.data ? setConfirmLeave(true) : router.back());

  // -- loading / error -------------------------------------------------------------------
  if (detail.isPending && !detail.data) {
    return (
      <Shell>
        <TopBar progress={0} onClose={router.back} />
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.brand} />
          <AppText variant="caption">Loading lesson…</AppText>
        </View>
      </Shell>
    );
  }
  if (detail.isError || !lesson) {
    return (
      <Shell>
        <TopBar progress={0} onClose={router.back} />
        <View style={styles.center}>
          <View style={styles.errorIcon}>
            <Ionicons name={detail.error && 'status' in detail.error && detail.error.status === 403 ? 'lock-closed' : 'cloud-offline-outline'} size={28} color={colors.danger} />
          </View>
          <AppText variant="heading" center>
            Couldn’t open this lesson
          </AppText>
          <AppText variant="body" center color={colors.textMuted}>
            {getErrorMessage(detail.error)}
          </AppText>
          <View style={styles.errorActions}>
            <Button title="Back" variant="secondary" onPress={router.back} />
            <Button title="Retry" onPress={() => detail.refetch()} />
          </View>
        </View>
      </Shell>
    );
  }

  // -- results ---------------------------------------------------------------------------
  if (submit.data) {
    return (
      <ResultsView
        result={submit.data}
        exercises={exercises}
        answers={answers}
        lessonTitle={lesson.title}
        bestCombo={bestCombo}
        statsBefore={startStats}
        onRetry={retry}
        onDone={router.back}
        onPractice={() => router.replace(`/practice/${slug}`)}
      />
    );
  }

  // -- play ------------------------------------------------------------------------------
  const meta = EXERCISE_META[current.type];
  const animatedStyle = {
    opacity: enter,
    transform: [{ translateX: enter.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
  };

  return (
    <Shell>
      <TopBar progress={(index + (feedback ? 1 : 0)) / total} onClose={requestClose} counter={`${index + 1}/${total}`} combo={combo} />
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.question, animatedStyle]}>
            <View style={styles.metaRow}>
              <Badge icon={meta.icon} label={meta.label} tone="accent" />
              <AppText variant="caption" numberOfLines={1} style={styles.lessonName}>
                {lesson.title}
              </AppText>
            </View>
            <AppText variant="title">{current.prompt}</AppText>
            <Animated.View style={{ transform: [{ translateX: shake }] }}>
              <ExerciseInput
                key={index}
                exercise={current}
                value={answers[index] ?? null}
                onChange={setAnswer}
                onSubmit={checkCurrent}
                feedback={feedback}
              />
            </Animated.View>
          </Animated.View>
        </ScrollView>

        {feedback ? (
          <FeedbackPanel
            check={feedback}
            exercise={current}
            title={feedback.isCorrect ? (combo >= 3 ? `${combo} in a row!` : praise(index)) : nudge(index)}
            isLast={isLast}
            loading={submit.isPending}
            onContinue={advance}
          />
        ) : (
          <View style={styles.footer}>
            <FormError message={check.isError ? getErrorMessage(check.error) : submit.isError ? getErrorMessage(submit.error) : null} />
            <Button title="Check" onPress={checkCurrent} disabled={!answered} loading={check.isPending} />
          </View>
        )}
        {feedback && submit.isError && (
          <View style={styles.footer}>
            <FormError message={getErrorMessage(submit.error)} />
          </View>
        )}
      </KeyboardAvoidingView>

      <Sheet visible={confirmLeave} onClose={() => setConfirmLeave(false)} title="Leave this lesson?">
        <AppText variant="body" color={colors.textMuted}>
          You’ve answered {answeredCount} of {total}. Your answers won’t be saved if you leave now.
        </AppText>
        <Button title="Keep learning" onPress={() => setConfirmLeave(false)} />
        <Button title="Leave lesson" variant="danger" onPress={leave} />
      </Sheet>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      {children}
    </SafeAreaView>
  );
}

function TopBar({ progress, onClose, counter, combo = 0 }: { progress: number; onClose: () => void; counter?: string; combo?: number }) {
  return (
    <View style={styles.topBar}>
      <IconButton icon="close" tone="surface" size={40} onPress={onClose} accessibilityLabel="Close lesson" />
      <ProgressBar value={progress} height={10} color={combo >= 3 ? colors.success : colors.brand} style={styles.flex} />
      <ComboChip combo={combo} />
      {counter ? (
        <View style={styles.counter}>
          <AppText variant="caption" color={colors.text} style={styles.bold}>
            {counter}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  bold: { fontFamily: fonts.bold },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  counter: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  body: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xl },
  question: { gap: spacing.xl },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  lessonName: { flex: 1, textAlign: 'right' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xxl },
  errorIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  errorActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
}));
