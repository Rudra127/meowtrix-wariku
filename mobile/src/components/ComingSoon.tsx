import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Card, Screen } from '@/components/ui';
import { colors, spacing, typography } from '@/theme';

type Props = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  tagline: string;
  /** What this tab will do — mirrors docs/ROADMAP.md so the placeholder doubles as a spec. */
  planned: string[];
};

/** Placeholder for tabs whose feature hasn't been built yet. Delete once the real screen exists. */
export function ComingSoon({ icon, title, tagline, planned }: Props) {
  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.iconWrap}>
          <Ionicons name={icon} size={36} color={colors.primary} />
        </View>
        <Text style={typography.title}>{title}</Text>
        <Text style={[typography.body, styles.muted]}>{tagline}</Text>
      </View>
      <Card>
        <Text style={styles.cardTitle}>Coming soon</Text>
        {planned.map((item) => (
          <View key={item} style={styles.row}>
            <Ionicons name="checkmark-circle-outline" size={18} color={colors.primary} />
            <Text style={[typography.body, styles.flex]}>{item}</Text>
          </View>
        ))}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  muted: { color: colors.textMuted, textAlign: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1 },
});
