import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { LearnerStats } from '@/api/types';
import { AppText, Badge, Button, PressableScale, SectionHeader, Sheet } from '@/components/ui';
import { colors, fonts, spacing, themed } from '@/theme';
import { getAchievements, type Achievement } from './gamification';

/** Horizontal shelf of medals. Unlocked = coloured, locked = grey with a lock. Tap for details. */
export function AchievementsRow({ stats }: { stats: LearnerStats }) {
  const achievements = getAchievements(stats);
  const unlocked = achievements.filter((a) => a.unlocked).length;
  const [selected, setSelected] = useState<Achievement | null>(null);

  return (
    <View style={styles.wrap}>
      <SectionHeader title={`Achievements · ${unlocked}/${achievements.length}`} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {achievements.map((a) => (
          <PressableScale key={a.id} onPress={() => setSelected(a)} scaleTo={0.9} style={styles.item} accessibilityLabel={`${a.title}${a.unlocked ? '' : ', locked'}`}>
            <View style={[styles.medal, { backgroundColor: a.unlocked ? a.color : colors.surfaceMuted }]}>
              <Ionicons name={a.icon} size={24} color={a.unlocked ? colors.textOnPrimary : colors.textSubtle} />
              {!a.unlocked && (
                <View style={styles.lock}>
                  <Ionicons name="lock-closed" size={10} color={colors.textMuted} />
                </View>
              )}
            </View>
            <AppText variant="caption" center numberOfLines={1} color={a.unlocked ? colors.text : colors.textSubtle} style={styles.label}>
              {a.title}
            </AppText>
          </PressableScale>
        ))}
      </ScrollView>

      <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.title}>
        {selected && (
          <>
            <View style={[styles.bigMedal, { backgroundColor: selected.unlocked ? selected.color : colors.surfaceMuted }]}>
              <Ionicons name={selected.icon} size={40} color={selected.unlocked ? colors.textOnPrimary : colors.textSubtle} />
            </View>
            <AppText variant="body" center color={colors.textMuted}>
              {selected.description}
            </AppText>
            <View style={styles.center}>
              <Badge tone={selected.unlocked ? 'success' : 'neutral'} icon={selected.unlocked ? 'checkmark' : 'lock-closed'} label={selected.unlocked ? 'Unlocked' : 'Locked'} />
            </View>
            <Button title="Got it" variant="secondary" onPress={() => setSelected(null)} />
          </>
        )}
      </Sheet>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { gap: spacing.md, paddingRight: spacing.xl },
  item: { width: 72, alignItems: 'center', gap: spacing.xs },
  medal: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  lock: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: fonts.semibold, fontSize: 12 },
  bigMedal: { alignSelf: 'center', width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center' },
}));
