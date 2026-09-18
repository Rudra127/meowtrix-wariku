import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Amount, AppText, Badge, Button, Card, IconButton, ProgressBar, Screen, SectionHeader, Sheet, type IconName } from '@/components/ui';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { formatMoney } from '@/lib/format';
import { colors, radius, spacing } from '@/theme';
import { AddTransactionSheet } from './AddTransactionSheet';
import { BalanceCard } from './BalanceCard';
import { monthName } from './dates';
import { budgets, categories, openingBalance, sampleTransactions, summary, type Transaction } from './sampleData';
import { SpendingChart } from './SpendingChart';
import { TransactionRow } from './TransactionRow';

const COMING_SOON: Record<string, { title: string; body: string; icon: IconName }> = {
  transfer: { title: 'Transfers', body: 'Move money between your accounts and keep balances in sync.', icon: 'swap-horizontal' },
  budgets: { title: 'Budgets', body: 'Set monthly limits per category and get nudges before you overspend.', icon: 'pie-chart' },
  goals: { title: 'Savings goals', body: 'Save toward a trip, a laptop or an emergency fund with progress tracking.', icon: 'flag' },
  notifications: { title: 'Notifications', body: 'Bill reminders, budget alerts and weekly summaries.', icon: 'notifications' },
  all: { title: 'All transactions', body: 'Search, filter by category and date, and export.', icon: 'list' },
};

export function MoneyScreen() {
  const currency = useCurrentUser().data?.currency ?? 'INR';
  const [transactions, setTransactions] = useState<Transaction[]>(sampleTransactions);
  const [hidden, setHidden] = useState(false);
  const [adding, setAdding] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  // Local-only additions adjust the sample balance so the UI feels real.
  const balance = useMemo(() => {
    const added = transactions.filter((t) => t.id.startsWith('local-')).reduce((s, t) => s + t.amount, 0);
    return openingBalance + added;
  }, [transactions]);

  const onAction = (key: string) => (key === 'add' ? setAdding(true) : setInfo(key));
  const soon = info ? COMING_SOON[info] : null;

  return (
    <Screen tabBarSpace>
      <View style={styles.header}>
        <View>
          <AppText variant="label">Overview · {monthName()}</AppText>
          <AppText variant="title">Your money</AppText>
        </View>
        <View style={styles.headerActions}>
          <IconButton icon="notifications-outline" onPress={() => setInfo('notifications')} accessibilityLabel="Notifications" />
          <IconButton icon="add" tone="dark" onPress={() => setAdding(true)} accessibilityLabel="Add transaction" />
        </View>
      </View>

      <BalanceCard
        balance={balance}
        currency={currency}
        hidden={hidden}
        changePct={summary.changePct}
        onToggleHidden={() => setHidden((h) => !h)}
        onAction={onAction}
      />

      <Badge label="Preview · sample data, changes stay on this device" icon="construct-outline" />

      <SpendingChart currency={currency} />

      <View style={styles.grid}>
        <StatTile label="Spent" icon="arrow-up-outline" minor={summary.spent} currency={currency} note="This month" hidden={hidden} />
        <StatTile label="Saved" icon="shield-checkmark-outline" minor={summary.saved} currency={currency} note="+12% vs Aug" hidden={hidden} positive />
        <StatTile label="Invested" icon="trending-up-outline" minor={summary.invested} currency={currency} note="SIPs & stocks" hidden={hidden} />
        <StatTile label="Budget left" icon="wallet-outline" minor={summary.budgetLeft} currency={currency} note="11 days to go" hidden={hidden} />
      </View>

      <SectionHeader title="Budgets" action="Manage" onAction={() => setInfo('budgets')} />
      <Card elevated style={styles.list}>
        {budgets.map((b) => {
          const cat = categories[b.category];
          const ratio = b.spent / b.limit;
          const color = ratio > 0.9 ? colors.danger : ratio > 0.75 ? colors.warning : colors.primary;
          return (
            <View key={b.category} style={styles.budget}>
              <View style={styles.budgetHead}>
                <View style={[styles.catIcon, { backgroundColor: cat.soft }]}>
                  <Ionicons name={cat.icon} size={16} color={cat.color} />
                </View>
                <AppText variant="bodyStrong" style={styles.flex}>
                  {cat.label}
                </AppText>
                <AppText variant="caption">
                  {formatMoney(b.spent, currency, { decimals: false })} / {formatMoney(b.limit, currency, { decimals: false })}
                </AppText>
              </View>
              <ProgressBar value={ratio} color={color} />
            </View>
          );
        })}
      </Card>

      <SectionHeader title="Recent transactions" action="See all" onAction={() => setInfo('all')} />
      <Card elevated style={styles.list}>
        {transactions.slice(0, 8).map((tx) => (
          <TransactionRow key={tx.id} tx={tx} currency={currency} />
        ))}
      </Card>

      <AddTransactionSheet
        visible={adding}
        onClose={() => setAdding(false)}
        currency={currency}
        onSave={(tx) => setTransactions((prev) => [tx, ...prev])}
      />

      <Sheet visible={!!soon} onClose={() => setInfo(null)} title={soon?.title}>
        {soon && (
          <>
            <View style={styles.soonIcon}>
              <Ionicons name={soon.icon} size={28} color={colors.primary} />
            </View>
            <AppText variant="body" color={colors.textMuted}>
              {soon.body}
            </AppText>
            <Badge label="Coming soon" tone="accent" icon="sparkles" />
            <Button title="Got it" variant="secondary" onPress={() => setInfo(null)} />
          </>
        )}
      </Sheet>
    </Screen>
  );
}

type TileProps = { label: string; icon: IconName; minor: number; currency: string; note: string; hidden: boolean; positive?: boolean };

function StatTile({ label, icon, minor, currency, note, hidden, positive }: TileProps) {
  return (
    <Card elevated style={styles.tile}>
      <View style={styles.tileHead}>
        <AppText variant="label">{label}</AppText>
        <View style={styles.tileIcon}>
          <Ionicons name={icon} size={14} color={colors.text} />
        </View>
      </View>
      <Amount minor={minor} currency={currency} size={20} hidden={hidden} />
      <AppText variant="caption" color={positive ? colors.success : colors.textMuted}>
        {note}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerActions: { flexDirection: 'row', gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tile: { width: '47.8%', flexGrow: 1, gap: spacing.xs },
  tileHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  tileIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { gap: spacing.xs, paddingVertical: spacing.md },
  budget: { gap: spacing.sm, paddingVertical: spacing.xs },
  budgetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  catIcon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  soonIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
