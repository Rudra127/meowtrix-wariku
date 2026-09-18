import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import { Amount, AppText, Badge, Card, ProgressBar } from '@/components/ui';
import type { MoneyFocus } from '@/features/onboarding/options';
import { formatMoney } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';

type Props = { focus: MoneyFocus; currency: string; hidden: boolean };

/**
 * Goal-specific card at the top of the Money tab (chosen in onboarding).
 * PLACEHOLDER numbers — wire to /finance/* when those endpoints exist.
 */
export function FocusCard({ focus, currency, hidden }: Props) {
  switch (focus) {
    case 'budget':
      return (
        <Shell icon="pie-chart" title="September budget" badge="Your focus">
          <Amount minor={2_987_500} currency={currency} size={26} hidden={hidden} />
          <AppText variant="caption">spent of {formatMoney(4_000_000, currency, { decimals: false })} · 11 days left</AppText>
          <ProgressBar value={0.75} color={colors.warning} />
          <Tip text="You’re 5% ahead of plan — dining is the category to watch." />
        </Shell>
      );
    case 'savings':
      return (
        <Shell icon="shield-checkmark" title="Emergency fund" badge="Your focus">
          <Amount minor={4_500_000} currency={currency} size={26} hidden={hidden} />
          <AppText variant="caption">saved of {formatMoney(15_000_000, currency, { decimals: false })} target (6 months of expenses)</AppText>
          <ProgressBar value={0.3} />
          <Tip text={`Saving ${formatMoney(875_000, currency, { decimals: false })}/month gets you there by next September.`} />
        </Shell>
      );
    case 'debt':
      return (
        <Shell icon="card" title="Debt payoff" badge="Your focus">
          <Amount minor={3_840_000} currency={currency} size={26} hidden={hidden} />
          <AppText variant="caption">left on your credit card · next payment 5 Oct</AppText>
          <ProgressBar value={0.42} color={colors.success} />
          <Tip text="Paying the full balance avoids ~36% yearly interest. Avalanche method saves the most." />
        </Shell>
      );
    case 'invest':
      return (
        <Shell icon="trending-up" title="Investments" badge="Your focus">
          <View style={styles.row}>
            <Amount minor={1_624_000} currency={currency} size={26} hidden={hidden} />
            <Badge tone="success" icon="arrow-up" label="8.3%" />
          </View>
          <AppText variant="caption">Index fund SIP · {formatMoney(200_000, currency, { decimals: false })}/month</AppText>
          <Tip text="Staying invested through dips matters more than timing the market." />
        </Shell>
      );
    case 'tip':
    default:
      return (
        <Shell icon="bulb" title="Money tip of the day" badge="For you">
          <AppText variant="bodyStrong">Pay yourself first.</AppText>
          <AppText variant="caption">
            Move a fixed amount to savings on payday, before spending anything. Even 10% adds up fast.
          </AppText>
        </Shell>
      );
  }
}

function Shell({ icon, title, badge, children }: { icon: React.ComponentProps<typeof Ionicons>['name']; title: string; badge: string; children: React.ReactNode }) {
  return (
    <Card elevated style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name={icon} size={18} color={colors.primary} />
        </View>
        <AppText variant="subheading" style={styles.flex}>
          {title}
        </AppText>
        <Badge tone="accent" icon="sparkles" label={badge} />
      </View>
      {children}
    </Card>
  );
}

function Tip({ text }: { text: string }) {
  return (
    <View style={styles.tip}>
      <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
      <AppText variant="caption" color={colors.text} style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.sm, padding: spacing.xl, borderWidth: 1.5, borderColor: colors.accent },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  icon: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tip: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
});
