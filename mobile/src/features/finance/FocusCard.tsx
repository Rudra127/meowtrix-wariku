import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import type { FinanceSummary } from '@/api/types';
import { Amount, AppText, Badge, Card, ProgressBar, type IconName } from '@/components/ui';
import type { MoneyFocus } from '@/features/onboarding/options';
import { formatMoney } from '@/lib/format';
import { colors, radius, spacing, themed } from '@/theme';
import { categoryMeta } from './categories';

type Props = { focus: MoneyFocus; summary: FinanceSummary | undefined; currency: string; hidden: boolean };

/**
 * The card at the top of the Money tab, chosen by the goal picked during onboarding.
 *
 * Every number comes from `/finance/summary`. When there's nothing recorded yet it says so and
 * points at the mic instead of showing a zero that looks like a real figure.
 */
export function FocusCard({ focus, summary, currency, hidden }: Props) {
  if (!summary) return null;

  const empty = summary.totals.count === 0;
  if (empty) {
    return (
      <Shell icon="mic" title="Start with one expense" badge="Get going">
        <AppText variant="body" color={colors.textMuted}>
          Tap <AppText variant="bodyStrong">Speak</AppText> and say something like “spent 250 on coffee”. Wariku
          works out the amount and category for you.
        </AppText>
      </Shell>
    );
  }

  switch (focus) {
    case 'budget': {
      const { limit, spent, remaining } = summary.budgetTotals;
      if (limit === 0) {
        return (
          <Shell icon="pie-chart" title="Set your first budget" badge="Your focus">
            <AppText variant="caption">
              You&apos;ve spent {formatMoney(summary.totals.expense, currency, { decimals: false })} this month. Set a
              limit and Wariku will track it for you.
            </AppText>
          </Shell>
        );
      }
      const ratio = spent / limit;
      return (
        <Shell icon="pie-chart" title="This month's budget" badge="Your focus">
          <Amount minor={spent} currency={currency} size={26} hidden={hidden} />
          <AppText variant="caption">
            spent of {formatMoney(limit, currency, { decimals: false })} · {summary.daysLeftInMonth} days left
          </AppText>
          <ProgressBar value={Math.min(1, ratio)} color={ratio > 0.9 ? colors.danger : ratio > 0.75 ? colors.warning : colors.brand} />
          <Tip
            text={
              remaining < 0
                ? `You're ${formatMoney(-remaining, currency, { decimals: false })} over your limits.`
                : `${formatMoney(remaining, currency, { decimals: false })} left across your budgets.`
            }
          />
        </Shell>
      );
    }

    case 'savings': {
      const goal = summary.goals.items[0];
      if (!goal) {
        return (
          <Shell icon="shield-checkmark" title="Build your safety net" badge="Your focus">
            <AppText variant="caption">
              Create a savings goal and Wariku will track your progress toward it.
            </AppText>
          </Shell>
        );
      }
      return (
        <Shell icon="shield-checkmark" title={goal.name} badge="Your focus">
          <Amount minor={goal.savedAmount} currency={currency} size={26} hidden={hidden} />
          <AppText variant="caption">
            saved of {formatMoney(goal.targetAmount, currency, { decimals: false })} target
          </AppText>
          <ProgressBar value={Math.min(1, goal.ratio)} />
          <Tip
            text={
              goal.achieved
                ? 'Goal reached — nice work.'
                : `${formatMoney(goal.remaining, currency, { decimals: false })} to go.`
            }
          />
        </Shell>
      );
    }

    case 'debt': {
      const emi = summary.byCategory.find((c) => c.category === 'emi');
      return (
        <Shell icon="card" title="Debt payments" badge="Your focus">
          <Amount minor={emi?.total ?? 0} currency={currency} size={26} hidden={hidden} />
          <AppText variant="caption">
            {emi ? `paid toward loans and cards this month` : 'No loan or EMI payments logged this month'}
          </AppText>
          <Tip text="Clearing the highest-interest balance first costs you the least overall." />
        </Shell>
      );
    }

    case 'invest': {
      const invested = summary.highlights.invested;
      return (
        <Shell icon="trending-up" title="Invested this month" badge="Your focus">
          <Amount minor={invested} currency={currency} size={26} hidden={hidden} />
          <AppText variant="caption">
            {invested > 0
              ? 'logged under Investments'
              : 'Nothing logged yet — add a SIP or purchase under Investments'}
          </AppText>
          <Tip text="Ask the AI about your holdings once you've connected Zerodha in Profile." />
        </Shell>
      );
    }

    case 'tip':
    default: {
      const top = summary.topCategory;
      if (!top) {
        return (
          <Shell icon="bulb" title="Money tip of the day" badge="For you">
            <AppText variant="bodyStrong">Pay yourself first.</AppText>
            <AppText variant="caption">
              Move a fixed amount to savings on payday, before spending anything. Even 10% adds up fast.
            </AppText>
          </Shell>
        );
      }
      const meta = categoryMeta(top.category);
      return (
        <Shell icon="bulb" title="Where your money went" badge="For you">
          <AppText variant="bodyStrong">
            {meta.label} is your biggest expense this month.
          </AppText>
          <AppText variant="caption">
            {formatMoney(top.total, currency, { decimals: false })} across {top.count}{' '}
            {top.count === 1 ? 'transaction' : 'transactions'}.
          </AppText>
          <Tip text="Knowing your biggest category is the first step to changing it." />
        </Shell>
      );
    }
  }
}

function Shell({
  icon,
  title,
  badge,
  children,
}: {
  icon: IconName;
  title: string;
  badge: string;
  children: React.ReactNode;
}) {
  return (
    <Card elevated style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Ionicons name={icon} size={18} color={colors.brand} />
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
      <Ionicons name="sparkles-outline" size={14} color={colors.brand} />
      <AppText variant="caption" color={colors.text} style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: spacing.sm, padding: spacing.xl, borderWidth: 1.5, borderColor: colors.accent },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  icon: { width: 34, height: 34, borderRadius: radius.sm, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  tip: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.xs,
  },
}));
