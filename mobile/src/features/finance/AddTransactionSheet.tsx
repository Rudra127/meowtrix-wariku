import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppText, Button, PressableScale, SegmentedControl, Sheet, TextField } from '@/components/ui';
import { currencySymbol } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { categories, type CategoryId, type Transaction } from './sampleData';

type Kind = 'expense' | 'income';
const KINDS = [
  { label: 'Expense', value: 'expense' },
  { label: 'Income', value: 'income' },
] as const;

type Props = { visible: boolean; onClose: () => void; onSave: (tx: Transaction) => void; currency: string };

/** Quick-add sheet. Local-only for now — swap onSave for a POST /finance/transactions mutation. */
export function AddTransactionSheet({ visible, onClose, onSave, currency }: Props) {
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CategoryId>('food');

  const options = Object.values(categories).filter((c) => c.kind === kind);
  const value = Number.parseFloat(amount.replace(/,/g, ''));
  const valid = Number.isFinite(value) && value > 0;

  const reset = () => {
    setAmount('');
    setTitle('');
    setKind('expense');
    setCategory('food');
  };

  const save = () => {
    if (!valid) return;
    const minor = Math.round(value * 100) * (kind === 'expense' ? -1 : 1);
    onSave({
      id: `local-${Date.now()}`,
      title: title.trim() || categories[category].label,
      category,
      amount: minor,
      date: new Date().toISOString(),
    });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    reset();
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Add transaction">
      <SegmentedControl
        options={KINDS}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setCategory(k === 'expense' ? 'food' : 'salary');
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
        {options.map((c) => {
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
      <Button title={kind === 'expense' ? 'Add expense' : 'Add income'} disabled={!valid} onPress={save} />
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
