/**
 * AI practice player (route: app/practice/[slug].tsx).
 *
 *   generating → POST /learn/lessons/:slug/practice asks DeepSeek for fresh questions on this
 *                lesson's topic. Slow (a real LLM round-trip), so it gets its own loading state.
 *   play       → identical loop to the lesson player: pick → Check → Continue, with combos.
 *   results    → XP earned, streak, and a per-question review.
 *
 * Deliberately reuses ./player pieces (ExerciseInput, FeedbackPanel, ComboChip) so practice
 * looks and feels exactly like a normal lesson. Practice never completes a lesson or unlocks
 * the next one — it only adds a small XP bonus and keeps the streak alive.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AnswerCheck, LessonAnswer } from '@/api/types';
import { AppText, Badge, Button, Card, FormError, IconButton, ProgressBar, Sheet } from '@/components/ui';
import { KEYBOARD_BEHAVIOR } from '@/hooks/useKeyboardVisible';
import { getErrorMessage } from '@/lib/errors';
import { colors, fonts, radius, spacing, themed, useTheme } from '@/theme';
import { nudge, praise } from './gamification';
import { ComboChip } from './player/ComboChip';
import { EXERCISE_META, fillMissing, formatAnswer, isAnswered } from './player/exerciseMeta';
import { ExerciseInput } from './player/ExerciseInput';
import { FeedbackPanel } from './player/FeedbackPanel';
import { useCheckPracticeAnswer, useGeneratePractice, useSubmitPractice } from './useLearn';

type Props = { slug: string };

const QUESTION_COUNT = 4;

export function PracticePlayerScreen({ slug }: Props) {
  useTheme(); // re-render on light/dark switch
  const router = useRouter();
  const generate = useGeneratePractice(slug);
  const check = useCheckPracticeAnswer();
  const submit = useSubmitPractice();

  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<LessonAnswer[]>([]);
  const [checks, setChecks] = useState<(AnswerCheck | undefined)[]>([]);
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));
  const [enter] = useState(() => new Animated.Value(1));

  // Kick off generation once on mount. A ref guard keeps React 19's double-invoked effects in
  // dev from burning two LLM calls (and two rate-limit slots).
  const requested = useRef(false);
  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    generate.mutate(QUESTION_COUNT);
  }, [generate]);

  const round = generate.data;
  const exercises = round?.exercises ?? [];
  const total = exercises.length;
  const current = exercises[index];
  const isLast = index === total - 1;
  const answered = isAnswered(current, answers[index]);
  const feedback = checks[index];
  const answeredCount = exercises.filter((ex, i) => isAnswered(ex, answers[i])).length;

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

  const checkCurrent = () => {
    if (!answered || check.isPending || feedback || !round) return;
    check.mutate(
      { sessionId: round.sessionId, index, answer: answers[index] ?? null },
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

  const advance = () => {
    if (submit.isPending || !round) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (isLast) submit.mutate({ sessionId: round.sessionId, answers: fillMissing(answers, total) });
    else setIndex((i) => i + 1);
  };

  /** A new round means a fresh LLM call and a brand-new session. */
  const anotherRound = () => {
    submit.reset();
    check.reset();
    setAnswers([]);
    setChecks([]);
    setCombo(0);
    setBestCombo(0);
    setIndex(0);
    generate.mutate(QUESTION_COUNT);
  };

  const requestClose = () => (answeredCount > 0 && !submit.data ? setConfirmLeave(true) : router.back());

  // -- generating ------------------------------------------------------------------------
  if (generate.isPending) {
    return (
      <Shell>
        <TopBar progress={0} onClose={router.back} />
        <View style={styles.center}>
          <View style={styles.sparkle}>
            <Ionicons name="sparkles" size={30} color={colors.brand} />
          </View>
          <AppText variant="heading" center>
            Writing fresh questions…
          </AppText>
          <AppText variant="body" center color={colors.textMuted}>
            Our AI coach is putting together a few new questions on this topic. This takes a few seconds.
          </AppText>
          <ActivityIndicator color={colors.brand} style={styles.spinner} />
        </View>
      </Shell>
    );
  }

  // -- generation failed -----------------------------------------------------------------
  if (generate.isError || !round || total === 0) {
    const status = generate.error && 'status' in generate.error ? generate.error.status : undefined;
    return (
      <Shell>
        <TopBar progress={0} onClose={router.back} />
        <View style={styles.center}>
          <View style={styles.errorIcon}>
            <Ionicons name={status === 429 ? 'hourglass-outline' : 'sparkles-outline'} size={28} color={colors.danger} />
          </View>
          <AppText variant="heading" center>
            Couldn&apos;t create practice
          </AppText>
          <AppText variant="body" center color={colors.textMuted}>
            {generate.isError ? getErrorMessage(generate.error) : 'No questions came back. Please try again.'}
          </AppText>
          <View style={styles.errorActions}>
            <Button title="Back" variant="secondary" onPress={router.back} />
            <Button title="Try again" onPress={() => generate.mutate(QUESTION_COUNT)} />
          </View>
        </View>
      </Shell>
    );
  }

  // -- results ---------------------------------------------------------------------------
  if (submit.data) {
    const res = submit.data;
    const perfect = res.correct === res.total;
    return (
      <Shell>
        <ScrollView contentContainerStyle={styles.resultsContent} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={[styles.ring, { width: 260, height: 260, top: -110, right: -90 }]} />
            <View style={[styles.ring, { width: 160, height: 160, top: -40, right: -30 }]} />
            <View style={styles.medal}>
              <Ionicons name={perfect ? 'sparkles' : 'school'} size={30} color={colors.brand} />
            </View>
            <AppText variant="label" color={colors.textOnPrimaryMuted}>
              AI practice · {round.lesson.title}
            </AppText>
            <AppText variant="title" color={colors.textOnPrimary}>
              {perfect ? 'Flawless round!' : 'Practice done'}
            </AppText>
            <AppText variant="body" color={colors.textOnPrimaryMuted}>
              You got {res.correct} of {res.total} right ({Math.round(res.score * 100)}%).
            </AppText>
            <View style={styles.heroBadges}>
              <Badge tone="accent" icon="flash" label={`+${res.xpEarned} XP`} />
              <Badge tone="glass" icon="flame" label={`${res.stats.streakDays}-day streak`} />
              {bestCombo >= 3 && <Badge tone="glass" icon="trending-up" label={`Best combo x${bestCombo}`} />}
            </View>
          </View>

          <Card tone="muted" style={styles.note}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textMuted} />
            <AppText variant="caption" style={styles.flex}>
              Practice tops up your XP and streak. Lesson progress only changes when you complete the lesson itself.
            </AppText>
          </Card>

          <AppText variant="subheading" style={styles.bold}>
            Review
          </AppText>
          {res.results.map((r) => {
            const ok = r.isCorrect;
            return (
              <Card key={r.index} elevated style={[styles.review, { borderLeftColor: ok ? colors.success : colors.danger }]}>
                <View style={styles.reviewHead}>
                  <View style={[styles.reviewIcon, { backgroundColor: ok ? colors.successSoft : colors.dangerSoft }]}>
                    <Ionicons name={ok ? 'checkmark' : 'close'} size={14} color={ok ? colors.success : colors.danger} />
                  </View>
                  <AppText variant="label">Question {r.index + 1}</AppText>
                </View>
                <AppText variant="bodyStrong">{exercises[r.index]?.prompt}</AppText>
                {!ok && (
                  <View style={styles.answerRows}>
                    <AnswerRow label="Your answer" value={formatAnswer(answers[r.index] ?? null, exercises[r.index])} tone="danger" />
                    <AnswerRow label="Correct" value={formatAnswer(r.correctAnswer, exercises[r.index])} tone="success" />
                  </View>
                )}
                {!!r.explanation && (
                  <View style={styles.explain}>
                    <Ionicons name="bulb-outline" size={15} color={colors.brand} />
                    <AppText variant="caption" color={colors.text} style={styles.flex}>
                      {r.explanation}
                    </AppText>
                  </View>
                )}
              </Card>
            );
          })}
        </ScrollView>
        <View style={styles.footer}>
          <Button
            title="Another round"
            onPress={anotherRound}
            icon={<Ionicons name="sparkles" size={18} color={colors.textOnPrimary} />}
          />
          <Button title="Done" variant="ghost" size="sm" onPress={router.back} />
        </View>
      </Shell>
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
      <TopBar
        progress={(index + (feedback ? 1 : 0)) / total}
        onClose={requestClose}
        counter={`${index + 1}/${total}`}
        combo={combo}
      />
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.question, animatedStyle]}>
            <View style={styles.metaRow}>
              <Badge icon={meta.icon} label={meta.label} tone="accent" />
              <Badge icon="sparkles" label="AI practice" />
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
            <FormError message={check.isError ? getErrorMessage(check.error) : null} />
            <Button title="Check" onPress={checkCurrent} disabled={!answered} loading={check.isPending} />
          </View>
        )}
        {feedback && submit.isError && (
          <View style={styles.footer}>
            <FormError message={getErrorMessage(submit.error)} />
          </View>
        )}
      </KeyboardAvoidingView>

      <Sheet visible={confirmLeave} onClose={() => setConfirmLeave(false)} title="Leave this practice round?">
        <AppText variant="body" color={colors.textMuted}>
          You&apos;ve answered {answeredCount} of {total}. This round won&apos;t be saved, and leaving earns no XP.
        </AppText>
        <Button title="Keep practising" onPress={() => setConfirmLeave(false)} />
        <Button
          title="Leave"
          variant="danger"
          onPress={() => {
            setConfirmLeave(false);
            router.back();
          }}
        />
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
      <IconButton icon="close" tone="surface" size={40} onPress={onClose} accessibilityLabel="Close practice" />
      <ProgressBar value={Math.max(0, Math.min(1, progress))} height={10} color={combo >= 3 ? colors.success : colors.brand} style={styles.flex} />
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

function AnswerRow({ label, value, tone }: { label: string; value: string; tone: 'success' | 'danger' }) {
  return (
    <View style={styles.answerRow}>
      <AppText variant="caption" style={styles.answerLabel}>
        {label}
      </AppText>
      <AppText variant="caption" color={tone === 'success' ? colors.success : colors.danger} style={[styles.flex, styles.bold]}>
        {value}
      </AppText>
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
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingHorizontal: spacing.xxl },
  sparkle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  spinner: { marginTop: spacing.sm },
  errorIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  errorActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },

  resultsContent: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.sm, overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(200,241,105,0.18)' },
  medal: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  heroBadges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.md },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  review: { gap: spacing.sm, borderLeftWidth: 4 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  answerRows: { gap: 4, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md },
  answerRow: { flexDirection: 'row', gap: spacing.sm },
  answerLabel: { width: 88 },
  explain: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', backgroundColor: colors.accentSoft, borderRadius: radius.sm, padding: spacing.md },
}));
