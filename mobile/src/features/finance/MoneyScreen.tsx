import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Amount,
  AppText,
  Button,
  Card,
  IconButton,
  ProgressBar,
  SectionHeader,
  type IconName,
} from '@/components/ui';
import { Reveal, Skeleton, Toast } from '@/components/motion';
import { usePersonalization } from '@/features/onboarding/usePersonalization';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { getErrorMessage } from '@/lib/errors';
import { formatMoney } from '@/lib/format';
import { colors, radius, spacing, TAB_BAR_CLEARANCE, themed, useTheme } from '@/theme';
import { AddTransactionSheet } from './AddTransactionSheet';
import { BalanceCard, type BalanceAction } from './BalanceCard';
import { BudgetsSheet } from './BudgetsSheet';
import { categoryMeta } from './categories';
import { monthName } from './dates';
import { FocusCard } from './FocusCard';
import { GoalsSheet } from './GoalsSheet';
import { SpendingChart } from './SpendingChart';
import { TransactionRow } from './TransactionRow';
import { useFinanceSummary, useRefreshFinance, useTransactions, useVoiceCapabilities } from './useFinance';
import { VoiceCaptureSheet } from './VoiceCaptureSheet';

type OpenSheet = 'voice' | 'add' | 'budgets' | 'goals' | null;

export function MoneyScreen() {
  useTheme(); // re-render on light/dark switch
  const currency = useCurrentUser().data?.currency ?? 'INR';
  const { plan } = usePersonalization();
  const insets = useSafeAreaInsets();

  const summary = useFinanceSummary();
  const recent = useTransactions({ limit: 8 });
  const voice = useVoiceCapabilities();
  const refresh = useRefreshFinance();

  const [hidden, setHidden] = useState(false);
  const [sheet, setSheet] = useState<OpenSheet>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const data = summary.data;
  const transactions = recent.data?.items ?? [];

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const onAction = (key: BalanceAction) => setSheet(key);

  const announce = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2600);
  };

  // First load: the header would otherwise show a confident ₹0 before the real balance arrives.
  if (summary.isPending) {
    return <MoneySkeleton top={insets.top} />;
  }

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        <Reveal>
          <View style={styles.header}>
            <View>
              <AppText variant="label">Overview · {monthName()}</AppText>
              <AppText variant="title">Your money</AppText>
            </View>
            <View style={styles.headerActions}>
              <IconButton
                icon="mic"
                tone="dark"
                onPress={() => setSheet('voice')}
                accessibilityLabel="Add a transaction by voice"
              />
            </View>
          </View>
        </Reveal>

        {summary.isError ? (
          <Card elevated style={styles.errorCard}>
            <Ionicons name="cloud-offline-outline" size={22} color={colors.danger} />
            <AppText variant="bodyStrong">Couldn&apos;t load your money</AppText>
            <AppText variant="caption">{getErrorMessage(summary.error)}</AppText>
            <Button title="Try again" variant="secondary" size="sm" onPress={onRefresh} />
          </Card>
        ) : (
          <>
            <Reveal index={1}>
              <BalanceCard
                balance={data?.balance.total ?? 0}
                currency={currency}
                hidden={hidden}
                changePct={data?.changePct ?? 0}
                onToggleHidden={() => setHidden((h) => !h)}
                onAction={onAction}
              />
            </Reveal>

            {/* Goal from onboarding decides what leads the dashboard */}
            <Reveal index={2}>
              <FocusCard focus={plan.moneyFocus} summary={data} currency={currency} hidden={hidden} />
            </Reveal>

            <Reveal index={3}>
              <SpendingChart currency={currency} />
            </Reveal>

            <Reveal index={4}>
              <View style={styles.grid}>
                <StatTile
                  label="Earned"
                  icon="arrow-down-outline"
                  minor={data?.totals.income ?? 0}
                  currency={currency}
                  note="This month"
                  hidden={hidden}
                  positive
                />
                <StatTile
                  label="Spent"
                  icon="arrow-up-outline"
                  minor={data?.totals.expense ?? 0}
                  currency={currency}
                  note={`${data?.totals.count ?? 0} transactions`}
                  hidden={hidden}
                />
                <StatTile
                  label="Left over"
                  icon="wallet-outline"
                  minor={data?.totals.net ?? 0}
                  currency={currency}
                  note="Income − spending"
                  hidden={hidden}
                  positive={(data?.totals.net ?? 0) >= 0}
                />
                <StatTile
                  label="Budget left"
                  icon="pie-chart-outline"
                  minor={data?.budgetTotals.remaining ?? 0}
                  currency={currency}
                  note={
                    data?.budgetTotals.limit
                      ? `${data.daysLeftInMonth} days to go`
                      : 'No budgets set'
                  }
                  hidden={hidden}
                  positive={(data?.budgetTotals.remaining ?? 0) >= 0}
                />
              </View>
            </Reveal>

            <SectionHeader title="Budgets" action="Manage" onAction={() => setSheet('budgets')} />
            {data && data.budgets.length > 0 ? (
              <Card elevated style={styles.list}>
                {data.budgets.map((b) => {
                  const meta = categoryMeta(b.category);
                  const color = b.overspent ? colors.danger : b.ratio > 0.75 ? colors.warning : colors.primary;
                  return (
                    <View key={b.category} style={styles.budget}>
                      <View style={styles.budgetHead}>
                        <View style={[styles.catIcon, { backgroundColor: meta.soft }]}>
                          <Ionicons name={meta.icon} size={16} color={meta.color} />
                        </View>
                        <AppText variant="bodyStrong" style={styles.flex}>
                          {meta.label}
                        </AppText>
                        <AppText variant="caption">
                          {formatMoney(b.spent, currency, { decimals: false })} /{' '}
                          {formatMoney(b.limit, currency, { decimals: false })}
                        </AppText>
                      </View>
                      <ProgressBar value={Math.min(1, b.ratio)} color={color} />
                    </View>
                  );
                })}
              </Card>
            ) : (
              <EmptyCard
                icon="pie-chart-outline"
                title="No budgets yet"
                body="Set a monthly limit and Wariku will warn you before you overspend."
                action="Add a budget"
                onPress={() => setSheet('budgets')}
              />
            )}

            <SectionHeader title="Savings goals" action="Manage" onAction={() => setSheet('goals')} />
            {data && data.goals.items.length > 0 ? (
              <Card elevated style={styles.list}>
                {data.goals.items.map((goal) => (
                  <View key={goal.id} style={styles.budget}>
                    <View style={styles.budgetHead}>
                      <View style={[styles.catIcon, { backgroundColor: colors.accentSoft }]}>
                        <Ionicons name="flag" size={16} color={colors.brand} />
                      </View>
                      <AppText variant="bodyStrong" style={styles.flex}>
                        {goal.name}
                      </AppText>
                      <AppText variant="caption">
                        {formatMoney(goal.savedAmount, currency, { decimals: false })} /{' '}
                        {formatMoney(goal.targetAmount, currency, { decimals: false })}
                      </AppText>
                    </View>
                    <ProgressBar value={Math.min(1, goal.ratio)} color={goal.achieved ? colors.success : colors.brand} />
                  </View>
                ))}
              </Card>
            ) : (
              <EmptyCard
                icon="flag-outline"
                title="No savings goals"
                body="Give your saving a target — an emergency fund, a trip, new gear."
                action="Create a goal"
                onPress={() => setSheet('goals')}
              />
            )}

            <SectionHeader title="Recent transactions" />
            {recent.isPending ? (
              <Card elevated style={styles.list}>
                {[0, 1, 2].map((i) => (
                  <View key={i} style={styles.skelRow}>
                    <Skeleton width={44} height={44} radius={radius.md} />
                    <View style={styles.skelText}>
                      <Skeleton width="60%" height={13} />
                      <Skeleton width="35%" height={11} />
                    </View>
                  </View>
                ))}
              </Card>
            ) : transactions.length > 0 ? (
              <Card elevated style={styles.list}>
                {transactions.map((tx) => (
                  <TransactionRow key={tx.id} tx={tx} currency={currency} />
                ))}
              </Card>
            ) : (
              <EmptyCard
                icon="mic-outline"
                title="Nothing recorded yet"
                body={
                  voice.data?.speechToText
                    ? 'Tap the mic and say “spent 250 on coffee”. Wariku fills in the rest.'
                    : 'Add your first expense and your dashboard comes alive.'
                }
                action={voice.data?.speechToText ? 'Add by voice' : 'Add a transaction'}
                onPress={() => setSheet(voice.data?.speechToText ? 'voice' : 'add')}
              />
            )}
          </>
        )}
      </ScrollView>

      <Toast message={toast} bottom={TAB_BAR_CLEARANCE} />
      <VoiceCaptureSheet
        visible={sheet === 'voice'}
        onClose={() => setSheet(null)}
        currency={currency}
        speechEnabled={voice.data?.speechToText ?? false}
        onSaved={(count) => announce(`Added ${count} ${count === 1 ? 'transaction' : 'transactions'}`)}
      />
      <AddTransactionSheet
        visible={sheet === 'add'}
        onClose={() => setSheet(null)}
        currency={currency}
        onSaved={() => announce('Transaction added')}
      />
      <BudgetsSheet visible={sheet === 'budgets'} onClose={() => setSheet(null)} currency={currency} />
      <GoalsSheet visible={sheet === 'goals'} onClose={() => setSheet(null)} currency={currency} />
    </View>
  );
}

type TileProps = {
  label: string;
  icon: IconName;
  minor: number;
  currency: string;
  note: string;
  hidden: boolean;
  positive?: boolean;
};

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

function EmptyCard({
  icon,
  title,
  body,
  action,
  onPress,
}: {
  icon: IconName;
  title: string;
  body: string;
  action: string;
  onPress: () => void;
}) {
  return (
    <Card elevated style={styles.emptyCard}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={24} color={colors.brand} />
      </View>
      <AppText variant="bodyStrong">{title}</AppText>
      <AppText variant="caption" center>
        {body}
      </AppText>
      <Button title={action} variant="secondary" size="sm" onPress={onPress} />
    </Card>
  );
}

/** First-load placeholder shaped like the real dashboard, so the page doesn't jump when data lands. */
function MoneySkeleton({ top }: { top: number }) {
  return (
    <View style={[styles.root, styles.content, { paddingTop: top + spacing.md }]}>
      <Skeleton width={110} height={12} />
      <Skeleton width={180} height={28} />
      <View style={styles.skelHero}>
        <Skeleton tone="dark" width="35%" height={12} />
        <Skeleton tone="dark" width="65%" height={38} />
        <View style={styles.skelActions}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} tone="dark" width={54} height={54} radius={27} />
          ))}
        </View>
      </View>
      <Skeleton height={150} radius={radius.lg} />
      <View style={styles.skelActions}>
        <Skeleton width="48%" height={96} radius={radius.lg} />
        <Skeleton width="48%" height={96} radius={radius.lg} />
      </View>
    </View>
  );
}

const styles = themed(() => StyleSheet.create({
  skelHero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md },
  skelActions: { flexDirection: 'row', justifyContent: 'space-between' },
  skelRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  skelText: { flex: 1, gap: spacing.xs + 2 },
  root: { flex: 1, backgroundColor: colors.background },
  content: {
    paddingHorizontal: spacing.xl,
    paddingBottom: TAB_BAR_CLEARANCE,
    gap: spacing.lg,
  },
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
  emptyCard: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorCard: { alignItems: 'center', gap: spacing.sm, padding: spacing.xl },
}));
