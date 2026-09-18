import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { AppText, Badge, Button, FormError, IconButton, ProgressBar, Sheet, TextField } from '@/components/ui';
import { getErrorMessage } from '@/lib/errors';
import { currencySymbol, formatMoney } from '@/lib/format';
import { colors, fonts, radius, spacing } from '@/theme';
import { useContributeToGoal, useCreateGoal, useDeleteGoal, useGoals } from './useFinance';

type Props = { visible: boolean; onClose: () => void; currency: string };

/** Savings goals: create them, and add money as you go. */
export function GoalsSheet({ visible, onClose, currency }: Props) {
  const { data, isPending, isError, error } = useGoals();
  const createGoal = useCreateGoal();
  const contribute = useContributeToGoal();
  const removeGoal = useDeleteGoal();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  /** Which goal has its "add money" field open, and what's typed in it. */
  const [contributing, setContributing] = useState<{ id: string; amount: string } | null>(null);

  const goals = data?.goals ?? [];
  const targetValue = Number.parseFloat(target.replace(/,/g, ''));
  const valid = name.trim().length > 0 && Number.isFinite(targetValue) && targetValue > 0;

  const save = async () => {
    if (!valid) return;
    setFormError(null);
    try {
      await createGoal.mutateAsync({ name: name.trim(), targetAmount: Math.round(targetValue * 100) });
      setName('');
      setTarget('');
      setAdding(false);
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  const addMoney = async () => {
    if (!contributing) return;
    const value = Number.parseFloat(contributing.amount.replace(/,/g, ''));
    if (!Number.isFinite(value) || value <= 0) return;
    setFormError(null);
    try {
      await contribute.mutateAsync({ id: contributing.id, amount: Math.round(value * 100) });
      setContributing(null);
    } catch (err) {
      setFormError(getErrorMessage(err));
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Savings goals" scroll>
      {isPending && <ActivityIndicator color={colors.primary} />}
      {isError && <FormError message={getErrorMessage(error)} />}

      {!isPending && goals.length === 0 && !adding && (
        <AppText variant="caption">
          A goal gives your saving a target — an emergency fund, a trip, a laptop.
        </AppText>
      )}

      {goals.map((goal) => (
        <View key={goal.id} style={styles.goal}>
          <View style={styles.goalHead}>
            <View style={[styles.icon, goal.achieved && styles.iconDone]}>
              <Ionicons name={goal.achieved ? 'checkmark' : 'flag'} size={16} color={goal.achieved ? colors.success : colors.primary} />
            </View>
            <View style={styles.flex}>
              <AppText variant="bodyStrong">{goal.name}</AppText>
              <AppText variant="caption">
                {formatMoney(goal.savedAmount, currency, { decimals: false })} of{' '}
                {formatMoney(goal.targetAmount, currency, { decimals: false })}
              </AppText>
            </View>
            {goal.achieved && <Badge tone="success" icon="trophy" label="Done" />}
            <IconButton
              icon="trash-outline"
              tone="muted"
              size={32}
              onPress={() => removeGoal.mutate(goal.id)}
              accessibilityLabel={`Delete ${goal.name}`}
            />
          </View>

          <ProgressBar value={Math.min(1, goal.ratio)} color={goal.achieved ? colors.success : colors.primary} />

          {contributing?.id === goal.id ? (
            <View style={styles.contributeRow}>
              <View style={styles.inlineAmount}>
                <AppText color={colors.textMuted} style={styles.inlineSymbol}>
                  {currencySymbol(currency).trim()}
                </AppText>
                <TextInput
                  value={contributing.amount}
                  onChangeText={(t) => setContributing({ id: goal.id, amount: t.replace(/[^0-9.]/g, '') })}
                  placeholder="0"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="decimal-pad"
                  style={styles.inlineInput}
                  autoFocus
                  accessibilityLabel="Amount to add"
                />
              </View>
              <Button title="Add" size="sm" onPress={addMoney} loading={contribute.isPending} />
              <Button title="Cancel" size="sm" variant="ghost" onPress={() => setContributing(null)} />
            </View>
          ) : (
            !goal.achieved && (
              <Button
                title={`Add money · ${formatMoney(goal.remaining, currency, { decimals: false })} to go`}
                size="sm"
                variant="secondary"
                onPress={() => setContributing({ id: goal.id, amount: '' })}
              />
            )
          )}
        </View>
      ))}

      {adding ? (
        <View style={styles.form}>
          <TextField label="Goal" icon="flag-outline" value={name} onChangeText={setName} placeholder="Emergency fund" />
          <View style={styles.amountRow}>
            <AppText style={styles.symbol} color={colors.textMuted}>
              {currencySymbol(currency).trim()}
            </AppText>
            <TextInput
              value={target}
              onChangeText={(t) => setTarget(t.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
              style={styles.amountInput}
              accessibilityLabel="Target amount"
            />
          </View>
          <FormError message={formError} />
          <Button title="Create goal" onPress={save} disabled={!valid} loading={createGoal.isPending} />
          <Button title="Cancel" variant="ghost" size="sm" onPress={() => setAdding(false)} />
        </View>
      ) : (
        <Button
          title="New goal"
          variant="secondary"
          onPress={() => setAdding(true)}
          icon={<Ionicons name="add" size={18} color={colors.text} />}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  goal: { gap: spacing.sm, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDone: { backgroundColor: colors.successSoft },
  contributeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  inlineAmount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    height: 38,
  },
  inlineSymbol: { fontFamily: fonts.semibold, fontSize: 15 },
  inlineInput: { flex: 1, fontFamily: fonts.bold, fontSize: 16, color: colors.text, paddingVertical: 0 },
  form: { gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.md },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  symbol: { fontFamily: fonts.semibold, fontSize: 26, lineHeight: 34 },
  amountInput: { fontFamily: fonts.bold, fontSize: 36, color: colors.text, minWidth: 70, textAlign: 'center', paddingVertical: 0 },
});
