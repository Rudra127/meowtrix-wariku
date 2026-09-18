import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Amount, AppText, Badge, IconButton, PressableScale, type IconName } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/theme';

type Action = { key: string; label: string; icon: IconName; primary?: boolean };
const ACTIONS: Action[] = [
  { key: 'add', label: 'Add', icon: 'add', primary: true },
  { key: 'transfer', label: 'Transfer', icon: 'swap-horizontal' },
  { key: 'budgets', label: 'Budgets', icon: 'pie-chart-outline' },
  { key: 'goals', label: 'Goals', icon: 'flag-outline' },
];

type Props = {
  balance: number;
  currency: string;
  hidden: boolean;
  changePct: number;
  onToggleHidden: () => void;
  onAction: (key: string) => void;
};

export function BalanceCard({ balance, currency, hidden, changePct, onToggleHidden, onAction }: Props) {
  return (
    <View style={styles.card}>
      <View style={[styles.ring, { width: 260, height: 260, right: -90, top: -110 }]} />
      <View style={[styles.ring, { width: 160, height: 160, right: -30, top: -50 }]} />

      <View style={styles.top}>
        <AppText variant="label" color={colors.textOnPrimaryMuted}>
          Total balance
        </AppText>
        <IconButton
          icon={hidden ? 'eye-off-outline' : 'eye-outline'}
          tone="glass"
          size={34}
          onPress={onToggleHidden}
          accessibilityLabel={hidden ? 'Show balance' : 'Hide balance'}
        />
      </View>
      <Amount minor={balance} currency={currency} size={38} color={colors.textOnPrimary} fractionColor={colors.textOnPrimaryMuted} hidden={hidden} />
      <Badge
        tone="accent"
        icon={changePct >= 0 ? 'trending-up' : 'trending-down'}
        label={`${changePct >= 0 ? '+' : ''}${changePct}% vs last month`}
      />

      <View style={styles.actions}>
        {ACTIONS.map((a) => (
          <PressableScale key={a.key} onPress={() => onAction(a.key)} style={styles.action} accessibilityRole="button" accessibilityLabel={a.label}>
            <View style={[styles.actionIcon, a.primary && styles.actionPrimary]}>
              <Ionicons name={a.icon} size={22} color={a.primary ? colors.primary : colors.textOnPrimary} />
            </View>
            <AppText variant="caption" color={colors.textOnPrimaryMuted} style={styles.actionLabel}>
              {a.label}
            </AppText>
          </PressableScale>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.sm, overflow: 'hidden' },
  ring: { position: 'absolute', borderRadius: 999, borderWidth: 1.5, borderColor: 'rgba(200,241,105,0.16)' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg },
  action: { alignItems: 'center', gap: spacing.xs + 2, minWidth: 64 },
  actionIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: colors.accent },
  actionLabel: { fontFamily: fonts.semibold },
});
