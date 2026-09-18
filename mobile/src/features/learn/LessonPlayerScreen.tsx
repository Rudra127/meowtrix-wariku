import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import type { ExerciseResult, LessonAnswer, LessonSubmitResult, PublicExercise } from '@/api/types';
import { AppText, Badge, Button, Card, IconButton, PressableScale, ProgressBar, Screen } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { colors, fonts, radius, spacing } from '@/theme';
import { useLessonDetail, useSubmitLesson } from './useLearn';

type Props = { slug: string };

/**
 * Full-screen lesson player. Two phases:
 *   1. "play"    — one exercise at a time, local answers collected in `answers`.
 *   2. "results" — submit answers to the server, then render per-exercise feedback
 *                  from the graded response (correct/wrong + explanation + XP + streak).
 *
 * Grading is entirely server-side (see backend/services/learn-service.js) — this screen
 * never has the correct answers until after submit.
 */
export function LessonPlayerScreen({ slug }: Props) {
  const router = useRouter();
  const detail = useLessonDetail(slug);
  const submit = useSubmitLesson(slug);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<LessonAnswer[]>([]);

  const lesson = detail.data?.lesson;
  const exercises = lesson?.exercises ?? [];
  const total = exercises.length;
  const isLast = index === total - 1;
  const current = exercises[index];
  const currentAnswer = answers[index] ?? null;

  const setAnswer = (value: LessonAnswer) =>
    setAnswers((prev) => {
      const next = prev.slice();
      next[index] = value;
      return next;
    });

  const canAdvance = currentAnswer !== null && currentAnswer !== undefined && !submit.isPending;

  const advance = () => {
    Haptics.selectionAsync().catch(() => {});
    if (isLast) {
      submit.mutate(fillMissing(answers, total));
    } else {
      setIndex((i) => Math.min(i + 1, total - 1));
    }
  };

  const goBack = () => router.back();

  // -- loading / error -----------------------------------------------------------------

  if (detail.isPending && !detail.data) {
    return (
      <Screen edges={['top', 'bottom']} scroll={false}>
        <Header progress={0} onClose={goBack} />
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }
  if (detail.isError || !lesson) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Header progress={0} onClose={goBack} />
        <Card tone="muted" style={styles.errorCard}>
          <Ionicons name="cloud-offline-outline" size={22} color={colors.danger} />
          <AppText variant="bodyStrong">Couldn&apos;t load this lesson</AppText>
          <AppText variant="caption" color={colors.textMuted}>
            {getErrorMessage(detail.error)}
          </AppText>
          <View style={styles.errorActions}>
            <Button title="Back" variant="secondary" onPress={goBack} />
            <Button title="Retry" onPress={() => detail.refetch()} />
          </View>
        </Card>
      </Screen>
    );
  }

  // -- results phase -------------------------------------------------------------------

  if (submit.data) {
    return <ResultsView result={submit.data} exercises={exercises} onClose={goBack} />;
  }

  // -- play phase ----------------------------------------------------------------------

  const progress = total > 0 ? index / total : 0;

  return (
    <Screen edges={['top', 'bottom']} scroll={false}>
      <Header progress={progress} onClose={goBack} />
      <View style={styles.body}>
        <AppText variant="label" color={colors.textMuted}>
          Question {index + 1} of {total} · +{lesson.xp} XP total
        </AppText>
        <AppText variant="title" style={styles.prompt}>
          {current.prompt}
        </AppText>

        <ExerciseInput exercise={current} value={currentAnswer} onChange={setAnswer} />

        {submit.isError && (
          <AppText variant="caption" color={colors.danger}>
            {getErrorMessage(submit.error)}
          </AppText>
        )}
      </View>

      <View style={styles.footer}>
        <Button
          title={isLast ? 'Finish lesson' : 'Continue'}
          variant={isLast ? 'brand' : 'primary'}
          onPress={advance}
          disabled={!canAdvance}
          loading={submit.isPending}
          icon={!isLast && <Ionicons name="arrow-forward" size={16} color={colors.textOnPrimary} />}
        />
      </View>
    </Screen>
  );
}

// ---- Header ------------------------------------------------------------------------

function Header({ progress, onClose }: { progress: number; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <IconButton icon="close" onPress={onClose} accessibilityLabel="Close lesson" />
      <ProgressBar value={Math.max(0, Math.min(1, progress))} style={styles.headerProgress} />
    </View>
  );
}

// ---- Exercise renderers ------------------------------------------------------------

function ExerciseInput({
  exercise,
  value,
  onChange,
}: {
  exercise: PublicExercise;
  value: LessonAnswer;
  onChange: (v: LessonAnswer) => void;
}) {
  switch (exercise.type) {
    case 'multiple_choice':
      return <MultipleChoice options={exercise.options ?? []} value={value} onChange={onChange} />;
    case 'true_false':
      return <TrueFalse value={value} onChange={onChange} />;
    case 'fill_number':
      return <FillNumber value={value} onChange={onChange} />;
    case 'order_steps':
      return <OrderSteps options={exercise.options ?? []} value={value} onChange={onChange} />;
    default:
      return null;
  }
}

function MultipleChoice({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: LessonAnswer;
  onChange: (v: LessonAnswer) => void;
}) {
  return (
    <View style={styles.choiceList}>
      {options.map((label, i) => {
        const selected = value === i;
        return (
          <PressableScale
            key={`${i}-${label}`}
            onPress={() => onChange(i)}
            style={[styles.choice, selected && styles.choiceSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <View style={[styles.bullet, selected && styles.bulletSelected]}>
              <AppText variant="bodyStrong" color={selected ? colors.textOnPrimary : colors.text}>
                {String.fromCharCode(65 + i)}
              </AppText>
            </View>
            <AppText variant="body" style={styles.flex}>
              {label}
            </AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

function TrueFalse({ value, onChange }: { value: LessonAnswer; onChange: (v: LessonAnswer) => void }) {
  return (
    <View style={styles.tfRow}>
      {[
        { label: 'True', v: true, icon: 'checkmark' as const },
        { label: 'False', v: false, icon: 'close' as const },
      ].map(({ label, v, icon }) => {
        const selected = value === v;
        return (
          <PressableScale
            key={label}
            onPress={() => onChange(v)}
            style={[styles.tfCard, selected && styles.choiceSelected]}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <View style={[styles.tfIcon, selected && styles.bulletSelected]}>
              <Ionicons name={icon} size={22} color={selected ? colors.textOnPrimary : colors.text} />
            </View>
            <AppText variant="bodyStrong">{label}</AppText>
          </PressableScale>
        );
      })}
    </View>
  );
}

function FillNumber({ value, onChange }: { value: LessonAnswer; onChange: (v: LessonAnswer) => void }) {
  const [raw, setRaw] = useState<string>(typeof value === 'number' ? String(value) : '');
  return (
    <View style={styles.fillWrap}>
      <TextInput
        value={raw}
        onChangeText={(text) => {
          setRaw(text);
          const parsed = Number(text.replace(/,/g, ''));
          onChange(Number.isFinite(parsed) && text.trim() !== '' ? parsed : null);
        }}
        keyboardType="numeric"
        placeholder="Type your answer"
        placeholderTextColor={colors.textSubtle}
        style={styles.fillInput}
        returnKeyType="done"
      />
      <AppText variant="caption" color={colors.textMuted}>
        Enter a number — no need to include currency symbols.
      </AppText>
    </View>
  );
}

function OrderSteps({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: LessonAnswer;
  onChange: (v: LessonAnswer) => void;
}) {
  // Stable shuffled display order — one permutation per mount, so re-renders don't reshuffle.
  // Elements are indices into the original `options` array (the server's canonical order).
  const shuffled = useMemo(() => shuffleIndices(options.length), [options.length]);
  const current = Array.isArray(value) ? (value as number[]) : [];

  const toggle = (originalIndex: number) => {
    if (current.includes(originalIndex)) {
      onChange(current.filter((i) => i !== originalIndex));
    } else {
      onChange([...current, originalIndex]);
    }
  };

  return (
    <View style={styles.orderWrap}>
      <AppText variant="caption" color={colors.textMuted}>
        Tap the steps in the correct order.
      </AppText>
      <View style={styles.choiceList}>
        {shuffled.map((originalIndex) => {
          const position = current.indexOf(originalIndex);
          const selected = position >= 0;
          return (
            <PressableScale
              key={originalIndex}
              onPress={() => toggle(originalIndex)}
              style={[styles.choice, selected && styles.choiceSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <View style={[styles.bullet, selected && styles.bulletSelected]}>
                <AppText variant="bodyStrong" color={selected ? colors.textOnPrimary : colors.text}>
                  {selected ? position + 1 : '·'}
                </AppText>
              </View>
              <AppText variant="body" style={styles.flex}>
                {options[originalIndex]}
              </AppText>
            </PressableScale>
          );
        })}
      </View>
      {current.length > 0 && (
        <PressableScale onPress={() => onChange([])} style={styles.clearBtn}>
          <AppText variant="caption" color={colors.primary}>
            Clear order
          </AppText>
        </PressableScale>
      )}
    </View>
  );
}

// ---- Results view ------------------------------------------------------------------

function ResultsView({
  result,
  exercises,
  onClose,
}: {
  result: LessonSubmitResult;
  exercises: PublicExercise[];
  onClose: () => void;
}) {
  const passed = result.passed;
  return (
    <Screen edges={['top', 'bottom']}>
      <Header progress={1} onClose={onClose} />

      <View style={[styles.resultHero, passed ? styles.resultHeroPassed : styles.resultHeroFailed]}>
        <View style={[styles.resultBadge, passed ? styles.resultBadgePassed : styles.resultBadgeFailed]}>
          <Ionicons
            name={passed ? 'trophy' : 'reload'}
            size={28}
            color={passed ? colors.primary : colors.textOnPrimary}
          />
        </View>
        <AppText variant="title" color={passed ? colors.textOnPrimary : colors.textOnPrimary}>
          {passed ? 'Lesson complete!' : 'Nice try'}
        </AppText>
        <AppText variant="body" color={colors.textOnPrimaryMuted}>
          You got {result.correct} of {result.total} right ({Math.round(result.score * 100)}%).
        </AppText>
        <View style={styles.resultChips}>
          <Badge tone="accent" icon="flash" label={`+${result.xpEarned} XP`} />
          <Badge icon="flame" label={`${result.stats.streakDays}-day streak`} />
          {passed && <Badge tone="success" icon="checkmark" label="Passed" />}
        </View>
      </View>

      <AppText variant="heading">Review</AppText>
      {result.results.map((r) => (
        <ReviewCard key={r.index} result={r} exercise={exercises[r.index]} />
      ))}

      <Button title="Back to path" variant="brand" onPress={onClose} />
    </Screen>
  );
}

function ReviewCard({ result, exercise }: { result: ExerciseResult; exercise: PublicExercise | undefined }) {
  const tone = result.isCorrect ? colors.success : colors.danger;
  const bg = result.isCorrect ? colors.successSoft : colors.dangerSoft;
  return (
    <Card style={[styles.reviewCard, { borderColor: tone, backgroundColor: bg }]}>
      <View style={styles.reviewHead}>
        <Ionicons
          name={result.isCorrect ? 'checkmark-circle' : 'close-circle'}
          size={20}
          color={tone}
        />
        <AppText variant="bodyStrong" color={tone} style={styles.flex}>
          {result.isCorrect ? 'Correct' : 'Not quite'}
        </AppText>
      </View>
      {exercise && (
        <AppText variant="body" color={colors.text}>
          {exercise.prompt}
        </AppText>
      )}
      {!result.isCorrect && (
        <AppText variant="caption" color={colors.textMuted}>
          Correct answer: {formatAnswer(result.correctAnswer, exercise)}
        </AppText>
      )}
      {result.explanation && (
        <AppText variant="body" color={colors.text} style={styles.explanation}>
          {result.explanation}
        </AppText>
      )}
    </Card>
  );
}

// ---- helpers -----------------------------------------------------------------------

function fillMissing(answers: LessonAnswer[], total: number): LessonAnswer[] {
  const out: LessonAnswer[] = [];
  for (let i = 0; i < total; i += 1) out.push(answers[i] ?? null);
  return out;
}

function shuffleIndices(n: number): number[] {
  const arr = Array.from({ length: n }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function formatAnswer(answer: number | boolean | number[], exercise: PublicExercise | undefined): string {
  if (typeof answer === 'boolean') return answer ? 'True' : 'False';
  if (Array.isArray(answer) && exercise?.options) {
    return answer.map((i) => exercise.options?.[i] ?? String(i)).join(' → ');
  }
  if (typeof answer === 'number' && exercise?.type === 'multiple_choice' && exercise.options) {
    return exercise.options[answer] ?? String(answer);
  }
  return String(answer);
}

// ---- styles ------------------------------------------------------------------------

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headerProgress: { flex: 1 },
  body: { flex: 1, gap: spacing.lg, paddingTop: spacing.lg },
  prompt: { lineHeight: 34 },
  footer: { paddingBottom: spacing.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorCard: { gap: spacing.sm, alignItems: 'flex-start' },
  errorActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },

  choiceList: { gap: spacing.sm },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 60,
  },
  choiceSelected: { borderColor: colors.primary, backgroundColor: colors.accentSoft },
  bullet: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulletSelected: { backgroundColor: colors.primary },

  tfRow: { flexDirection: 'row', gap: spacing.md },
  tfCard: {
    flex: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  tfIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },

  fillWrap: { gap: spacing.sm },
  fillInput: {
    fontFamily: fonts.bold,
    fontSize: 28,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 64,
  },
  orderWrap: { gap: spacing.md },
  clearBtn: { alignSelf: 'flex-start' },

  resultHero: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  resultHeroPassed: { backgroundColor: colors.primary },
  resultHeroFailed: { backgroundColor: colors.primaryMuted },
  resultBadge: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  resultBadgePassed: { backgroundColor: colors.accent },
  resultBadgeFailed: { backgroundColor: colors.primary },
  resultChips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.md },

  reviewCard: { gap: spacing.sm, borderWidth: 1.5 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  explanation: { marginTop: spacing.xs },
});
