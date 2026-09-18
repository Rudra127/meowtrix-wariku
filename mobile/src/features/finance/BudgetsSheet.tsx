import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import type { ExpenseCategory } from '@/api/types';
import { AppText, Badge, Button, FormError, IconButton, PressableScale, ProgressBar, Sheet } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { currencySymbol, formatMoney } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { EXPENSE_OPTIONS, categoryMeta } from './categories';
import { useBudgets, useDeleteBudget, useSetBudget } from './useFinance';

type Props = { visible: boolean; onClose: () => void; currency: string; month?: string };

/** Set and review monthly spending limits per category. */
export function BudgetsSheet({ visible, onClose, currency, month }: Props) {
  const { data, isPending, isError, error } = useBudgets(month);
  const setBudget = useSetBudget();
  const removeBudget = useDeleteBudget();

  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [limit, setLimit] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const budgets = data?.budgets ?? [];
  const value = Number.parseFloat(limit.replace(/,/g, ''));
  const valid = Number.isFinite(value) && value > 0;
  // Categories that already have a limit are edited in place rather than added twice.
  const available = EXPENSE_OPTIONS.filter((o) => !budgets.some((b) => b.category === o.id));

  const save = async () => {
    if (!valid) return;
    setFormError(null);
    try {
      await setBudget.mutateAsync({ category, limit: Math.round(value * 100), month });
      setLimit('');
      setAdding(false);
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Budgets" scroll>
      {isPending && <ActivityIndicator color={colors.primary} />}
      {isError && <FormError message={getErrorMessage(error)} />}

      {!isPending && budgets.length === 0 && !adding && (
        <AppText variant="caption">
          Set a monthly limit for the things you overspend on. Wariku tracks the rest.
        </AppText>
      )}

      {budgets.map((b) => {
        const meta = categoryMeta(b.category);
        const color = b.overspent ? colors.danger : b.ratio > 0.75 ? colors.warning : colors.primary;
        return (
          <View key={b.category} style={styles.row}>
            <View style={styles.rowHead}>
              <View style={[styles.icon, { backgroundColor: meta.soft }]}>
                <Ionicons name={meta.icon} size={16} color={meta.color} />
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{meta.label}</AppText>
                <AppText variant="caption">
                  {formatMoney(b.spent, currency, { decimals: false })} of{' '}
                  {formatMoney(b.limit, currency, { decimals: false })}
                </AppText>
              </View>
              {b.overspent && <Badge tone="danger" icon="alert-circle" label="Over" />}
              <IconButton
                icon="trash-outline"
                tone="muted"
                size={32}
                onPress={() => removeBudget.mutate({ category: b.category, month })}
                accessibilityLabel={`Remove ${meta.label} budget`}
              />
            </View>
            <ProgressBar value={Math.min(1, b.ratio)} color={color} />
          </View>
        );
      })}

      {adding ? (
        <View style={styles.form}>
          <View style={styles.amountRow}>
            <AppText style={styles.symbol} color={colors.textMuted}>
              {currencySymbol(currency).trim()}
            </AppText>
            <TextInput
              value={limit}
              onChangeText={(t) => setLimit(t.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
              style={styles.amountInput}
              autoFocus
              accessibilityLabel="Monthly limit"
            />
          </View>
          <View style={styles.chips}>
            {available.map((o) => {
              const active = o.id === category;
              return (
                <PressableScale
                  key={o.id}
                  onPress={() => setCategory(o.id as ExpenseCategory)}
                  style={[styles.chip, active && styles.chipActive]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                >
                  <Ionicons name={o.icon} size={13} color={active ? colors.accent : o.color} />
                  <AppText variant="caption" color={active ? colors.textOnPrimary : colors.text} style={styles.chipText}>
                    {o.label}
                  </AppText>
                </PressableScale>
              );
            })}
          </View>
          <FormError message={formError} />
          <Button title="Save limit" onPress={save} disabled={!valid} loading={setBudget.isPending} />
          <Button title="Cancel" variant="ghost" size="sm" onPress={() => setAdding(false)} />
        </View>
      ) : (
        <Button
          title="Add a budget"
          variant="secondary"
          onPress={() => {
            setCategory((available[0]?.id as ExpenseCategory) ?? 'food');
            setAdding(true);
          }}
          disabled={available.length === 0}
          icon={<Ionicons name="add" size={18} color={colors.text} />}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { gap: spacing.sm },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { width: 30, height: 30, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  form: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  symbol: { fontFamily: fonts.semibold, fontSize: 26, lineHeight: 34 },
  amountInput: { fontFamily: fonts.bold, fontSize: 36, color: colors.text, minWidth: 70, textAlign: 'center', paddingVertical: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 32,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontFamily: fonts.semibold },
});
