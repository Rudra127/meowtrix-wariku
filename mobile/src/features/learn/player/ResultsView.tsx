import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ExerciseResult, LearnerStats, LessonAnswer, LessonSubmitResult, PublicExercise } from '@/api/types';
import { Confetti, CountUp } from '@/components/fx';
import { AppText, Badge, Button, Card, PressableScale, ProgressBar } from '@/components/ui';
import { levelFromXp, newlyUnlocked } from '../gamification';
import { colors, fonts, radius, spacing } from '@/theme';
import { formatAnswer } from './exerciseMeta';

type Props = {
  result: LessonSubmitResult;
  exercises: PublicExercise[];
  answers: LessonAnswer[];
  lessonTitle: string;
  /** Longest run of correct answers in this attempt. */
  bestCombo?: number;
  /** Stats before the lesson — used to celebrate level-ups and new achievements. */
  statsBefore?: LearnerStats;
  onRetry: () => void;
  onDone: () => void;
  /** Start an AI practice round on this lesson's topic. Omit to hide the option. */
  onPractice?: () => void;
};

/** Post-submit screen: celebration (or encouragement), XP/streak/goal, and an answer review. */
export function ResultsView({ result, exercises, answers, lessonTitle, bestCombo = 0, statsBefore, onRetry, onDone, onPractice }: Props) {
  const { passed, stats } = result;
  const [pop] = useState(() => new Animated.Value(0));
  const [showReview, setShowReview] = useState(!passed); // failed → show what went wrong right away

  useEffect(() => {
    Haptics.notificationAsync(
      passed ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {});
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 10, bounciness: 12 }).start();
  }, [passed, pop]);

  const pct = Math.round(result.score * 100);
  const perfect = result.correct === result.total;
  const goalRatio = stats.dailyGoalXp > 0 ? stats.todayXp / stats.dailyGoalXp : 0;
  const level = levelFromXp(stats.xp);
  const leveledUp = !!statsBefore && levelFromXp(statsBefore.xp).level < level.level;
  const unlocked = newlyUnlocked(statsBefore, stats);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {passed && <Confetti count={perfect ? 60 : 40} />}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, !passed && styles.heroSoft]}>
          <View style={[styles.ring, { width: 280, height: 280, top: -120, right: -100 }]} />
          <View style={[styles.ring, { width: 170, height: 170, top: -50, right: -40 }]} />
          <Animated.View
            style={[
              styles.medal,
              !passed && styles.medalSoft,
              { opacity: pop, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] },
            ]}
          >
            <Ionicons name={passed ? 'trophy' : 'refresh'} size={34} color={passed ? colors.primary : colors.textOnPrimary} />
          </Animated.View>
          <AppText variant="label" color={colors.textOnPrimaryMuted}>
            {lessonTitle}
          </AppText>
          <AppText variant="display" color={colors.textOnPrimary}>
            {passed ? 'Lesson complete!' : 'Almost there'}
          </AppText>
          <AppText variant="body" color={colors.textOnPrimaryMuted}>
            {passed
              ? `You got ${result.correct} of ${result.total} right. Keep the streak going!`
              : `You got ${result.correct} of ${result.total}. You need 60% to pass — review and try again.`}
          </AppText>
          <View style={styles.scoreRow}>
            <CountUp to={pct} suffix="%" style={styles.score} color={passed ? colors.accent : colors.textOnPrimary} />
            <AppText variant="caption" color={colors.textOnPrimaryMuted}>
              score
            </AppText>
          </View>
          {(perfect || bestCombo >= 3) && (
            <View style={styles.heroBadges}>
              {perfect && <Badge tone="accent" icon="star" label="Perfect lesson" />}
              {bestCombo >= 3 && <Badge tone="glass" icon="flame" label={`Best combo x${bestCombo}`} />}
            </View>
          )}
        </View>

        <View style={styles.tiles}>
          <StatTile icon="flash" tint={colors.primary} value={result.xpEarned} prefix="+" label={result.xpEarned ? 'XP earned' : 'No new XP'} />
          <StatTile icon="flame" tint="#F97316" value={stats.streakDays} label="Day streak" />
          <StatTile icon="checkmark-done" tint={colors.success} value={stats.lessonsDone} label="Lessons" />
        </View>

        {/* Level progress — celebrates level-ups */}
        <Card elevated style={[styles.goal, leveledUp && styles.levelUp]}>
          <View style={styles.goalHead}>
            <View style={styles.levelRow}>
              <View style={styles.levelBadge}>
                <AppText variant="bodyStrong" color={colors.accent}>
                  {level.level}
                </AppText>
              </View>
              <View>
                <AppText variant="bodyStrong">{leveledUp ? `Level up! ${level.title}` : `Level ${level.level} · ${level.title}`}</AppText>
                <AppText variant="caption">{level.toNext} XP to level {level.level + 1}</AppText>
              </View>
            </View>
            {leveledUp && <Ionicons name="arrow-up-circle" size={24} color={colors.success} />}
          </View>
          <ProgressBar value={level.progress} color={colors.accent} trackColor={colors.surfaceMuted} />
        </Card>

        {unlocked.length > 0 && (
          <Card elevated style={styles.goal}>
            <AppText variant="label">New achievement{unlocked.length > 1 ? 's' : ''}</AppText>
            {unlocked.map((a) => (
              <View key={a.id} style={styles.levelRow}>
                <View style={[styles.achIcon, { backgroundColor: a.color }]}>
                  <Ionicons name={a.icon} size={18} color={colors.textOnPrimary} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="bodyStrong">{a.title}</AppText>
                  <AppText variant="caption">{a.description}</AppText>
                </View>
              </View>
            ))}
          </Card>
        )}

        <Card elevated style={styles.goal}>
          <View style={styles.goalHead}>
            <AppText variant="bodyStrong">Daily goal</AppText>
            <AppText variant="caption">
              {Math.min(stats.todayXp, stats.dailyGoalXp)} / {stats.dailyGoalXp} XP
            </AppText>
          </View>
          <ProgressBar value={goalRatio} color={goalRatio >= 1 ? colors.success : colors.primary} />
          {goalRatio >= 1 && (
            <AppText variant="caption" color={colors.success}>
              Goal reached for today — nice work.
            </AppText>
          )}
        </Card>

        <PressableScale onPress={() => setShowReview((s) => !s)} style={styles.reviewToggle} accessibilityRole="button">
          <AppText variant="subheading" style={styles.bold}>
            Review answers
          </AppText>
          <View style={styles.reviewCount}>
            <AppText variant="caption" color={colors.success} style={styles.bold}>
              {result.correct} ✓
            </AppText>
            <AppText variant="caption" color={colors.danger} style={styles.bold}>
              {result.total - result.correct} ✗
            </AppText>
            <Ionicons name={showReview ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </View>
        </PressableScale>

        {showReview &&
          result.results.map((r) => (
            <ReviewItem key={r.index} n={r.index + 1} result={r} exercise={exercises[r.index]} answer={answers[r.index] ?? null} />
          ))}
      </ScrollView>

      <View style={styles.footer}>
        {passed ? (
          <>
            <Button title="Continue" onPress={onDone} icon={<Ionicons name="arrow-forward" size={18} color={colors.textOnPrimary} />} />
            {onPractice && (
              <Button
                title="Practise this topic with AI"
                variant="secondary"
                size="sm"
                onPress={onPractice}
                icon={<Ionicons name="sparkles" size={16} color={colors.text} />}
              />
            )}
          </>
        ) : (
          <>
            <Button title="Try again" onPress={onRetry} icon={<Ionicons name="refresh" size={18} color={colors.textOnPrimary} />} />
            <Button title="Back to path" variant="ghost" size="sm" onPress={onDone} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function StatTile({ icon, tint, value, prefix = '', label }: { icon: React.ComponentProps<typeof Ionicons>['name']; tint: string; value: number; prefix?: string; label: string }) {
  return (
    <Card elevated style={styles.tile}>
      <Ionicons name={icon} size={18} color={tint} />
      <CountUp to={value} prefix={prefix} delay={400} />
      <AppText variant="caption" numberOfLines={1}>
        {label}
      </AppText>
    </Card>
  );
}

function ReviewItem({ n, result, exercise, answer }: { n: number; result: ExerciseResult; exercise?: PublicExercise; answer: LessonAnswer }) {
  const ok = result.isCorrect;
  return (
    <Card elevated style={[styles.review, { borderLeftColor: ok ? colors.success : colors.danger }]}>
      <View style={styles.reviewHead}>
        <View style={[styles.reviewIcon, { backgroundColor: ok ? colors.successSoft : colors.dangerSoft }]}>
          <Ionicons name={ok ? 'checkmark' : 'close'} size={14} color={ok ? colors.success : colors.danger} />
        </View>
        <AppText variant="label">Question {n}</AppText>
      </View>
      {exercise && <AppText variant="bodyStrong">{exercise.prompt}</AppText>}
      {!ok && (
        <View style={styles.answerRows}>
          <AnswerRow label="Your answer" value={formatAnswer(answer, exercise)} tone="danger" />
          <AnswerRow label="Correct" value={formatAnswer(result.correctAnswer, exercise)} tone="success" />
        </View>
      )}
      {!!result.explanation && (
        <View style={styles.explain}>
          <Ionicons name="bulb-outline" size={15} color={colors.primary} />
          <AppText variant="caption" color={colors.text} style={styles.flex}>
            {result.explanation}
          </AppText>
        </View>
      )}
    </Card>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  bold: { fontFamily: fonts.bold },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxl },
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.sm, overflow: 'hidden' },
  heroSoft: { backgroundColor: colors.primaryMuted },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(200,241,105,0.18)' },
  medal: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  medalSoft: { backgroundColor: 'rgba(255,255,255,0.14)' },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginTop: spacing.sm },
  score: { fontFamily: fonts.extrabold, fontSize: 44, lineHeight: 50, letterSpacing: -1.5 },
  tiles: { flexDirection: 'row', gap: spacing.md },
  heroBadges: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.xs },
  levelUp: { borderWidth: 1.5, borderColor: colors.accent },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  levelBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  achIcon: { width: 36, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  tile: { flex: 1, gap: 2, alignItems: 'flex-start' },
  goal: { gap: spacing.sm },
  goalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reviewToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.xs },
  reviewCount: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  review: { gap: spacing.sm, borderLeftWidth: 4 },
  reviewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  reviewIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  answerRows: { gap: 4, backgroundColor: colors.surfaceMuted, borderRadius: radius.sm, padding: spacing.md },
  answerRow: { flexDirection: 'row', gap: spacing.sm },
  answerLabel: { width: 88 },
  explain: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: spacing.xs },
});
