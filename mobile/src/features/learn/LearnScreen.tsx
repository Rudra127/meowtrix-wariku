import { useUser } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Avatar, Badge, Button, Card, PressableScale, ProgressBar, Screen, SectionHeader, Sheet } from '@/components/ui';
import { usePersonalization } from '@/features/onboarding/usePersonalization';
import { greeting } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { LessonNode } from './LessonNode';
import { learnerStats, personalizePath, units as allUnits, type Lesson } from './sampleData';

// Zig-zag horizontal offsets for the path, Duolingo style.
const OFFSETS = [0, 56, 84, 56, 0, -56, -84, -56];

export function LearnScreen() {
  const { user } = useUser();
  const [selected, setSelected] = useState<Lesson | null>(null);
  const [placementOpen, setPlacementOpen] = useState(false);
  const { plan, level } = usePersonalization();
  // Recommended unit (from the onboarding goal) goes first and holds the current lesson.
  const units = useMemo(() => personalizePath(allUnits, plan.learnUnitId), [plan.learnUnitId]);
  const current = units.flatMap((u) => u.lessons).find((l) => l.status === 'current');
  const currentUnit = units.find((u) => u.lessons.some((l) => l.id === current?.id));
  const unitProgress = currentUnit
    ? currentUnit.lessons.filter((l) => l.status === 'done').length / currentUnit.lessons.length
    : 0;
  const name = user?.firstName || 'there';

  let nodeIndex = 0;

  return (
    <Screen tabBarSpace>
      {/* Header */}
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
            <Ionicons name="flame" size={16} color="#F97316" />
            <AppText variant="bodyStrong">{learnerStats.streakDays}</AppText>
          </View>
          <View style={styles.statChip}>
            <Ionicons name="flash" size={16} color={colors.primary} />
            <AppText variant="bodyStrong">{learnerStats.xp}</AppText>
          </View>
        </View>
      </View>

      {/* Continue learning hero */}
      {current && currentUnit && (
        <View style={styles.hero}>
          <View style={[styles.heroRing, { width: 220, height: 220, right: -70, top: -80 }]} />
          <View style={[styles.heroRing, { width: 140, height: 140, right: -20, top: -30 }]} />
          <AppText variant="label" color={colors.textOnPrimaryMuted}>
            Continue learning · Unit {currentUnit.index}
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
            <Button title="Continue" variant="accent" size="sm" onPress={() => setSelected(current)} icon={<Ionicons name="play" size={14} color={colors.primary} />} />
          </View>
        </View>
      )}

      {/* Personalised plan strip */}
      <View style={styles.planStrip}>
        <Badge tone="accent" icon={plan.icon} label={plan.headline} />
        <Badge icon={level.icon} label={level.label} />
      </View>

      {level.value !== 'beginner' && (
        <PressableScale onPress={() => setPlacementOpen(true)} style={styles.placement}>
          <Ionicons name="flash-outline" size={18} color={colors.primary} />
          <AppText variant="caption" color={colors.text} style={styles.flex}>
            Know the basics already? Take a 2-minute placement check to skip ahead.
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </PressableScale>
      )}

      {/* Daily goal + stats */}
      <View style={styles.tiles}>
        <Card style={styles.goalTile}>
          <View style={styles.tileHead}>
            <AppText variant="label">Daily goal</AppText>
            <Ionicons name="trophy-outline" size={16} color={colors.textMuted} />
          </View>
          <AppText variant="heading">
            {learnerStats.todayXp}
            <AppText variant="caption"> / {learnerStats.dailyGoalXp} XP</AppText>
          </AppText>
          <ProgressBar value={learnerStats.todayXp / learnerStats.dailyGoalXp} />
        </Card>
        <Card style={styles.smallTile}>
          <AppText variant="label">Accuracy</AppText>
          <AppText variant="heading">{Math.round(learnerStats.accuracy * 100)}%</AppText>
          <AppText variant="caption">{learnerStats.lessonsDone} lessons</AppText>
        </Card>
      </View>

      <Badge label="Preview · sample lessons" icon="construct-outline" />

      {/* Learning path */}
      {units.map((unit, unitIndex) => (
        <View key={unit.id} style={styles.unit}>
          {unitIndex === 0 && <Badge tone="success" icon="sparkles" label="Recommended for your goal" />}
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
            {unit.lessons.map((lesson) => (
              <LessonNode key={lesson.id} lesson={lesson} offset={OFFSETS[nodeIndex++ % OFFSETS.length]} onPress={setSelected} />
            ))}
          </View>
        </View>
      ))}

      <LessonSheet lesson={selected} onClose={() => setSelected(null)} />
      <Sheet visible={placementOpen} onClose={() => setPlacementOpen(false)} title="Placement check">
        <AppText variant="body" color={colors.textMuted}>
          A short quiz that unlocks lessons you already know, so {level.label.toLowerCase()} learners don’t repeat the basics.
        </AppText>
        <Badge label="Coming soon" tone="accent" icon="sparkles" />
        <Button title="Got it" variant="secondary" onPress={() => setPlacementOpen(false)} />
      </Sheet>
    </Screen>
  );
}

function LessonSheet({ lesson, onClose }: { lesson: Lesson | null; onClose: () => void }) {
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
          {locked ? (
            <Card tone="muted" style={styles.lockedCard}>
              <Ionicons name="lock-closed" size={18} color={colors.textMuted} />
              <AppText variant="caption" style={styles.flex}>
                Finish the lessons before this one to unlock it.
              </AppText>
            </Card>
          ) : (
            <Card tone="muted" style={styles.lockedCard}>
              <Ionicons name="construct-outline" size={18} color={colors.textMuted} />
              <AppText variant="caption" style={styles.flex}>
                The lesson player is next on the roadmap — this is a preview of the path.
              </AppText>
            </Card>
          )}
          <Button
            title={locked ? 'Got it' : lesson.status === 'done' ? 'Review lesson' : 'Start lesson'}
            variant={locked ? 'secondary' : 'primary'}
            onPress={onClose}
          />
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
  goalTile: { flex: 1.4 },
  smallTile: { flex: 1 },
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
});
