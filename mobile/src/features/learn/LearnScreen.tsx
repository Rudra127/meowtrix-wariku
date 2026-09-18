import { useUser } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LearnerStats } from '@/api/types';
import { AppText, Avatar, Badge, Button, Card, PressableScale, ProgressBar, Screen, SectionHeader, Sheet } from '@/components/ui';
import { usePersonalization } from '@/features/onboarding/usePersonalization';
import { getErrorMessage } from '@/lib/errors';
import { greeting } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { Reveal, Skeleton } from '@/components/motion';
import { AchievementsRow } from './AchievementsRow';
import { levelFromXp } from './gamification';
import { LessonNode } from './LessonNode';
import { StreakFlame } from './StreakFlame';
import type { Lesson } from './sampleData';
import { useLearningPath } from './useLearn';

// Zig-zag horizontal offsets for the path, Duolingo style.
const OFFSETS = [0, 56, 84, 56, 0, -56, -84, -56];

// Safe defaults so the header/tiles render before path data lands (or if it errors).
const EMPTY_STATS: LearnerStats = {
  streakDays: 0,
  longestStreak: 0,
  xp: 0,
  dailyGoalXp: 50,
  todayXp: 0,
  lessonsDone: 0,
  accuracy: 0,
  badges: 0,
};

export function LearnScreen() {
  const { user } = useUser();
  const router = useRouter();
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [placementOpen, setPlacementOpen] = useState(false);
  const { plan, level, isPersonalized } = usePersonalization();
  const path = useLearningPath();

  // Server has already reordered units by user.goal and computed done/current/locked.
  const units = path.data?.units ?? [];
  const stats = path.data?.stats ?? EMPTY_STATS;
  const current = units.flatMap((u) => u.lessons).find((l) => l.status === 'current');
  const currentUnit = units.find((u) => u.lessons.some((l) => l.id === current?.id));
  const unitProgress = currentUnit
    ? currentUnit.lessons.filter((l) => l.status === 'done').length / currentUnit.lessons.length
    : 0;
  const name = user?.firstName || 'there';
  const lvl = levelFromXp(stats.xp);
  const goalDone = stats.todayXp >= stats.dailyGoalXp;

  const startLesson = (slug: string) => {
    setSelected(null);
    router.push(`/lesson/${slug}`);
  };

  const startPractice = (slug: string) => {
    setSelected(null);
    router.push(`/practice/${slug}`);
  };

  let nodeIndex = 0;

  return (
    <Screen tabBarSpace refreshing={path.isRefetching} onRefresh={() => path.refetch()}>
      {/* Header */}
      <Reveal>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Avatar name={user?.fullName ?? name} imageUrl={user?.imageUrl} size={44} />
            <View>
              <AppText variant="caption">{greeting()},</AppText>
              <AppText variant="heading">{name}</AppText>
            </View>
          </View>
          <View style={styles.stats}>
            <View style={styles.statChip}>
              <StreakFlame active={stats.streakDays > 0} />
              <AppText variant="bodyStrong">{stats.streakDays}</AppText>
            </View>
            <View style={styles.statChip}>
              <Ionicons name="flash" size={16} color={colors.primary} />
              <AppText variant="bodyStrong">{stats.xp}</AppText>
            </View>
          </View>
        </View>

      </Reveal>

      {/* Continue learning hero (whole card is tappable) */}
      {current && currentUnit && (
        <Reveal index={1}>
          <PressableScale onPress={() => startLesson(current.id)} scaleTo={0.985} style={styles.hero} accessibilityRole="button" accessibilityLabel={`Continue: ${current.title}`}>
            <View style={[styles.heroRing, { width: 220, height: 220, right: -70, top: -80 }]} />
            <View style={[styles.heroRing, { width: 140, height: 140, right: -20, top: -30 }]} />
            <AppText variant="label" color={colors.textOnPrimaryMuted}>
              {stats.lessonsDone === 0 ? 'Start here' : 'Continue learning'} · Unit {currentUnit.index}
            </AppText>
            <AppText variant="title" color={colors.textOnPrimary}>
              {current.title}
            </AppText>
            <AppText variant="caption" color={colors.textOnPrimaryMuted}>
              {currentUnit.title} · {current.minutes} min · +{current.xp} XP
            </AppText>
            <ProgressBar value={unitProgress} color={colors.accent} trackColor={colors.primaryMuted} style={styles.heroProgress} />
            <View style={styles.heroFooter}>
              <AppText variant="caption" color={colors.textOnPrimaryMuted}>
                {Math.round(unitProgress * 100)}% of unit complete
              </AppText>
              <View style={styles.heroCta}>
                <Ionicons name="play" size={14} color={colors.primary} />
                <AppText variant="caption" color={colors.primary} style={styles.heroCtaText}>
                  {stats.lessonsDone === 0 ? 'Start' : 'Continue'}
                </AppText>
              </View>
            </View>
          </PressableScale>
        </Reveal>
      )}
      {!current && units.length > 0 && (
        <Reveal index={1}>
          <View style={styles.hero}>
            <View style={[styles.heroRing, { width: 220, height: 220, right: -70, top: -80 }]} />
            <View style={styles.doneMedal}>
              <Ionicons name="trophy" size={26} color={colors.primary} />
            </View>
            <AppText variant="title" color={colors.textOnPrimary}>
              Path complete!
            </AppText>
            <AppText variant="caption" color={colors.textOnPrimaryMuted}>
              You’ve finished every lesson. Review any lesson below to sharpen your score — new units are on the way.
            </AppText>
          </View>
        </Reveal>
      )}
      {path.isPending && !path.data && <HeroSkeleton />}

      {/* Personalised plan strip */}
      <Reveal index={2}>
        <View style={styles.planStrip}>
          <Badge tone="accent" icon={plan.icon} label={plan.headline} />
          <Badge icon={level.icon} label={level.label} />
        </View>
      </Reveal>

      {level.value !== 'beginner' && (
        <Reveal index={3}>
          <PressableScale onPress={() => setPlacementOpen(true)} style={styles.placement}>
            <Ionicons name="flash-outline" size={18} color={colors.primary} />
            <AppText variant="caption" color={colors.text} style={styles.flex}>
              Know the basics already? Take a 2-minute placement check to skip ahead.
            </AppText>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </PressableScale>
        </Reveal>
      )}

      {/* Daily goal + level */}
      <Reveal index={4}>
        <View style={styles.tiles}>
          <Card elevated style={[styles.goalTile, goalDone && styles.goalDone]}>
            <View style={styles.tileHead}>
              <AppText variant="label" color={goalDone ? colors.success : colors.textMuted}>
                Daily goal
              </AppText>
              <Ionicons name={goalDone ? 'checkmark-circle' : 'trophy-outline'} size={18} color={goalDone ? colors.success : colors.textMuted} />
            </View>
            <AppText variant="heading">
              {stats.todayXp}
              <AppText variant="caption"> / {stats.dailyGoalXp} XP</AppText>
            </AppText>
            <ProgressBar value={stats.dailyGoalXp > 0 ? stats.todayXp / stats.dailyGoalXp : 0} color={goalDone ? colors.success : colors.primary} />
            <AppText variant="caption" color={goalDone ? colors.success : colors.textMuted}>
              {goalDone ? 'Goal reached — nice!' : `${stats.dailyGoalXp - stats.todayXp} XP to go today`}
            </AppText>
          </Card>
          <Card elevated style={styles.smallTile}>
            <View style={styles.tileHead}>
              <AppText variant="label">Level</AppText>
              <View style={styles.lvlBadge}>
                <AppText variant="caption" color={colors.accent} style={styles.lvlText}>
                  {lvl.level}
                </AppText>
              </View>
            </View>
            <AppText variant="bodyStrong" numberOfLines={1}>
              {lvl.title}
            </AppText>
            <ProgressBar value={lvl.progress} color={colors.accent} />
            <AppText variant="caption">{lvl.toNext} XP to next</AppText>
          </Card>
        </View>
      </Reveal>

      {/* Error + empty states — the rest of the screen stays usable. */}
      {path.isError && (
        <Card elevated style={styles.stateCard}>
          <View style={[styles.stateIcon, { backgroundColor: colors.dangerSoft }]}>
            <Ionicons name="cloud-offline-outline" size={22} color={colors.danger} />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Couldn’t load lessons</AppText>
            <AppText variant="caption">{getErrorMessage(path.error)}</AppText>
          </View>
          <Button title="Retry" size="sm" variant="secondary" onPress={() => path.refetch()} />
        </Card>
      )}
      {path.isSuccess && units.length === 0 && (
        <Card elevated style={styles.stateCard}>
          <View style={[styles.stateIcon, { backgroundColor: colors.accentSoft }]}>
            <Ionicons name="book-outline" size={22} color={colors.primary} />
          </View>
          <View style={styles.flex}>
            <AppText variant="bodyStrong">Lessons are on their way</AppText>
            <AppText variant="caption">No lessons are published yet. Pull down to refresh.</AppText>
          </View>
        </Card>
      )}
      {path.isPending && !path.data && <PathSkeleton />}

      {/* Learning path */}
      {units.map((unit, unitIndex) => (
        <Reveal key={unit.id} index={5 + unitIndex}>
          <View style={styles.unit}>
            {unitIndex === 0 && isPersonalized && <Badge tone="success" icon="sparkles" label="Recommended for your goal" />}
            <View style={styles.unitHeader}>
              <View style={styles.unitIndex}>
                <AppText variant="bodyStrong" color={colors.accent}>
                  {unit.index}
                </AppText>
              </View>
              <View style={styles.flex}>
                <SectionHeader title={unit.title} />
                <AppText variant="caption">{unit.description}</AppText>
              </View>
            </View>
            <View style={styles.path}>
              {unit.lessons.map((lesson, i) => (
                // Nodes cascade in one after another, like steps appearing on a trail.
                <Reveal key={lesson.id} index={i} delay={180 + unitIndex * 120} offset={20}>
                  <LessonNode lesson={lesson} offset={OFFSETS[nodeIndex++ % OFFSETS.length]} onPress={setSelected} />
                </Reveal>
              ))}
            </View>
          </View>
        </Reveal>
      ))}

      {path.data && (
        <Reveal delay={200}>
          <AchievementsRow stats={stats} />
        </Reveal>
      )}

      <LessonSheet lesson={selected} onClose={() => setSelected(null)} onStart={startLesson} onPractice={startPractice} />
      <Sheet visible={placementOpen} onClose={() => setPlacementOpen(false)} title="Placement check">
        <AppText variant="body" color={colors.textMuted}>
          A short quiz that unlocks lessons you already know, so {level.label.toLowerCase()} learners don&rsquo;t repeat the basics.
        </AppText>
        <Badge label="Coming soon" tone="accent" icon="sparkles" />
        <Button title="Got it" variant="secondary" onPress={() => setPlacementOpen(false)} />
      </Sheet>
    </Screen>
  );
}

/** Static placeholders shown while the path loads (feels faster than a spinner). */
function HeroSkeleton() {
  return (
    <View style={[styles.hero, styles.skeletonHero]}>
      <Skeleton tone="dark" width="40%" height={12} />
      <Skeleton tone="dark" width="75%" height={24} />
      <Skeleton tone="dark" height={10} style={{ marginTop: spacing.md }} />
    </View>
  );
}

function PathSkeleton() {
  return (
    <View style={styles.path}>
      {[0, 56, 84, 56].map((x, i) => (
        <Skeleton key={i} width={72} height={72} radius={36} style={{ transform: [{ translateX: x }] }} />
      ))}
    </View>
  );
}

function LessonSheet({
  lesson,
  onClose,
  onStart,
  onPractice,
}: {
  lesson: Lesson | null;
  onClose: () => void;
  onStart: (slug: string) => void;
  onPractice: (slug: string) => void;
}) {
  const locked = lesson?.status === 'locked';
  return (
    <Sheet visible={!!lesson} onClose={onClose} title={lesson?.title}>
      {lesson && (
        <>
          <AppText variant="body" color={colors.textMuted}>
            {lesson.summary}
          </AppText>
          <View style={styles.sheetStats}>
            <Badge label={`${lesson.minutes} min`} icon="time-outline" />
            <Badge label={`+${lesson.xp} XP`} icon="flash" tone="accent" />
            {lesson.status === 'done' && <Badge label="Completed" icon="checkmark" tone="success" />}
          </View>
          {locked && (
            <Card tone="muted" style={styles.lockedCard}>
              <Ionicons name="lock-closed" size={18} color={colors.textMuted} />
              <AppText variant="caption" style={styles.flex}>
                Finish the lessons before this one to unlock it.
              </AppText>
            </Card>
          )}
          <Button
            title={locked ? 'Got it' : lesson.status === 'done' ? 'Review lesson' : 'Start lesson'}
            variant={locked ? 'secondary' : 'primary'}
            onPress={locked ? onClose : () => onStart(lesson.id)}
          />
          {/* AI practice: unlimited extra questions on this topic, generated on demand. */}
          {!locked && (
            <Button
              title="Practise with AI"
              variant="secondary"
              onPress={() => onPractice(lesson.id)}
              icon={<Ionicons name="sparkles" size={16} color={colors.text} />}
            />
          )}
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stats: { flexDirection: 'row', gap: spacing.sm },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 36,
  },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.xs,
    overflow: 'hidden',
  },
  heroRing: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(200,241,105,0.18)' },
  heroProgress: { marginTop: spacing.md },
  heroFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  tiles: { flexDirection: 'row', gap: spacing.md },
  planStrip: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  placement: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  goalTile: { flex: 1.3, borderWidth: 1.5, borderColor: 'transparent' },
  goalDone: { borderColor: colors.success, backgroundColor: colors.successSoft },
  smallTile: { flex: 1 },
  lvlBadge: { minWidth: 24, height: 24, borderRadius: 12, paddingHorizontal: 6, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  lvlText: { fontFamily: fonts.extrabold, fontSize: 12, lineHeight: 16 },
  tileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  unit: { gap: spacing.lg, marginTop: spacing.sm },
  unitHeader: { flexDirection: 'row', gap: spacing.md, alignItems: 'center' },
  unitIndex: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  path: { alignItems: 'center', gap: spacing.lg, paddingVertical: spacing.sm },
  sheetStats: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  lockedCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  heroCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    height: 38,
  },
  heroCtaText: { fontFamily: fonts.bold, fontSize: 14 },
  doneMedal: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  stateCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  stateIcon: { width: 44, height: 44, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  skeletonHero: { gap: spacing.sm, minHeight: 160 },
});
