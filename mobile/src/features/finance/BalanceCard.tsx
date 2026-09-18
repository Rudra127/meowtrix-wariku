import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Amount, AppText, Badge, IconButton, PressableScale, type IconName } from '@/components/ui';
import { colors, fonts, radius, spacing } from '@/theme';

export type BalanceAction = 'voice' | 'add' | 'budgets' | 'goals';

type Action = { key: BalanceAction; label: string; icon: IconName; primary?: boolean };

/**
 * Voice leads deliberately — it's the fastest way to log something and the reason the tab exists.
 * Manual add stays one tap away for corrections and for when speaking isn't an option.
 */
const ACTIONS: Action[] = [
  { key: 'voice', label: 'Speak', icon: 'mic', primary: true },
  { key: 'add', label: 'Add', icon: 'add' },
  { key: 'budgets', label: 'Budgets', icon: 'pie-chart-outline' },
  { key: 'goals', label: 'Goals', icon: 'flag-outline' },
];

type Props = {
  balance: number;
  currency: string;
  hidden: boolean;
  changePct: number;
  onToggleHidden: () => void;
  onAction: (key: BalanceAction) => void;
};

export function BalanceCard({ balance, currency, hidden, changePct, onToggleHidden, onAction }: Props) {
  // Spending *less* than last month is good news, so the arrow follows the direction of travel
  // while the tone stays neutral — this is a factual comparison, not a score.
  const spendingUp = changePct > 0;

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

      <Amount
        minor={balance}
        currency={currency}
        size={38}
        color={colors.textOnPrimary}
        fractionColor={colors.textOnPrimaryMuted}
        hidden={hidden}
      />

      {changePct === 0 ? (
        <Badge tone="glass" icon="remove-outline" label="Same spending as last month" />
      ) : (
        <Badge
          tone="accent"
          icon={spendingUp ? 'trending-up' : 'trending-down'}
          label={`${spendingUp ? '+' : ''}${changePct}% spending vs last month`}
        />
      )}

      <View style={styles.actions}>
        {ACTIONS.map((a) => (
          <PressableScale
            key={a.key}
            onPress={() => onAction(a.key)}
            style={styles.action}
            accessibilityRole="button"
            accessibilityLabel={a.label}
          >
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
