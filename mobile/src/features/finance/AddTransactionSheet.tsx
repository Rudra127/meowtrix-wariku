import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import type { CategoryId, TransactionType } from '@/api/types';
import { AppText, Button, FormError, PressableScale, SegmentedControl, Sheet, TextField } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { currencySymbol } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { categoryOptions, defaultCategory } from './categories';
import { useCreateTransaction } from './useFinance';

const KINDS = [
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
] as const;

type Props = { visible: boolean; onClose: () => void; currency: string; onSaved?: () => void };

/** Manual quick-add. Writes straight to /finance/transactions. */
export function AddTransactionSheet({ visible, onClose, currency, onSaved }: Props) {
  const create = useCreateTransaction();
  const [type, setType] = useState<TransactionType>('expense');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CategoryId>('food');
  const [error, setError] = useState<string | null>(null);

  const value = Number.parseFloat(amount.replace(/,/g, ''));
  const valid = Number.isFinite(value) && value > 0;

  const reset = () => {
    setAmount('');
    setTitle('');
    setType('expense');
    setCategory('food');
    setError(null);
  };

  const close = () => {
    reset();
    onClose();
  };

  const save = async () => {
    if (!valid) return;
    setError(null);
    try {
      await create.mutateAsync({
        type,
        // Minor units, rounded once here — see root AGENTS.md → Money.
        amount: Math.round(value * 100),
        category,
        title: title.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      reset();
      onSaved?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Sheet visible={visible} onClose={close} title="Add transaction" scroll>
      <SegmentedControl
        options={KINDS}
        value={type}
        onChange={(next) => {
          setType(next);
          setCategory(defaultCategory(next));
        }}
      />

      <View style={styles.amountRow}>
        <AppText style={styles.symbol} color={colors.textMuted}>
          {currencySymbol(currency).trim()}
        </AppText>
        <TextInput
          value={amount}
          onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ''))}
          placeholder="0"
          placeholderTextColor={colors.textSubtle}
          keyboardType="decimal-pad"
          style={styles.amountInput}
          autoFocus
          accessibilityLabel="Amount"
        />
      </View>

      <TextField label="Note" icon="create-outline" value={title} onChangeText={setTitle} placeholder="e.g. Lunch with team" />

      <View style={styles.chips}>
        {categoryOptions(type).map((c) => {
          const active = c.id === category;
          return (
            <PressableScale
              key={c.id}
              onPress={() => setCategory(c.id)}
              style={[styles.chip, active && styles.chipActive]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Ionicons name={c.icon} size={14} color={active ? colors.accent : c.color} />
              <AppText variant="caption" color={active ? colors.textOnPrimary : colors.text} style={styles.chipText}>
                {c.label}
              </AppText>
            </PressableScale>
          );
        })}
      </View>

      <FormError message={error} />

      <Button
        title={type === 'expense' ? 'Add expense' : 'Add income'}
        disabled={!valid}
        loading={create.isPending}
        onPress={save}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  symbol: { fontFamily: fonts.semibold, fontSize: 32, lineHeight: 40 },
  amountInput: { fontFamily: fonts.bold, fontSize: 44, color: colors.text, minWidth: 80, textAlign: 'center', paddingVertical: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    height: 36,
    backgroundColor: colors.surfaceMuted,
  },
  chipActive: { backgroundColor: colors.primary },
  chipText: { fontFamily: fonts.semibold },
});
